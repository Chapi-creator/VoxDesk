const { spawn, execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const logger = require('./logger')

function isPackaged() {
  try { return require('electron').app.isPackaged } catch { return false }
}

const WAKE_EXE = (() => {
  if (isPackaged()) return path.join(process.resourcesPath, 'wake.exe')
  return path.join(__dirname, '..', '..', 'dist', 'wake.exe')
})()

// Lista micrófonos vía wake (exe) o wake.py (dev). [] si no se puede.
function listDevices() {
  return new Promise((resolve) => {
    const useExe = fs.existsSync(WAKE_EXE)
    const cmd = useExe ? WAKE_EXE : 'python'
    const args = useExe ? ['--list-devices'] : [path.join(__dirname, 'wake.py'), '--list-devices']
    execFile(cmd, args, { timeout: 20000 }, (err, stdout) => {
      if (err) return resolve([])
      try {
        for (const line of String(stdout).split('\n')) {
          const t = line.trim()
          if (!t) continue
          const o = JSON.parse(t)
          if (o.devices) return resolve(o.devices)
          if (o.error) return resolve([])
        }
        resolve([])
      } catch { resolve([]) }
    })
  })
}

let proc = null
let onWake = null
let onText = null
let onError = null
let onLevel = null
let onDown = null
let running = false
let _buffer = ''
let _gen = 0
let _retryDelay = 200
let _retryCount = 0
let _startTime = 0
let _wakeWord = 'asistente'

function start(wakeWord, opts = {}) {
  if (wakeWord) _wakeWord = wakeWord
  if (running) return true
  if (!fs.existsSync(WAKE_EXE)) {
    running = false
    if (onDown) onDown('No se encontró el motor de voz (wake.exe no está junto a la app)')
    return false
  }
  running = true
  _buffer = ''
  const gen = ++_gen
  const args = []
  if (wakeWord) args.push(wakeWord)
  else if (_wakeWord) args.push(_wakeWord)
  if (opts.device) args.push('--device', String(opts.device))
  if (opts.endPause) args.push('--end-pause', String(opts.endPause))

  _startTime = Date.now()
  const p = spawn(WAKE_EXE, args, {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  proc = p

  p.stdout.on('data', (data) => {
    _buffer += data.toString()
    const lines = _buffer.split('\n')
    _buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed.wake) {
          if (onWake) onWake(parsed.command || '')
        } else if (parsed.text) {
          if (onText) onText(parsed.text)
        } else if (parsed.error) {
          if (onError) onError(parsed.error)
        } else if (parsed.level !== undefined) {
          if (onLevel) onLevel(parsed.level, parsed.speaking, parsed.vad || 'listening')
        }
      } catch (e) { logger.warn('wake.exe parse error:', trimmed.substring(0, 100), e.message) }
    }
  })

  p.stderr.on('data', (data) => { logger.warn('wake.exe stderr:', data.toString().trim().substring(0, 500)) })

  p.on('close', () => {
    if (gen !== _gen) return
    proc = null
    if (running) {
      running = false
      if (Date.now() - _startTime < 5000) {
        _retryDelay = Math.min(_retryDelay * 2, 30000)
        _retryCount++
      } else {
        _retryDelay = 200
        _retryCount = 0
      }
      if (_retryCount < 5) {
        setTimeout(() => start(), _retryDelay)
      } else if (onDown) {
        onDown('La detección de voz se detuvo: revisa que el micrófono esté disponible')
      }
    }
  })

  p.on('error', () => {
    if (gen !== _gen) return
    proc = null
    running = false
    if (onDown) onDown('No se pudo iniciar la detección de voz')
  })

  return true
}

function stop() {
  if (proc) {
    try { proc.kill() } catch {}
    proc = null
  }
  running = false
  _buffer = ''
}

function isRunning() {
  return running
}

module.exports = { start, stop, isRunning, listDevices, set onWake(v) { onWake = v }, set onText(v) { onText = v }, set onError(v) { onError = v }, set onLevel(v) { onLevel = v }, set onDown(v) { onDown = v } }
