const { spawn, execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const config = require('./config')
const logger = require('./logger')

let _ttsSuffix = 0
function psScript() { return path.join(os.tmpdir(), `_ai_tts_${process.pid}_${++_ttsSuffix}.ps1`) }
let _available = null
let _child = null
let _gen = null
let _speakToken = 0

function escapeSingle(str) { return str.replace(/'/g, "''") }

// Voces Piper empaquetadas (vendor/piper + vendor/voices). MIT.
const VOICE_FILES = { mexicana: 'es_MX-claude-high.onnx', espana: 'es_ES-sharvard-medium.onnx', argentina: 'es_AR-daniela-high.onnx' }

function vendorBase() {
  try {
    const app = require('electron').app
    if (app.isPackaged) return process.resourcesPath
  } catch {}
  return path.join(__dirname, '..', '..', 'vendor')
}

// Velocidad 0.5..2 (1 = normal). SAPI usa Rate -10..10, Piper length_scale.
function voiceRate() {
  try {
    const r = parseFloat(config.load().voiceRate)
    if (r >= 0.5 && r <= 2) return r
  } catch {}
  return 1
}

// Qué motor usar. Solo lee config + disco → testeable.
// baseOverride solo para tests. customs viven en voices/custom/.
function getEngine(voicePref, baseOverride) {
  const pref = voicePref || config.load().voice || 'mexicana'
  if (pref === 'edge') return { engine: 'edge', voice: config.load().edgeVoice || 'es-MX-DaliaNeural' }
  if (pref !== 'sistema') {
    const base = baseOverride || vendorBase()
    let rel = VOICE_FILES[pref]
    if (!rel && pref.startsWith('custom:')) rel = path.join('custom', pref.slice(7))
    if (rel) {
      const exe = path.join(base, 'piper', 'piper.exe')
      const model = path.join(base, 'voices', rel)
      if (fs.existsSync(exe) && fs.existsSync(model)) return { engine: 'piper', exe, model }
    }
  }
  return { engine: 'sapi' }
}

function speak(text) {
  const tok = ++_speakToken
  if (_child) stop()
  if (_gen) { try { _gen.kill() } catch {}; _gen = null }
  const eng = getEngine()
  try { logger.info('tts motor:', eng.engine) } catch {}
  if (eng.engine === 'piper') return piperSpeak(text, eng, tok)
  if (eng.engine === 'edge') return edgeSpeak(text, eng, tok)
  return sapiSpeak(text)
}

// Edge-TTS online (experimental: servicio no oficial, puede no responder).
// Timeout duro 15s + fallback SAPI. Nada se cuelga.
function edgeSpeak(text, eng, tok) {
  return new Promise((resolve) => {
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      if (tok !== _speakToken) { resolve(); return }
      resolve(ok)
    }
    const timer = setTimeout(() => {
      try { logger.warn('edge timeout, voy a SAPI') } catch {}
      sapiSpeak(text).then(() => finish(true))
    }, 15000)
    ;(async () => {
      try {
        const { Communicate } = require('@travisvn/edge-tts')
        const communicate = new Communicate(text.substring(0, 1000), { voice: eng.voice })
        const bufs = []
        for await (const chunk of communicate.stream()) {
          if (tok !== _speakToken) { clearTimeout(timer); finish(true); return }
          if (chunk.type === 'audio' && chunk.data) bufs.push(Buffer.from(chunk.data))
        }
        const buf = Buffer.concat(bufs)
        if (!buf.length) throw new Error('sin audio')
        const mp3 = path.join(os.tmpdir(), `_ai_edge_${process.pid}_${++_ttsSuffix}.mp3`)
        fs.writeFileSync(mp3, buf)
        clearTimeout(timer)
        const ps = `try { $w = New-Object -ComObject WMPlayer.OCX; $w.URL = '${escapeSingle(mp3)}'; $w.controls.play(); $t = 0; while ($w.playState -ne 1 -and $t -lt 120) { Start-Sleep -Milliseconds 300; $t++ } } catch { exit 1 }`
        const psFile = psScript()
        fs.writeFileSync(psFile, '﻿' + ps, 'utf8')
        const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `"${psFile}"`], { windowsHide: true })
        _child = child
        child.on('close', () => {
          if (_child === child) _child = null
          try { fs.unlinkSync(psFile) } catch {}
          try { fs.unlinkSync(mp3) } catch {}
          finish(true)
        })
        child.on('error', () => {
          if (_child === child) _child = null
          try { fs.unlinkSync(psFile) } catch {}
          try { fs.unlinkSync(mp3) } catch {}
          sapiSpeak(text).then(() => finish(true))
        })
      } catch (e) {
        clearTimeout(timer)
        try { logger.warn('edge falló, voy a SAPI:', e.message) } catch {}
        sapiSpeak(text).then(() => finish(true))
      }
    })()
  })
}

