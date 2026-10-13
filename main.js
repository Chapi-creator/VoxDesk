const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, dialog, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const http = require('http')
const fs = require('fs')
const os = require('os')
const { exec } = require('child_process')
const { IPC_CHANNELS, COMMANDS } = require('./src/shared/constants')
const registry = require('./src/main/commands/registry')
const parser = require('./src/main/command-parser')
const wake = require('./src/main/wake')
const tts = require('./src/main/tts')
const config = require('./src/main/config')
const llm = require('./src/main/llm')
const smartExec = require('./src/main/smart-exec')
const guard = require('./src/main/guard')
const mood = require('./src/main/mood')
const life = require('./src/main/life')
const memory = require('./src/main/memory')
const logger = require('./src/main/logger')

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.png': 'image/png',
}

let mainWindow = null
let server = null
let wakeMode = true
let tray = null
let wakeRestartTimer = null
let _macroBuffer = []

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let filePath = req.url === '/' ? '/index.html' : req.url
      filePath = path.join(__dirname, filePath)
      if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end(); return }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return }
        const ext = path.extname(filePath)
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        res.end(data)
      })
    })
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 440, height: 560, resizable: true, maxHeight: 640, maxWidth: 480,
    frame: false, transparent: false,
    alwaysOnTop: true, skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  })
  mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`)
  mainWindow.setVisibleOnAllWorkspaces(true)
}

function wakeOpts() {
  const cfg = config.load()
  const opts = { device: cfg.micDevice || undefined, endPause: cfg.endPause || undefined, patience: cfg.patience || undefined }
  // A1: modelo grande descargado (fuera del instalador).
  if (cfg.voiceModel === 'large') {
    try {
      const d = require('path').join(config.modelsDir(), 'vosk-model-es-0.42')
      if (require('fs').existsSync(require('path').join(d, 'am', 'final.mdl'))) opts.modelDir = d
    } catch {}
  }
  return opts
}

function setWakeMode(on) {
  wakeMode = on
  if (wakeRestartTimer) { clearTimeout(wakeRestartTimer); wakeRestartTimer = null }
  if (on) {
    const cfg = config.load()
    wake.start(cfg.wakeWord || 'asistente', wakeOpts())
  } else wake.stop()
  if (mainWindow) mainWindow.webContents.send('wake:toggle', on)
}

function registerShortcuts() {
  const ptt = (() => { try { return !!config.load().pttMode } catch { return false } })()
  if (!ptt) {
    globalShortcut.register('Ctrl+Shift+V', () => {
      if (mainWindow) {
        mainWindow.show(); mainWindow.focus()
        mainWindow.webContents.send(IPC_CHANNELS.STATUS_UPDATE, 'toggle-recording')
      }
    })
  } else {
    globalShortcut.register('Ctrl+Shift+V', () => {
      if (mainWindow) { mainWindow.show(); mainWindow.focus() }
    })
  }
  globalShortcut.register('Ctrl+Shift+W', () => {
    setWakeMode(!wakeMode)
  })
  globalShortcut.register('Escape', () => {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide()
  })
  globalShortcut.register('Ctrl+Shift+X', () => {
    tts.stop()
  })
}

ipcMain.handle('wake:toggle', () => setWakeMode(!wakeMode))

let _speechBusy = false

ipcMain.handle('speech:recognize', async (_event, opts) => {
  if (_speechBusy) { tts.speak('Estoy ocupado, espera un momento').catch(() => {}); return { error: 'Ocupado' } }
  if (!wake.isRunning()) {
    const cfg = config.load()
    const ok = wake.start(cfg.wakeWord || 'asistente', wakeOpts())
    if (!ok) return { error: 'No se pudo iniciar la detección de voz: revisa que wake.exe esté junto a la app' }
  }
  _speechBusy = true
  try {
    const trigger = path.join(os.tmpdir(), 'voxdesk_listen_trigger')
    try { fs.writeFileSync(trigger, (opts && opts.ptt) ? 'ptt' : '1') } catch {}
    return { viaWake: true }
  } finally {
    _speechBusy = false
  }
})

ipcMain.handle('speech:cancel', async () => {
  const trigger = path.join(os.tmpdir(), 'voxdesk_stop_trigger')
  try { fs.writeFileSync(trigger, '1') } catch {}
  tts.stop()
  return true
})

let _followUntil = 0
let _dictateUntil = 0

// Modo dictado: todo lo que sigue se ESCRIBE hasta "termina dictado" o 2 min.
async function maybeDictate(transcript) {
  const t = String(transcript || '').trim()
  if (/^(termina|terminar|para|det[eé]n)(\s+(el|de))?\s+dictado$/i.test(t) || /^detente$/i.test(t)) {
    if (_dictateUntil) {
      _dictateUntil = 0
      return { success: true, message: 'Dictado terminado.', speak: true }
    }
    return null
  }
  if (/^(empieza|inicia|activa|modo)\s+dictado$/i.test(t)) {
    _dictateUntil = Date.now() + 2 * 60000
    return { success: true, message: 'Dictando: todo lo que digas se escribe. Di "termina dictado" para parar.', speak: true }
  }
  if (_dictateUntil && Date.now() < _dictateUntil) {
    _dictateUntil = Date.now() + 2 * 60000
    return await require('./src/main/commands/type').execute(t)
  }
  _dictateUntil = 0
  return null
}
ipcMain.handle('followup:arm', () => {
  try {
    if (config.load().followUp === false) return false
  } catch {}
  _followUntil = Date.now() + 8000
  setTimeout(() => {
    try {
      if (Date.now() < _followUntil && !_voxSpeaking && wake.isRunning()) {
        fs.writeFileSync(path.join(os.tmpdir(), 'voxdesk_listen_trigger'), 'followup')
      }
    } catch {}
    _followUntil = 0
  }, 1200)
  return true
})

const systemCmds = require('./src/main/commands/system')

// Fase 3+6: los patrones delicados (smart-exec y system.js) piden permiso.
async function confirmDestructive(title, detail) {
  if (!mainWindow) return false
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Sí, ejecutar', 'Cancelar'],
    defaultId: 1,
    title: title || 'Acción delicada',
    message: 'Vox va a ejecutar una acción delicada:',
    detail: (detail || '').substring(0, 500),
  })
  return response === 0
}
smartExec.setConfirm(confirmDestructive)
systemCmds.setConfirm(confirmDestructive)

async function _handleOne(transcript, _depth = 0, _fromFuzzy = false) {  if (!transcript) return { success: false, message: 'No te escuché' }
  if (_depth > 5) return { success: false, message: 'Demasiadas macros anidadas' }

  const _cfg = config.load()
  const aiWords = _cfg.aiKeywords || 'ia,bot,asistente'
  const AI_KEYWORD = new RegExp('^(' + aiWords.split(',').map(w => w.trim()).filter(Boolean).join('|') + ')[\\s,]+', 'i')
  let t = transcript
  if (AI_KEYWORD.test(t)) {
    t = t.replace(AI_KEYWORD, '').trim()
    if (!t) return { success: false, message: '¿Qué quieres que haga?', speak: true }
  }

  if (/^(olvida\s*(todo|contexto|historial)?|detente)\s*$/i.test(t)) {
    if (/olvida/i.test(t)) { llm.clearHistory(); return { success: true, message: 'Contexto borrado', speak: true } }
    if (/detente/i.test(t)) { tts.stop(); return { success: true, stop: true, message: 'Detenido' } }
  }

  const SEP_SPLIT = /(?:\s+y\s+|\s+y\s+luego\s+|\s+luego\s+|\s+despu[ée]s\s+)/i
  const BROWSER_SITE = /^(?:puedes\s+)?(?:abre|abrir|abreme)\s+(?:el\s+|la\s+)?(?:navegador\s+)?(?:(?:google\s+)?chrome|(?:microsoft\s+)?edge|(?:mozilla\s+)?firefox|brave|msedge)\b.*\b(pon|poner|abre|abrir|dime|mete|abreme)\b.+/i
  // Fase 5: split sin romper comillas ("di "pan y queso" y qué hora es" -> 2 partes)
  const parts = parser.splitCommands(t, SEP_SPLIT)
  if (parts.length > 1 && !AI_KEYWORD.test(transcript) && !BROWSER_SITE.test(t)) {
    if (parts.length > 1) {
      const messages = []
      let allOk = true
      for (const part of parts) {
        if (_depth > 5) { allOk = false; break }
        const r = await _handleOne(part, _depth + 1)
        if (r && r.success) messages.push(r.message)
        else { allOk = false; break }
      }
      if (allOk && messages.length) return { success: true, message: messages.join('. '), speak: true }
    }
  }

  // Fase 13: contexto — pronombres sobre lo último hecho ("analiza eso").
  const _ctx = memory.get('vox_ctx') || {}
  const _refVerb = t.match(/^(analiza|explica|explícame|explicitame|resume|traduce)\s+(eso|esto|lo anterior|lo)$/i)
    || t.match(/^(analiza|explica|resume|explícame|explicitame)$/i)
    || t.match(/^(y\s+)?eso\s+(que significa|qué significa|qué es)$/i)
  if (_refVerb) {
    if (!_ctx.lastResult) {
      return { success: false, message: 'Aún no hice nada. Pídeme algo primero y luego me preguntas sobre eso.', speak: true }
    }
    if (!(_cfg.provider === 'local' || _cfg.apiKey)) {
      return { success: true, message: `Lo último fue: "${_ctx.lastAction}". Configura una IA en Ajustes y te lo explico.`, speak: true }
    }
    const answer = await llm.ask(`Contexto:\nAcción: ${_ctx.lastAction}\nResultado: ${_ctx.lastResult}\n\nEl usuario dice: "${t}". Responde sobre ese contexto, español breve.`)
    if (answer) return await _processLlmAnswer(answer)
    return { success: false, message: 'No pude explicarlo.', speak: true }
  }
  if (/^(rep[ií]telo|repite eso|otra vez|de nuevo)$/i.test(t)) {
    if (!_ctx.lastAction) {
      return { success: false, message: 'No hay nada que repetir todavía.', speak: true }
    }
    return await _handleOne(_ctx.lastAction, _depth + 1)
  }

  const parsed = parser.parse(t)
  const allowLaunch = parsed && parsed.command === COMMANDS.LAUNCH
  if (parsed && (allowLaunch || (!t.includes(' y ') && !t.includes(' luego ')))) {
    const handler = registry.get(parsed.command)
    if (handler) {
      let args = parsed.args
      if (parsed.command === 'volumen' || parsed.command === 'brillo' || parsed.command === 'sistema') args = t
      const result = await handler.execute(args)
      if (result.success) return result
    }
  }

  // Macro: check if transcript matches a saved macro name
  const macroCmds = memory.loadMacro(t)
  if (macroCmds && macroCmds.length) {
    if (_depth > 5) return { success: false, message: 'Macro omitida — demasiado anidamiento' }
    for (const cmd of macroCmds) await _handleOne(cmd, _depth + 1)
    return { success: true, message: 'Macro ejecutada', speak: true }
  }

  if (/^recarga plugins$/i.test(t)) {
    const loaded = plugins.loadAll()
    return { success: true, message: loaded.length ? `Plugins: ${loaded.map(p => p.name).join(', ')}.` : 'Carpeta de plugins vacía (mira ejemplo.js en tus datos).', speak: true }
  }

  // Plugins del usuario (antes que smart, después que macros).
  try {
    const plug = plugins.match(t)
    if (plug) {
      const tools = {
        open: async (target) => {
          const launch = require('./src/main/commands/launch')
          return await launch.execute(String(target))
        },
      }
      return await plugins.runPlugin(plug, t, tools)
    }
  } catch {}

  // Fase 14a: autonomía — "encárgate de X" planifica y ejecuta con tu aprobación.
  const agentMatch = t.match(/^(enc[aá]rgate de|modo aut[oó]nomo|haz todo esto|plan:?)\s+(.+)/i)
  if (agentMatch) {
    const goal = agentMatch[2].trim()
    if (!(_cfg.provider === 'local' || _cfg.apiKey)) {
      return { success: false, message: 'Para planes autónomos configura una IA en Ajustes (online u Ollama local).', speak: true }
    }
    return await runAgent(goal)
  }

  const smartResult = await smartExec.execute(t)
  if (smartResult) {
    if (smartResult._macro && Array.isArray(smartResult._macro)) {
      if (_depth > 5) return { success: false, message: 'Macro omitida — demasiado anidamiento' }
      for (const cmd of smartResult._macro) await _handleOne(cmd, _depth + 1)
      return { success: true, message: 'Macro ejecutada', speak: true }
    }
    return smartResult
  }

  // Fase 13: fuzzy — entiende aunque la frase varíe ("apaga la compu").
  // Alta confianza ejecuta vía frase canónica; media pregunta; baja sigue al LLM.
  // Fase 16B1: primero la caché aprendida (tus frases exactas ganan al fuzzy).
  // Deuda menor: los ejemplos viven en los patrones (fuente única).
  if (!_fromFuzzy) {
    const norm = understand.normalize(t)
    const cache = memory.getCache()
    let bestKey = null, bestSim = 0
    for (const k of Object.keys(cache)) {
      const c = understand.sim(norm, k)
      if (c > bestSim) { bestSim = c; bestKey = k }
    }
    if (bestKey && bestSim >= 0.8 && cache[bestKey].action !== t) {
      return await _handleOne(cache[bestKey].action, _depth + 1, true)
    }
    const XTRA = smartExec.getPatternExamples().map(e => ({ id: 'pat', canon: e.canon, ex: e.ex }))
    const fz = understand.route(t, XTRA)
    if (fz && fz.conf >= understand.HI) {
      return await _handleOne(fz.canon + (fz.args ? ' ' + fz.args : ''), _depth + 1, true)
    }
    if (fz && fz.conf >= understand.MID) {
      return { success: true, message: `¿Quisiste decir "${fz.canon}"? Dilo así y lo hago.`, speak: true }
    }
  }

  if (_cfg.provider === 'local' || _cfg.apiKey) {
    if (mainWindow) mainWindow.webContents.send('model:info', `${_cfg.provider || 'gemini'}/${_cfg.model || '?'}`)
    const answer = await llm.ask(t)
    if (answer) return await _processLlmAnswer(answer)
  }
  return { success: false, message: `No entendí: "${t}". Prueba con algo simple como "qué hora es", o abre la guía ❓ para ver todo lo que sé hacer.`, speak: true }
}

function _r(obj) { obj.recording = memory.isRecording(); return obj }

ipcMain.handle(IPC_CHANNELS.COMMAND_EXEC, async (_event, transcript) => {
  try {
  if (!transcript) return _r({ success: false, message: 'No te escuché' })

  if (memory.isRecording()) {
    const m = transcript.match(/^(guarda\s+macro|det[eé]n\s+macro|para\s+macro)\s+(.+)/i)
    if (m) {
      memory.stopRecording()
      memory.saveMacro(m[2], [..._macroBuffer])
      _macroBuffer = []
      return _r({ success: true, message: `Macro "${m[2]}" guardada`, speak: true })
    }
    _macroBuffer.push(transcript)
    return _r({ success: true, message: 'Paso grabado', speak: true })
  }

  const dictated = await maybeDictate(transcript)
  if (dictated) return _r(dictated)
  return _r(await handleAndTrack(transcript))
  } catch (e) {
    return _r({ success: false, message: 'Error: ' + e.message, speak: true })
  }
})

ipcMain.handle('tts:speak', async (_event, text) => {
  // Fase 7 anti-eco: mientras Vox habla, lo que entra por el micro se ignora.
  _voxSpeaking = true
  try {
    await tts.speak(text)
  } finally {
    _voxSpeaking = false
  }
})

ipcMain.handle('audio:devices', async () => {
  return await wake.listDevices()
})

ipcMain.handle('tts:stop', () => {
  tts.stop()
})

ipcMain.handle('config:get', () => config.load())

ipcMain.handle('config:save', (_event, data) => {
  if (data.wakeWord) data.wakeWord = data.wakeWord.toLowerCase().trim()
  const ok = config.save(data)
  if (ok && wakeMode) { wake.stop(); setTimeout(() => wake.start(data.wakeWord || 'asistente'), 100) }
  return ok
})

ipcMain.handle('llm:ask', async (_event, prompt) => {
  return await llm.ask(prompt)
})

ipcMain.handle('llm:models', async (_event, apiKey, provider) => {
  return await llm.listModels(apiKey, provider)
})

ipcMain.handle('llm:validate', (_event, key, provider, apiUrl) => {
  return llm.validateKey(provider, key, apiUrl)
})

const OPEN_URLS = ['https://aistudio.google.com/', 'https://ollama.com/download']
ipcMain.handle('open:url', (_event, url) => {
  if (OPEN_URLS.some(u => String(url || '').startsWith(u))) shell.openExternal(url)
  return true
})

// Fase 13: Ollama guiado — descargar, verificar, bajar modelo. Nada silencioso.
ipcMain.handle('ollama:status', async () => {
  const out = { installed: false, version: '', models: [] }
  try {
    const ver = await new Promise((resolve) => {
      exec('ollama --version', { timeout: 10000 }, (err, stdout) => resolve(err ? '' : (stdout || '').trim()))
    })
    if (!ver) return out
    out.installed = true
    out.version = ver
    const models = await new Promise((resolve) => {
      exec('ollama list', { timeout: 15000 }, (err, stdout) => resolve(err ? '' : (stdout || '')))
    })
    out.models = models.split('\n').slice(1).map(l => l.trim().split(/\s+/)[0]).filter(n => n && n !== 'NAME')
  } catch {}
  return out
})

ipcMain.handle('ollama:install', async () => {
  const exe = path.join(os.tmpdir(), 'OllamaSetup.exe')
  if (!fs.existsSync(exe)) {
    await new Promise((resolve, reject) => {
      const https = require('https')
      const file = fs.createWriteStream(exe)
      https.get('https://ollama.com/download/OllamaSetup.exe', (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          https.get(res.headers.location, (r2) => { r2.pipe(file); file.on('finish', () => { file.close(); resolve() }) }).on('error', reject)
          return
        }
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
      }).on('error', reject)
    })
  }
  shell.openPath(exe)
  return true
})

ipcMain.handle('ollama:pull', async (_event, model) => {
  const m = String(model || 'qwen2.5:1.5b').trim() || 'qwen2.5:1.5b'
  exec(`ollama pull ${m}`, { timeout: 30 * 60000, maxBuffer: 10 * 1024 * 1024 }, (err) => {
    if (mainWindow) mainWindow.webContents.send('ollama:pull-done', { model: m, ok: !err })
  })
  return true
})

ipcMain.handle('llm:clear', () => {
  llm.clearHistory()
})

function isDangerous(psCode) {
  return guard.isDangerous(psCode)
}

async function _processLlmAnswer(answer) {
  const psMatch = answer.match(/```powershell\n?([\s\S]*?)```/)
  if (psMatch) {
    const psCode = psMatch[1].trim()
    const explanation = answer.replace(/```[\s\S]*?```/g, '').trim()
    // Fase 3: la IA nunca ejecuta sin que lo veas y lo apruebes.
    const dangerous = isDangerous(psCode)
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: dangerous ? 'warning' : 'question',
      buttons: ['Ejecutar', 'Cancelar'],
      defaultId: 1,
      title: dangerous ? 'Comando potencialmente peligroso' : 'La IA quiere ejecutar esto',
      message: dangerous
        ? 'La IA quiere ejecutar una operación que podría afectar el sistema:'
        : 'Revisa antes de ejecutar:',
      detail: psCode.substring(0, 2000),
    })
    if (response !== 0) return { success: true, message: (explanation || 'Operación cancelada') + '\n\n¿Necesitas algo más?', speak: true }
    const tmpPS = path.join(os.tmpdir(), `_ai_llm_${Date.now()}.ps1`)
    fs.writeFileSync(tmpPS, '\ufeff' + psCode, 'utf8')
    try {
      const output = await new Promise((resolve, reject) => {
        exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPS}"`, { timeout: 30000 }, (err, stdout, stderr) => {
          const out = (stdout || '').trim()
          const errOut = (stderr || '').trim()
          resolve({ err: err?.message, stdout: out, stderr: errOut })
        })
      })
      let msg = explanation || 'Hecho'
      if (output.stdout) msg += '\n\n' + output.stdout
      if (output.stderr) msg += '\n\nError: ' + output.stderr
      return { success: true, message: msg + '\n\n¿Necesitas algo más?', speak: true }
    } catch {
      return { success: true, message: (explanation || 'Hecho') + '\n\n¿Necesitas algo más?', speak: true }
    } finally {
      try { fs.unlinkSync(tmpPS) } catch {}
    }
  }
  return { success: true, message: answer, speak: true }
}

