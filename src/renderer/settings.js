/*exported SettingsManager*/
class SettingsManager {
  constructor() {
    this.open = false
    this.elements = {}
    this._savedModel = ''
  }

  async init() {
    this.elements.panel = document.getElementById('settings-panel')
    this.elements.apiKey = document.getElementById('settings-apikey')
    this.elements.provider = document.getElementById('settings-provider')
    this.elements.model = document.getElementById('settings-model')
    this.elements.apiUrl = document.getElementById('settings-apiurl')
    this.elements.apiUrlRow = document.getElementById('settings-apiurl-row')
    this.elements.wakeWord = document.getElementById('settings-wakeword')
    this.elements.aiKeywords = document.getElementById('settings-aikeywords')
    this.elements.mic = document.getElementById('settings-mic')
    this.elements.endPause = document.getElementById('settings-endpause')
    this.elements.username = document.getElementById('settings-username')
    this.elements.proactivity = document.getElementById('settings-proactivity')
    this.elements.voice = document.getElementById('settings-voice')
    this.elements.saveBtn = document.getElementById('btn-settings-save')
    this.elements.status = document.getElementById('settings-status')
    this.elements.gearBtn = document.getElementById('btn-gear')
    this.elements.backBtn = document.getElementById('btn-settings-back')
    this.elements.modelsLoading = document.getElementById('settings-models-loading')
    this.elements.smtpHost = document.getElementById('settings-smtp-host')
    this.elements.smtpPort = document.getElementById('settings-smtp-port')
    this.elements.smtpUser = document.getElementById('settings-smtp-user')
    this.elements.smtpPass = document.getElementById('settings-smtp-pass')
    this.elements.smtpFrom = document.getElementById('settings-smtp-from')
    this.elements.systemPrompt = document.getElementById('settings-systemprompt')
    this.elements.temperature = document.getElementById('settings-temperature')
    this.elements.temperatureVal = document.getElementById('settings-temperature-val')
    this.elements.maxTokens = document.getElementById('settings-maxtokens')

    const cfg = await window.api.getConfig()
    if (cfg.apiKey) this.elements.apiKey.value = cfg.apiKey
    if (cfg.provider) this.elements.provider.value = cfg.provider
    if (cfg.model) this._savedModel = cfg.model
    if (cfg.apiUrl) this.elements.apiUrl.value = cfg.apiUrl
    if (cfg.wakeWord) this.elements.wakeWord.value = cfg.wakeWord
    if (cfg.aiKeywords) this.elements.aiKeywords.value = cfg.aiKeywords
    if (cfg.endPause) this.elements.endPause.value = cfg.endPause
    if (cfg.proactivity && this.elements.proactivity) this.elements.proactivity.value = cfg.proactivity
    if (cfg.voice && this.elements.voice) this.elements.voice.value = cfg.voice
    try {
      const savedName = await window.api.getPreference('vox_name')
      if (savedName && this.elements.username) this.elements.username.value = savedName
    } catch {}
    this._loadMics(cfg.micDevice || '')
    if (cfg.smtpHost) this.elements.smtpHost.value = cfg.smtpHost
    if (cfg.smtpPort) this.elements.smtpPort.value = cfg.smtpPort
    if (cfg.smtpUser) this.elements.smtpUser.value = cfg.smtpUser
    if (cfg.smtpPass) this.elements.smtpPass.value = cfg.smtpPass
    if (cfg.smtpFrom) this.elements.smtpFrom.value = cfg.smtpFrom
    if (cfg.systemPrompt) this.elements.systemPrompt.value = cfg.systemPrompt
    if (cfg.temperature != null) { this.elements.temperature.value = cfg.temperature; this.elements.temperatureVal.textContent = cfg.temperature }
    if (cfg.maxTokens) this.elements.maxTokens.value = cfg.maxTokens

    this.elements.temperature.addEventListener('input', () => {
      this.elements.temperatureVal.textContent = this.elements.temperature.value
    })

    this.elements.gearBtn.addEventListener('click', () => this.toggle())
    this.elements.backBtn.addEventListener('click', () => this.close())
    this.elements.saveBtn.addEventListener('click', () => this.save())
    this.elements.provider.addEventListener('change', () => { this._toggleUrlField(); this._fetchModels() })
    this.elements.apiKey.addEventListener('input', () => this._fetchModels())
    this._toggleUrlField()
  }

