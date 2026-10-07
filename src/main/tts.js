const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

let _ttsSuffix = 0
function psScript() { return path.join(os.tmpdir(), `_ai_tts_${process.pid}_${++_ttsSuffix}.ps1`) }
let _available = null
let _child = null

function escapeSingle(str) { return str.replace(/'/g, "''") }

function speak(text) {
  if (_child) stop()
  return new Promise((resolve) => {
    const msg = escapeSingle(text.replace(/['"]/g, '').substring(0, 2000))
    const ps = `try {
  $v = New-Object -ComObject SAPI.SpVoice -ErrorAction Stop
  $v.Speak('${msg}')
} catch {
  try {
    Add-Type -AssemblyName System.Speech -ErrorAction Stop
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $s.Speak('${msg}')
    $s.Dispose()
  } catch {
    exit 1
  }
}`
    const psFile = psScript()
    fs.writeFileSync(psFile, '\ufeff' + ps, 'utf8')
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `"${psFile}"`], { windowsHide: true })
    _child = child
    child.on('close', (code) => {
      if (_child === child) _child = null
      try { fs.unlinkSync(psFile) } catch {}
      if (code !== 0) _available = false
      resolve()
    })
    child.on('error', () => {
      if (_child === child) _child = null
      try { fs.unlinkSync(psFile) } catch {}
      _available = false
      resolve()
    })
  })
}

function stop() {
  if (_child) {
    try { _child.kill() } catch {}
    _child = null
  }
}

function isAvailable() {
  if (_available !== null) return _available
  try {
    const psFile = psScript()
    const ps = `try { $v = New-Object -ComObject SAPI.SpVoice -ErrorAction Stop; exit 0 } catch { exit 1 }`
    fs.writeFileSync(psFile, '\ufeff' + ps, 'utf8')
    require('child_process').execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`,
      { timeout: 5000, stdio: 'ignore' }
    )
    try { fs.unlinkSync(psFile) } catch {}
    _available = true
  } catch {
    _available = false
  }
  return _available
}

module.exports = { speak, stop, isAvailable }