ipcMain.handle('tts:check', () => tts.isAvailable())

ipcMain.handle('tts:engine', () => {
  try {
    return { engine: tts.getEngine().engine, ok: tts.isAvailable() }
  } catch {
    return { engine: 'none', ok: false }
  }
})

ipcMain.handle('tts:selftest', async () => {
  try {
    return await tts.selfTest()
  } catch (e) {
    return { engine: '?', generated: false, played: false, error: e.message }
  }
})

ipcMain.handle('voices:list', () => {
  try { return require('./src/main/voices').listCustom() } catch { return [] }
})

ipcMain.handle('voices:add', async (_event, name, url) => {
  const voices = require('./src/main/voices')
  const path = require('path')
  let base
  try {
    const app = require('electron').app
    base = app.isPackaged ? path.join(process.resourcesPath, 'voices') : path.join(__dirname, 'vendor', 'voices')
  } catch {
    base = path.join(__dirname, 'vendor', 'voices')
  }
  return await voices.addCustomVoice(name, url, base)
})

ipcMain.handle('voices:remove', (_event, file) => {
  try { return require('./src/main/voices').removeCustomVoice(file) } catch { return [] }
})

ipcMain.handle('models:status', () => {
  try {
    const base = require('path').join(config.modelsDir(), 'vosk-model-es-0.42')
    const need = ['am/final.mdl', 'graph/HCLr.fst', 'graph/Gr.fst'].map(f => require('path').join(base, ...f.split('/')))
    const ok = need.every(f => { try { return require('fs').statSync(f).size > 1024 } catch { return false } })
    return { largeDownloaded: ok }
  } catch {
    return { largeDownloaded: false }
  }
})