function piperSpeak(text, eng, tok) {
  return new Promise((resolve) => {
    const msg = text.replace(/['"]/g, '').substring(0, 2000)
    const wav = path.join(os.tmpdir(), `_ai_vox_${process.pid}_${++_ttsSuffix}.wav`)
    _gen = execFile(eng.exe, ['--model', eng.model, '--length_scale', String(voiceRate()), '--output_file', wav], { timeout: 60000, windowsHide: true }, (err) => {
      _gen = null
      // Si otro speak tomó el turno, callar sin duplicar (ni fallback).
      if (tok !== _speakToken) {
        try { fs.unlinkSync(wav) } catch {}
        resolve()
        return
      }
      let wavOk = false
      try { wavOk = fs.existsSync(wav) && fs.statSync(wav).size > 1000 } catch {}
      if (err || !wavOk) {
        try { logger.warn('piper falló, voy a SAPI:', err && err.message) } catch {}
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
      child.on('error', () => done(false))    })
    try {
      if (_gen && _gen.stdin) { _gen.stdin.write(msg); _gen.stdin.end() }
    } catch {}
  })
}

function sapiSpeak(text) {
  return new Promise((resolve) => {
    const msg = escapeSingle(text.replace(/['"]/g, '').substring(0, 2000))
    const rate = Math.round((voiceRate() - 1) * 10)
    const ps = `try {
  $v = New-Object -ComObject SAPI.SpVoice -ErrorAction Stop
  $es = @($v.GetVoices() | Where-Object { $_.GetAttribute('Language') -match '0A$' })[0]
  if ($es) { $v.Voice = $es }
  $v.Rate = ${rate}
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
  _speakToken++
  if (_child) {
    try { _child.kill() } catch {}
    _child = null
  }
  if (_gen) {
    try { _gen.kill() } catch {}
    _gen = null
  }
}

// Autodiagnóstico por etapas: dice QUÉ falla (generar vs reproducir).
// silent=true no reproduce (para tests/CI); igual verifica generación.
async function selfTest({ silent = false } = {}) {
  const eng = getEngine()
  if (eng.engine === 'edge') {
    return { engine: 'edge', generated: null, played: null, note: 'Requiere internet; pruébalo con Probar voz.' }
  }
  if (eng.engine !== 'piper') {
    return { engine: 'sapi', generated: null, played: null, note: 'Piper no disponible, usa voz del sistema.' }
  }
  const wav = path.join(os.tmpdir(), `_ai_vox_test_${process.pid}.wav`)
  const gen = await new Promise((resolve) => {
    const child = execFile(eng.exe, ['--model', eng.model, '--output_file', wav], { timeout: 60000, windowsHide: true }, (err) => {
      let size = 0
      try { size = fs.statSync(wav).size } catch {}
      resolve({ err: err && err.message, size })
    })
    try {
      if (child && child.stdin) { child.stdin.write('Prueba de voz de Vox'); child.stdin.end() }
    } catch {}
  })
  if (gen.err || gen.size < 1000) {
    try { fs.unlinkSync(wav) } catch {}
    return { engine: 'piper', generated: false, played: false, error: gen.err || 'WAV vacío' }
  }
  if (silent) {
    try { fs.unlinkSync(wav) } catch {}
    return { engine: 'piper', generated: true, size: gen.size, played: null, note: 'Generación OK (sin reproducir).' }
  }
  const played = await new Promise((resolve) => {
    const ps = `try { $p = New-Object Media.SoundPlayer '${escapeSingle(wav)}'; $p.PlaySync(); exit 0 } catch { exit 1 }`
    const psFile = psScript()
    fs.writeFileSync(psFile, '﻿' + ps, 'utf8')
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `"${psFile}"`], { windowsHide: true })
    child.on('close', (code) => {
      try { fs.unlinkSync(psFile) } catch {}
      try { fs.unlinkSync(wav) } catch {}
      resolve(code === 0)
    })
    child.on('error', () => {
      try { fs.unlinkSync(psFile) } catch {}
      try { fs.unlinkSync(wav) } catch {}
      resolve(false)
    })
  })
  return { engine: 'piper', generated: true, size: gen.size, played, error: played ? undefined : 'SoundPlayer no reprodujo' }
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

module.exports = { speak, stop, isAvailable, getEngine, selfTest }
