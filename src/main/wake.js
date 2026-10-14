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

// Diagnóstico de micro 3 s (Ajustes). [] si no se puede.
function micCheck() {
  return new Promise((resolve) => {
    const useExe = fs.existsSync(WAKE_EXE)
    const cmd = useExe ? WAKE_EXE : 'python'
    const args = useExe ? ['--mic-check'] : [path.join(__dirname, 'wake.py'), '--mic-check']
    execFile(cmd, args, { timeout: 30000 }, (err, stdout) => {
      if (err) return resolve({ ok: false, error: 'no se pudo probar' })
      try {
        for (const line of String(stdout).split('\n')) {
          const t = line.trim()
          if (!t || !t.startsWith('{')) continue
          const o = JSON.parse(t)
          if (o.verdict || o.error) return resolve(o)
        }
        resolve({ ok: false, error: 'sin respuesta' })
      } catch { resolve({ ok: false, error: 'respuesta rota' }) }
    })
  })
}

// Nombres de micros: PortAudio los trae rotos (mojibake UTF-8→latin1,
// trunques MME de 32 letras, triplicados por API, basura @System32/%1).
// Se limpian aquí (vale para exe y dev). Puro → testeable.
function cleanDeviceName(name) {
  let s = String(name || '')
  // 1. Mojibake: "micrÃ³fono" -> "micrófono" (solo si el arreglo limpia).
  if (/Ã/.test(s)) {
    try {
      const fixed = Buffer.from(s, 'latin1').toString('utf8')
      if (!/[ÃÂ]/.test(fixed)) s = fixed
    } catch {}
  }
  // 2. Resource strings: "@System32\...\bthhfenum.sys,#2;%1 ..." -> fuera.
  s = s.replace(/@System32[^;]*;/gi, '')
  s = s.replace(/%[0-9]/g, '')
  s = s.replace(/[\r\n\t]+/g, ' ')
  s = s.replace(/\s*;\s*\(/g, ' (')
  // 3. Colapsar y recortar.
  s = s.replace(/\s+/g, ' ').replace(/^[;,\s]+|[;,\s]+$/g, '').trim()
  return s.slice(0, 80)
}

const JUNK_MIC = /^(input\s*\(\))?$/i
const MAPPER_MIC = /asignador de sonido|controlador primario/i

function cleanDevices(devs) {
  const out = []
  for (const d of devs || []) {
    const name = cleanDeviceName(d && d.name)
    if (!name || JUNK_MIC.test(name) || MAPPER_MIC.test(name)) continue
    // 4. Deduplicar: mismo micro por 3 APIs (uno trunco). Si uno contiene
    // al otro como prefijo, es el mismo: queda el más largo (más info).
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9áéíóúñü]/g, '')
    const key = norm(name)
    let dup = -1
    for (let i = 0; i < out.length; i++) {
      const ok = norm(out[i].name)
      if (ok.startsWith(key) || key.startsWith(ok)) { dup = i; break }
    }
    if (dup < 0) out.push({ index: d.index, name })
    else if (name.length > out[dup].name.length) out[dup] = { index: d.index, name }
  }
  return out
}

// Lista micrófonos vía wake (exe) o wake.py (dev). Limpios. [] si no se puede.
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
          if (o.devices) return resolve(cleanDevices(o.devices))
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
let onIdle = null
let running = false
let _buffer = ''
let _gen = 0
let _retryDelay = 200
let _retryCount = 0
let _startTime = 0
let _wakeWord = 'asistente'

// Puro: "pausa la escucha"->off, "reanuda la escucha"->on, resto null.
// OJO: por voz solo sirve pausar (apagado no oye); reanudar va por
// bandeja, botón o caja escrita.
function parseWakeToggle(text) {
  const t = String(text || '').toLowerCase().trim()
  if (/^(pausa|pausar|det[eé]n|apaga|apagar|silencia|desactiva|deja de|para de)\b.*\b(escucha|micro|o[ií]dos|detecci[oó]n)/.test(t)) return 'off'
  if (/^(reanuda|reanudar|activa|activar|enciende|encender|vuelve)\b.*\b(escucha|micro|o[ií]dos|detecci[oó]n|vox\b)/.test(t)) return 'on'
  return null
}

// Pura y testeable: argv para wake.exe/wake.py.
function wakeArgs(wakeWord, opts = {}) {
  const args = []
  const w = wakeWord || _wakeWord
  if (w) args.push(w)
  if (opts.device) args.push('--device', String(opts.device))
  if (opts.endPause) args.push('--end-pause', String(opts.endPause))
  if (opts.patience) args.push('--patience', String(opts.patience))
  if (opts.modelDir) args.push('--model-dir', String(opts.modelDir))
  return args
}

// B4: qué modelo usar. Grande solo si verifica COMPLETO (no basta un resto).
// → {kind:'large'|'small', dir|null}. dir null = el rápido empaquetado.
function resolveModel(modelsDir) {
  try {
    const mc = require('./modelcheck')
    const r = mc.checkLargeModel(modelsDir)
    if (r.ok) return { kind: 'large', dir: r.dir }
  } catch {}
  return { kind: 'small', dir: null }
}

function start(wakeWord, opts = {}) {
  if (wakeWord) _wakeWord = wakeWord
  if (running) return true
  // VOXDESK_NO_WAKE=1: boot de verificación sin abrir el micro.
  if (process.env.VOXDESK_NO_WAKE === '1') {
    running = false
    if (onDown) onDown('Motor de voz desactivado (modo verificación)')
    return false
  }
  if (!fs.existsSync(WAKE_EXE)) {
    running = false
    if (onDown) onDown('No se encontró el motor de voz (wake.exe no está junto a la app)')
    return false
  }
  running = true
  _buffer = ''
  const gen = ++_gen
  const args = wakeArgs(wakeWord, opts)
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
        } else if (parsed.silent) {
          if (onIdle) onIdle()
} else if (parsed.level !== undefined) {
        if (onLevel) onLevel(parsed.level, parsed.speaking, parsed.vad || 'listening', parsed.clipped === true)
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
    // Onefile lanza un hijo real: matar solo al padre lo deja huérfano.
    try {
      require('child_process').execSync(`taskkill /F /T /PID ${proc.pid}`, { timeout: 5000, windowsHide: true, stdio: 'ignore' })
    } catch {}
    try { proc.kill() } catch {}
    proc = null
  }
  running = false
  _buffer = ''
}

function isRunning() {
  return running
}

// B3: puerta anti-eco — mientras Vox habla solo entra lo intencional
// (palabra de activación recién dicha). El eco sin wake previo se ignora.
function shouldHear(speaking, lastWakeAt, now) {
  if (!speaking) return true
  return (now || Date.now()) - (lastWakeAt || 0) < 8000
}

function enginePath() {
  return fs.existsSync(WAKE_EXE) ? WAKE_EXE : null
}

module.exports = { start, stop, isRunning, listDevices, micCheck, cleanDevices, cleanDeviceName, parseWakeToggle, shouldHear, enginePath, wakeArgs, resolveModel, set onWake(v) { onWake = v }, set onText(v) { onText = v }, set onError(v) { onError = v }, set onLevel(v) { onLevel = v }, set onDown(v) { onDown = v }, set onIdle(v) { onIdle = v } }
