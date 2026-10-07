const { spawn, execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const config = require('./config')

let _ttsSuffix = 0
function psScript() { return path.join(os.tmpdir(), `_ai_tts_${process.pid}_${++_ttsSuffix}.ps1`) }
let _available = null
let _child = null
let _gen = null

function escapeSingle(str) { return str.replace(/'/g, "''") }

// Voces Piper empaquetadas (vendor/piper + vendor/voices). MIT.
const VOICE_FILES = { mexicana: 'es_MX-ald-medium.onnx', espana: 'es_ES-davefx-medium.onnx' }

function vendorBase() {
  try {
    const app = require('electron').app
    if (app.isPackaged) return process.resourcesPath
  } catch {}
  return path.join(__dirname, '..', '..', 'vendor')
}

// Qué motor usar. Solo lee config + disco → testeable.
function getEngine(voicePref) {
  const pref = voicePref || config.load().voice || 'mexicana'
  if (pref !== 'sistema') {
    const base = vendorBase()
    const exe = path.join(base, 'piper', 'piper.exe')
    const model = path.join(base, 'voices', VOICE_FILES[pref] || VOICE_FILES.mexicana)
    if (fs.existsSync(exe) && fs.existsSync(model)) return { engine: 'piper', exe, model }
  }
  return { engine: 'sapi' }
}

function speak(text) {
  if (_child) stop()
  if (_gen) { try { _gen.kill() } catch {}; _gen = null }
  const eng = getEngine()
  if (eng.engine === 'piper') return piperSpeak(text, eng)
  return sapiSpeak(text)
}

function piperSpeak(text, eng) {
  return new Promise((resolve) => {
    const msg = text.replace(/['"]/g, '').substring(0, 2000)
    const wav = path.join(os.tmpdir(), `_ai_vox_${process.pid}_${++_ttsSuffix}.wav`)
    _gen = execFile(eng.exe, ['--model', eng.model, '--output_file', wav], { timeout: 60000, windowsHide: true }, (err) => {
      _gen = null
      if (err || !fs.existsSync(wav)) {
        try { fs.unlinkSync(wav) } catch {}
        sapiSpeak(text).then(resolve)
        return
      }
      const ps = `try { $p = New-Object Media.SoundPlayer '${escapeSingle(wav)}'; $p.PlaySync() } catch { exit 1 }`
      const psFile = psScript()
      fs.writeFileSync(psFile, '﻿' + ps, 'utf8')
      const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `"${psFile}"`], { windowsHide: true })
      _child = child
      const done = (ok) => {
        if (_child === child) _child = null
        try { fs.unlinkSync(psFile) } catch {}
        try { fs.unlinkSync(wav) } catch {}
        if (!ok) _available = false
        resolve()
      }
      child.on('close', (code) => done(code === 0))
      child.on('error', () => done(false))
    })
    try {
      if (_gen && _gen.stdin) { _gen.stdin.write(msg); _gen.stdin.end() }
    } catch {}
  })
}

function sapiSpeak(text) {
  return new Promise((resolve) => {
    const msg = escapeSingle(text.replace(/['"]/g, '').substring(0, 2000))
    const ps = `try {
  $v = New-Object -ComObject SAPI.SpVoice -ErrorAction Stop
  $es = @($v.GetVoices() | Where-Object { $_.GetAttribute('Language') -match '0A$' })[0]
  if ($es) { $v.Voice = $es }
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
    fs.writeFileSync(psFile, '﻿' + ps, 'utf8')
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
  if (_gen) {
    try { _gen.kill() } catch {}
    _gen = null
  }
}

function isAvailable() {
  if (getEngine().engine === 'piper') return true
  if (_available !== null) return _available
  try {
    const psFile = psScript()
    const ps = `try { $v = New-Object -ComObject SAPI.SpVoice -ErrorAction Stop; exit 0 } catch { exit 1 }`
    fs.writeFileSync(psFile, '﻿' + ps, 'utf8')
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

module.exports = { speak, stop, isAvailable, getEngine }