  _toggleUrlField() {
    const p = this.elements.provider.value
    const show = p === 'openai-custom' || p === 'local'
    this.elements.apiUrlRow.style.display = show ? '' : 'none'
  }

  async _loadMics(saved) {
    const sel = this.elements.mic
    if (!sel) return
    sel.innerHTML = ''
    const auto = document.createElement('option')
    auto.value = ''
    auto.textContent = 'Automático (primero disponible)'
    sel.appendChild(auto)
    try {
      const devs = await window.api.listMicDevices()
      for (const d of devs || []) {
        const opt = document.createElement('option')
        opt.value = d.name || String(d.index)
        opt.textContent = d.name || `Micrófono ${d.index}`
        sel.appendChild(opt)
      }
      if (saved) sel.value = saved
    } catch {}
  }

  async toggle() {
    if (this.open) this.close()
    else await this._open()
  }

  async _open() {
    this.open = true
    this.elements.panel.classList.add('open')
    this.elements.status.textContent = ''
    this.elements.saveBtn.textContent = 'Guardar'
    this.elements.saveBtn.classList.remove('saved')
    this._toggleUrlField()
    const p = this.elements.provider.value
    if (p === 'local' || this.elements.apiKey.value.trim()) await this._fetchModels()
  }

  close() {
    this.open = false
    this.elements.panel.classList.remove('open')
  }

  async _fetchModels() {
    const key = this.elements.apiKey.value.trim()
    const provider = this.elements.provider.value
    if (provider !== 'local' && !key) return
    this.elements.modelsLoading.textContent = 'Cargando modelos...'
    let models = await window.api.listModels(key, provider)
    if (!models || !models.length) models = [{ name: 'gemini-flash-latest', displayName: 'Gemini Flash (Latest)' }]
    const select = this.elements.model
    select.innerHTML = ''
    for (const m of models) {
      const opt = document.createElement('option')
      opt.value = m.name
      opt.textContent = m.displayName || m.name
      select.appendChild(opt)
    }
    if (this._savedModel && [...select.options].some(o => o.value === this._savedModel))
      select.value = this._savedModel
    this.elements.modelsLoading.textContent = ''
  }

  async save() {
    const ww = this.elements.wakeWord.value.trim()
    if (ww && !/^[a-záéíóúñ]+$/i.test(ww)) {
      this.elements.status.textContent = 'Solo letras permitidas en la palabra de activación'
      return
    }
    const data = {
      apiKey: this.elements.apiKey.value.trim(),
      provider: this.elements.provider.value,
      model: this.elements.model.value,
      apiUrl: this.elements.apiUrl.value.trim(),
      configured: this.elements.provider.value === 'local' || !!this.elements.apiKey.value.trim(),
      wakeWord: ww || 'asistente',
      aiKeywords: this.elements.aiKeywords.value.trim() || 'ia,bot,asistente',
      micDevice: this.elements.mic ? this.elements.mic.value : '',
      endPause: Math.min(5, Math.max(0.5, parseFloat(this.elements.endPause.value) || 1.2)),
      proactivity: this.elements.proactivity ? this.elements.proactivity.value : 'total',
      voice: this.elements.voice ? this.elements.voice.value : 'mexicana',
      smtpHost: this.elements.smtpHost.value.trim(),
      smtpPort: parseInt(this.elements.smtpPort.value) || 587,
      smtpUser: this.elements.smtpUser.value.trim(),
      smtpPass: this.elements.smtpPass.value,
      smtpFrom: this.elements.smtpFrom.value.trim(),
      systemPrompt: this.elements.systemPrompt.value.trim(),
      temperature: parseFloat(this.elements.temperature.value) || 0.7,
      maxTokens: parseInt(this.elements.maxTokens.value) || 4096,
    }
    const ok = await window.api.saveConfig(data)
    if (!ok) {
      this.elements.status.textContent = 'Error al guardar la configuración. Revisa los permisos de la carpeta AppData.'
      return
    }
    this._savedModel = data.model
    if (this.elements.username) {
      try { await window.api.setPreference('vox_name', this.elements.username.value.trim()) } catch {}
    }
    this.elements.saveBtn.textContent = '✓ Guardado'
    this.elements.saveBtn.classList.add('saved')
    this.elements.status.textContent = data.apiKey ? `Configuración de ${data.provider} guardada.` : 'Sin API key. Solo comandos básicos.'
    setTimeout(() => {
      this.elements.saveBtn.textContent = 'Guardar'
      this.elements.saveBtn.classList.remove('saved')
    }, 2000)
  }
}