// A1: descarga 1.4 GB con progreso (eventos models:progress). Nada silencioso.
ipcMain.handle('models:download-large', async () => {
  const https = require('https')
  const fs = require('fs')
  const path = require('path')
  const dir = path.join(config.modelsDir(), 'vosk-model-es-0.42')
  const zip = path.join(require('os').tmpdir(), 'vosk-model-es-0.42.zip')
  const send = (pct) => { if (mainWindow) mainWindow.webContents.send('models:progress', { pct }) }
  const get = (url, redirs = 0) => new Promise((resolve, reject) => {
    if (redirs > 5) return reject(new Error('redirects'))
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        get(res.headers.location, redirs + 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return }
      const total = parseInt(res.headers['content-length'] || '0', 10)
      let got = 0
      const out = fs.createWriteStream(zip)
      res.on('data', (c) => {
        got += c.length
        if (total) {
          const pct = Math.floor((got / total) * 90)
          if (pct !== get._last || pct % 5 === 0) { get._last = pct; send(pct) }
        }
      })
      res.pipe(out)
      out.on('finish', () => { out.close(); resolve() })
      out.on('error', reject)
    }).on('error', reject)
  })
  try {
    send(1)
    await get('https://alphacephei.com/vosk/models/vosk-model-es-0.42.zip')
    send(92)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    await new Promise((resolve, reject) => {
      const { execFile } = require('child_process')
      execFile('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zip}' -DestinationPath '${path.join(config.modelsDir())}' -Force`], { timeout: 30 * 60000 }, (err) => err ? reject(err) : resolve())
    })
    try { fs.unlinkSync(zip) } catch {}
    send(100)
    if (mainWindow) mainWindow.webContents.send('models:progress', { pct: 100, done: true, ok: true })
    return true
  } catch (e) {
    try { fs.unlinkSync(zip) } catch {}
    if (mainWindow) mainWindow.webContents.send('models:progress', { pct: 0, done: true, ok: false, error: e.message })
    return false
  }
})

ipcMain.handle('memory:get', (_e, key) => memory.get(key))
ipcMain.handle('memory:set', (_e, key, value) => memory.set(key, value))

ipcMain.handle('timers:list', () => {
  try { return require('./src/main/commands/timer').listTimers() } catch { return [] }
})

ipcMain.handle('stats:get', () => {
  try { return mood.statsSummary() } catch { return { total: 0, okRate: 100, top: [] } }
})

ipcMain.handle('app:health', () => {
  const checks = []
  try {
    checks.push({ id: 'wake', ok: !!wake.enginePath(), label: 'motor de voz no encontrado (reinstala la app)' })
  } catch { checks.push({ id: 'wake', ok: false, label: 'motor de voz no encontrado (reinstala la app)' }) }
  try {
    checks.push({ id: 'tts', ok: tts.isAvailable(), label: 'sin voz (revisa Ajustes > Voz y el Diagnosticar)' })
  } catch { checks.push({ id: 'tts', ok: false, label: 'sin voz (revisa Ajustes > Voz y el Diagnosticar)' }) }
  return checks
})

// Fase 16B1: 👍 confirma el mapeo aprendido, 👎 lo borra.
ipcMain.handle('cache:feedback', (_e, transcript, good) => {
  const k = understand.normalize(transcript)
  if (good) return memory.bumpCache(k, 3)
  return memory.removeCache(k)
})

ipcMain.handle('help:get', () => {
  const cmds = Object.values(require('./src/shared/constants').COMMANDS)
  const patterns = require('./src/main/smart-exec').getHelp()
  return { commands: cmds, groups: patterns }
})

ipcMain.handle('window:minimize', () => mainWindow?.hide())
ipcMain.handle('window:close', () => mainWindow?.hide())

let _voxSpeaking = false
let _lastWakeAt = 0
let _lastCmdAt = Date.now()
let _lastSleepState = ''
let _tickN = 0
let _lastBattery = null

// Fase 11: envoltorio que registra ánimo/racha/uso sin tocar el ruteo.
async function handleAndTrack(transcript, depth = 0) {
  _lastCmdAt = Date.now()
  _lastSleepState = ''
  // Silencio por voz: cualquier orden lo levanta (salvo las que lo ponen/quitan).
  if (!/^(modo silencio|no me hables|descansa|c[aá]llate un rato|despierta|ya puedes hablar|vuelve)$/i.test(transcript)) {
    try { memory.del('vox_quiet') } catch {}
  }
  // Fase 16B2: cualquier orden levanta el silencio (salvo las que lo ponen/quitan).
  if (!/^(modo silencio|no me hables|descansa|c[aá]llate un rato|despierta|ya puedes hablar|modo normal|vuelve)$/i.test(transcript)) {
    try { memory.del('vox_quiet') } catch {}
  }
  const r = await _handleOne(transcript, depth)
  try {
    if (r && r.success) {
      mood.addMood(4)
      const s = mood.bumpStreak()
      if (s.n === 5) mood.addMood(10)
    } else if (r && !r.success && r.message && r.message.startsWith('No entendí')) {
      mood.addMood(-3)
    }
    mood.pushCmdTime()
    try { mood.trackStats(transcript, !!(r && r.success)) } catch {}
    // Fase 13: contexto para pronombres (las meta-órdenes no pisan lo referido).
    if (!understand.isMeta(transcript)) {
      memory.set('vox_ctx', { lastAction: transcript, lastResult: String((r && r.message) || '').slice(0, 2000), at: Date.now() })
    }
    // Fase 16B1: aprende el par frase->acción de cada éxito (fuzzy lo reutiliza).
    if (r && r.success && !understand.isMeta(transcript)) {
      try { memory.saveCachePair(understand.normalize(transcript), transcript) } catch {}
    }
  } catch {}
  return r
}

wake.onWake = (command) => {
  _lastWakeAt = Date.now()
  // Fase 16B3 barge-in: decir la palabra sobre Vox hablando lo interrumpe.
  if (_voxSpeaking) tts.stop()
  if (mainWindow) {
    mainWindow.show(); mainWindow.focus()
    mainWindow.webContents.send('wake:detected', command || '')
  }
}

wake.onLevel = (level, speaking, vad) => {
  if (mainWindow) mainWindow.webContents.send('audio:level', { level, speaking, vad })
}

wake.onDown = (message) => {
  if (mainWindow) mainWindow.webContents.send('wake:result', { success: false, message })
}

wake.onText = async (text) => {
  if (!wake.shouldHear(_voxSpeaking, _lastWakeAt)) return
  if (mainWindow) {
    const dictated = await maybeDictate(text)
    const result = dictated || await handleAndTrack(text)
    result._text = text
    mainWindow.webContents.send('wake:result', result)
  }
}

wake.onIdle = () => {
  if (mainWindow) mainWindow.webContents.send('status:update', 'idle-now')
}

wake.onError = (error) => {
  if (mainWindow) mainWindow.webContents.send('wake:result', { success: false, message: error })
}

const agent = require('./src/main/agent')
const understand = require('./src/main/understand')
const plugins = require('./src/main/plugins')

async function runAgent(goal) {
  const res = await agent.run(goal, {
    ask: (p) => llm.ask(p),
    execStep: (a) => handleAndTrack(a),
    confirm: async (steps) => {
      if (!mainWindow) return false
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Ejecutar plan', 'Cancelar'],
        defaultId: 1,
        title: 'Plan autónomo',
        message: 'Voy a ejecutar estos pasos:',
        detail: steps.map((s, i) => `${i + 1}. ${s.action}`).join('\n').substring(0, 2000),
      })
      return response === 0
    },
  })
  return { success: res.ok || !!res.cancelled, message: res.message + '\n\n¿Algo más?', speak: true }
}

// Fase 11: loop de vida. Cada 60s evalúa contexto y Vox actúa por su cuenta.
// Voz solo si proactivity=total, fuera de horario silencioso (22-8) y hay texto.
async function lifeTick() {
  try {
    const cfg = config.load()
    if (cfg.proactivity === 'off') return
    // Fase 16B2: silencio por voz (12h o hasta que le hables).
    try {
      const q = memory.get('vox_quiet')
      if (q && Date.now() - q < 12 * 3600000) return
      if (q) memory.del('vox_quiet')
    } catch {}
    _tickN++
    // Rutinas diarias programadas (respetan silencio).
    try {
      const routines = require('./src/main/routines')
      for (const r of routines.dueRoutines(routines.all(), new Date())) {
        routines.markRun(r.id, new Date())
        handleAndTrack(r.action).catch(() => {})
      }
    } catch {}
    const now = Date.now()
    if (_tickN % 10 === 0 || _lastBattery === null) {
      try {
        const pct = await new Promise((resolve) => {
          exec('powershell -NoProfile -Command "(Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1).EstimatedChargeRemaining"', { timeout: 10000 }, (err, stdout) => {
            resolve(parseInt((stdout || '').trim()) || null)
          })
        })
        if (pct !== null) _lastBattery = pct
      } catch {}
    }
    const hour = new Date().getHours()
    const ctx = {
      now, hour,
      name: mood.getName(), mood: mood.getMood(),
      daysAway: mood.daysSinceSeen(),
      idleMin: (now - _lastCmdAt) / 60000,
      recentCmds: mood.recentCount(),
      battery: _lastBattery,
      lastMorning: memory.get('vox_last_morning'),
      lastNight: memory.get('vox_last_night'),
      lastBatteryWarn: memory.get('vox_last_battery'),
      lastMissed: memory.get('vox_last_missed'),
      lastBreak: memory.get('vox_last_break'),
      lastSleepState: _lastSleepState,
      streak: memory.get('vox_streak'),
    }
    const a = life.evaluate(ctx)
    mood.touchSeen()
    if (!a) return
    if (a.stamp) for (const [k, v] of Object.entries(a.stamp)) memory.set('vox_' + k, v)
    if (a.streakDone) mood.markStreakDone()
    // Fase 14b: briefing matutino con datos reales (1 vez al día, best-effort).
    if (a.id === 'morning') {
      try {
        const v = await require('./src/main/vitals').snapshot()
        const bits = []
        if (v.batt >= 0) bits.push(`batería al ${v.batt}%`)
        if (v.diskFreeGB >= 0) bits.push(`disco C con ${v.diskFreeGB} GB libres`)
        if (bits.length) a.text += ' Datos: ' + bits.join(', ') + '.'
      } catch {}
    }
    // Fase 14b: alerta de disco lleno (cada 30 ticks ≈ 30 min, burbuja sin voz).
    if (_tickN % 30 === 0) {
      try {
        const today = new Date(now).toISOString().slice(0, 10)
        if (memory.get('vox_last_disk') !== today) {
          const v = await require('./src/main/vitals').snapshot()
          if (v.diskFree >= 0 && v.diskFree < 10) {
            memory.set('vox_last_disk', today)
            if (mainWindow) mainWindow.webContents.send('vox:life', { state: 'worried', text: `Disco C al ${Math.round(100 - v.diskFree)}% lleno (${v.diskFreeGB} GB libres). Libera espacio cuando puedas.`, speak: false })
          }
        }
      } catch {}
    }
    if (a.id === 'sleep') {
      _lastSleepState = 'sleep'
      if (mainWindow) mainWindow.webContents.send('vox:life', { state: 'sleep', text: '' })
      return
    }
    _lastSleepState = ''
    const quiet = hour >= 22 || hour < 8
    const allowVoice = a.speak && cfg.proactivity === 'total' && !quiet
    if (mainWindow) mainWindow.webContents.send('vox:life', { state: a.state, text: a.text, speak: allowVoice })
  } catch (e) {
    logger.warn('lifeTick:', e.message)
  }
}

app.whenReady().then(async () => {
  const t0 = Date.now()
  const mark = (m) => { try { logger.info(`boot ${m} +${Date.now() - t0}ms`) } catch {} }
  app.setPath('userData', path.join(app.getPath('appData'), 'ai-desktop-assistant'))
  config.setUserDataPath(app.getPath('userData'))
  memory.setUserDataPath(app.getPath('userData'))
  plugins.setSkillsDir(path.join(app.getPath('userData'), 'skills'))
  plugins.ensureExample()
  plugins.loadAll()
  logger.init(app.getPath('userData'))
  logger.info('App started')
  const port = await startServer()
  mark('server')
  createWindow(port)
  mark('window')
  registerShortcuts()

  if (app.isPackaged) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.checkForUpdatesAndNotify()
  }

  const startWake = () => {
    setWakeMode(true)
    require('./src/main/commands/timer').loadPending()
  }
  startWake()
  mark('wake')
  setTimeout(() => lifeTick(), 30000)
  setInterval(() => lifeTick(), 60000)
  mark('ready')

  const iconPath = path.join(__dirname, 'assets', 'icon.png')
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createFromDataURL('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="%234fc3f7"/></svg>')
  tray = new Tray(icon)
  tray.setToolTip('VoxDesk')
  const ctxMenu = Menu.buildFromTemplate([
    { label: 'Mostrar', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: '🎤 Escuchar', accelerator: 'Ctrl+Shift+V', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('status:update', 'toggle-recording') } } },
    { label: '🛑 Silenciar micrófono', click: () => { exec('powershell -NoProfile -Command "$d = Get-CimInstance -Namespace root/CIMV2 -ClassName Win32_SoundDevice | Select-Object -First 1; if ($d) { Invoke-CimMethod -InputObject $d -MethodName SetDeviceState -Arguments @{State = 0} }"', { timeout: 5000 }) } },
    { label: '🔊 Activar micrófono', click: () => { exec('powershell -NoProfile -Command "$d = Get-CimInstance -Namespace root/CIMV2 -ClassName Win32_SoundDevice | Select-Object -First 1; if ($d) { Invoke-CimMethod -InputObject $d -MethodName SetDeviceState -Arguments @{State = 1} }"', { timeout: 5000 }) } },
    { label: '🔇 No molestar', click: () => { exec('powershell -NoProfile -Command "Set-ItemProperty -Path \'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\' -Name \'NOC_GLOBAL_SETTING_TOASTS_ENABLED\' -Value 0 -Type DWord -Force"', { timeout: 5000 }) } },
    { label: '🔔 Quitar no molestar', click: () => { exec('powershell -NoProfile -Command "Set-ItemProperty -Path \'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\' -Name \'NOC_GLOBAL_SETTING_TOASTS_ENABLED\' -Value 1 -Type DWord -Force"', { timeout: 5000 }) } },
    { type: 'separator' },
    { label: '📸 Capturar pantalla', click: () => { exec('powershell -NoProfile -Command "Start-Process ms-screenclip:"', { timeout: 5000 }) } },
    { label: '📋 Abrir guía de comandos', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('status:update', 'toggle-guide') } } },
    { type: 'separator' },
    { label: '🔎 Buscar actualizaciones', click: () => { ipcMain.emit('update:check-request') } },
    { label: 'ℹ️ Acerca de VoxDesk', click: () => { dialog.showMessageBox(mainWindow, { type: 'info', title: 'Acerca de VoxDesk', message: 'VoxDesk ' + app.getVersion(), detail: 'Asistente de voz para Windows.\nEl audio se procesa localmente en tu PC.\n\nPolítica de privacidad: PRIVACY.md incluido en el proyecto.' }) } },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() },
  ])
  tray.setContextMenu(ctxMenu)
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
})

app.on('window-all-closed', () => {
  wake.stop(); server?.close(); globalShortcut.unregisterAll(); app.quit()
})

app.on('will-quit', () => {
  wake.stop(); server?.close(); globalShortcut.unregisterAll()
})

autoUpdater.on('update-available', () => {
  logger.info('Update available')
  if (mainWindow) mainWindow.webContents.send('update:status', 'available')
})
autoUpdater.on('update-downloaded', () => {
  logger.info('Update downloaded')
  if (mainWindow) mainWindow.webContents.send('update:status', 'downloaded')
  // Fase 4: nunca reiniciar sin permiso; el usuario elige cuándo.
  if (!mainWindow) return
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    buttons: ['Instalar y reiniciar', 'Al salir'],
    defaultId: 0,
    title: 'Actualización de VoxDesk',
    message: 'Hay una actualización lista. ¿La instalamos?',
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall()
  }).catch(() => {})
})
autoUpdater.on('error', (err) => {
  logger.error('Update error: ' + (err && err.message))
})

ipcMain.handle('update:check', () => {
  if (!app.isPackaged) return { message: 'Solo disponible en la app instalada' }
  autoUpdater.checkForUpdatesAndNotify()
  return { message: 'Buscando actualizaciones...' }
})

ipcMain.on('update:check-request', () => {
  if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify()
})
