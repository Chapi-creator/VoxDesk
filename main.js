const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, dialog } = require('electron')
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
const memory = require('./src/main/memory')
const logger = require('./src/main/logger')
const PROVIDER_LIST = () => Object.entries(llm.PROVIDERS || {}).map(([k, v]) => v.name).join(', ')

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.png': 'image/png',
}

let mainWindow = null
let server = null
let wakeMode = true
let forceQuit = false
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
    width: 400, height: 480, resizable: true, maxHeight: 560, maxWidth: 440,
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

function setWakeMode(on) {
  wakeMode = on
  if (wakeRestartTimer) { clearTimeout(wakeRestartTimer); wakeRestartTimer = null }
  if (on) {
    const cfg = config.load()
    wake.start(cfg.wakeWord || 'asistente')
  } else wake.stop()
  if (mainWindow) mainWindow.webContents.send('wake:toggle', on)
}

function registerShortcuts() {
  globalShortcut.register('Ctrl+Shift+V', () => {
    if (mainWindow) {
      mainWindow.show(); mainWindow.focus()
      mainWindow.webContents.send(IPC_CHANNELS.STATUS_UPDATE, 'toggle-recording')
    }
  })
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

ipcMain.handle('speech:recognize', async () => {
  if (_speechBusy) { tts.speak('Estoy ocupado, espera un momento').catch(() => {}); return { error: 'Ocupado' } }
  if (!wake.isRunning()) {
    const cfg = config.load()
    const ok = wake.start(cfg.wakeWord || 'asistente')
    if (!ok) return { error: 'No se pudo iniciar la detección de voz: revisa que wake.exe esté junto a la app' }
  }
  _speechBusy = true
  try {
    const trigger = path.join(os.tmpdir(), 'voxdesk_listen_trigger')
    try { fs.writeFileSync(trigger, '1') } catch {}
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

// Fase 3: los patrones delicados de smart-exec (apagar, borrar, matar…) piden permiso.
smartExec.setConfirm(async (title, detail) => {
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
})

async function _handleOne(transcript, _depth = 0) {  if (!transcript) return { success: false, message: 'No te escuché' }
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

  const smartResult = await smartExec.execute(t)
  if (smartResult) {
    if (smartResult._macro && Array.isArray(smartResult._macro)) {
      if (_depth > 5) return { success: false, message: 'Macro omitida — demasiado anidamiento' }
      for (const cmd of smartResult._macro) await _handleOne(cmd, _depth + 1)
      return { success: true, message: 'Macro ejecutada', speak: true }
    }
    return smartResult
  }

  if (_cfg.provider === 'local' || _cfg.apiKey) {
    if (mainWindow) mainWindow.webContents.send('model:info', `${_cfg.provider || 'gemini'}/${_cfg.model || '?'}`)
    const answer = await llm.ask(t)
    if (answer) return await _processLlmAnswer(answer)
  }
  return { success: false, message: `No entendí: "${t}". Di la palabra de activación de IA al inicio si necesitas ayuda.` }
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

  return _r(await _handleOne(transcript))
  } catch (e) {
    return _r({ success: false, message: 'Error: ' + e.message })
  }
})

ipcMain.handle('tts:speak', async (_event, text) => {
  await tts.speak(text)
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
    } catch (e) {
      return { success: true, message: (explanation || 'Hecho') + '\n\n¿Necesitas algo más?', speak: true }
    } finally {
      try { fs.unlinkSync(tmpPS) } catch {}
    }
  }
  return { success: true, message: answer, speak: true }
}

ipcMain.handle('tts:check', () => tts.isAvailable())

ipcMain.handle('memory:get', (_e, key) => memory.get(key))
ipcMain.handle('memory:set', (_e, key, value) => memory.set(key, value))

ipcMain.handle('help:get', () => {
  const cmds = Object.values(require('./src/shared/constants').COMMANDS)
  const patterns = require('./src/main/smart-exec').getHelp()
  return { commands: cmds, groups: patterns }
})

ipcMain.handle('window:minimize', () => mainWindow?.hide())
ipcMain.handle('window:close', () => mainWindow?.hide())

wake.onWake = (command) => {
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
  if (mainWindow) {
    const result = await _handleOne(text)
    result._text = text
    mainWindow.webContents.send('wake:result', result)
  }
}

wake.onError = (error) => {
  if (mainWindow) mainWindow.webContents.send('wake:result', { success: false, message: error })
}

app.whenReady().then(async () => {
  app.setPath('userData', path.join(app.getPath('appData'), 'ai-desktop-assistant'))
  config.setUserDataPath(app.getPath('userData'))
  memory.setUserDataPath(app.getPath('userData'))
  logger.init(app.getPath('userData'))
  logger.info('App started')
  const port = await startServer()
  createWindow(port)
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
    { label: 'Salir', click: () => { forceQuit = true; app.quit() } },
  ])
  tray.setContextMenu(ctxMenu)
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus() })

  mainWindow.on('close', () => { forceQuit = true })
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
