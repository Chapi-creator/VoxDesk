const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  executeCommand: (transcript) => ipcRenderer.invoke('command:execute', transcript),
  recognizeSpeech: () => ipcRenderer.invoke('speech:recognize'),
  speak: (text) => ipcRenderer.invoke('tts:speak', text),
  stopSpeaking: () => ipcRenderer.invoke('tts:stop'),
  toggleWake: () => ipcRenderer.invoke('wake:toggle'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (data) => ipcRenderer.invoke('config:save', data),
  askLlm: (prompt) => ipcRenderer.invoke('llm:ask', prompt),
  listModels: (apiKey, provider) => ipcRenderer.invoke('llm:models', apiKey, provider),
  clearLlmHistory: () => ipcRenderer.invoke('llm:clear'),
  getHelp: () => ipcRenderer.invoke('help:get'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onStatusUpdate: (callback) => {
    ipcRenderer.on('status:update', (_event, data) => callback(data))
  },
  onWakeDetected: (callback) => {
    ipcRenderer.on('wake:detected', (_event, cmd) => callback(cmd))
  },
  onWakeResult: (callback) => {
    ipcRenderer.on('wake:result', (_event, result) => callback(result))
  },
  onWakeToggle: (callback) => {
    ipcRenderer.on('wake:toggle', (_event, on) => callback(on))
  },
  onModelInfo: (callback) => {
    ipcRenderer.on('model:info', (_event, info) => callback(info))
  },
  onAudioLevel: (callback) => {
    ipcRenderer.on('audio:level', (_event, data) => callback(data))
  },
  checkTts: () => ipcRenderer.invoke('tts:check'),
  getPreference: (key) => ipcRenderer.invoke('memory:get', key),
  setPreference: (key, value) => ipcRenderer.invoke('memory:set', key, value),
})
