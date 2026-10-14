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
    this.elements.patience = document.getElementById('settings-patience')
    this.elements.ptt = document.getElementById('settings-ptt')
    this.elements.followUp = document.getElementById('settings-followup')
    this.elements.endPause = document.getElementById('settings-endpause')
    this.elements.voiceModel = document.getElementById('settings-voicemodel')
    this.elements.modelStatus = document.getElementById('settings-model-status')
    this.elements.modelDlBtn = document.getElementById('btn-model-dl')
    this.elements.modelMeter = document.getElementById('settings-model-meter')
    this.elements.modelFill = document.getElementById('settings-model-fill')
    this.elements.semStatus = document.getElementById('settings-sem-status')
    this.elements.semDlBtn = document.getElementById('btn-sem-dl')
    this.elements.semMeter = document.getElementById('settings-sem-meter')
    this.elements.semFill = document.getElementById('settings-sem-fill')
    this.elements.username = document.getElementById('settings-username')
    this.elements.proactivity = document.getElementById('settings-proactivity')
    this.elements.voice = document.getElementById('settings-voice')
    this.elements.remote = document.getElementById('settings-remote')
    this.elements.remoteInfo = document.getElementById('settings-remote-info')
    this.elements.remoteQr = document.getElementById('settings-remote-qr')
    this.elements.remoteQrBtn = document.getElementById('btn-remote-qr')
    this.elements.remoteRevokeBtn = document.getElementById('btn-remote-revoke')
    this.elements.customVoices = document.getElementById('settings-custom-voices')
    this.elements.voiceUrl = document.getElementById('settings-voice-url')
    this.elements.voiceAddBtn = document.getElementById('btn-voice-add')
    this.elements.voiceStatus = document.getElementById('settings-voice-status')
    this.elements.voiceRate = document.getElementById('settings-voicerate')
    this.elements.voiceRateVal = document.getElementById('settings-voicerate-val')
    this.elements.ttsTestBtn = document.getElementById('btn-tts-test')
    this.elements.ttsDiagBtn = document.getElementById('btn-tts-diag')
    this.elements.ttsStatus = document.getElementById('settings-tts-status')
    this.elements.saveBtn = document.getElementById('btn-settings-save')
    this.elements.aiKeyBtn = document.getElementById('btn-ai-key')
    this.elements.aiLocalBtn = document.getElementById('btn-ai-local')
    this.elements.ollamaDlBtn = document.getElementById('btn-ollama-dl')
    this.elements.ollamaPullBtn = document.getElementById('btn-ollama-pull')
    this.elements.ollamaStatus = document.getElementById('settings-ollama-status')
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
    if (typeof cfg.followUp === 'boolean' && this.elements.followUp) this.elements.followUp.checked = cfg.followUp
    if (cfg.patience && this.elements.patience) this.elements.patience.value = cfg.patience
    if (this.elements.ptt) this.elements.ptt.checked = !!cfg.pttMode
    if (cfg.voiceModel && this.elements.voiceModel) this.elements.voiceModel.value = cfg.voiceModel
    if (typeof cfg.remoteEnabled === 'boolean' && this.elements.remote) this.elements.remote.checked = cfg.remoteEnabled
    this._refreshRemote()
    this._refreshModelStatus()
    if (cfg.proactivity && this.elements.proactivity) this.elements.proactivity.value = cfg.proactivity
    if (cfg.voice && this.elements.voice) this.elements.voice.value = cfg.voice
    if (this.elements.remote) this.elements.remote.checked = !!cfg.remoteEnabled
    this._refreshRemote()
    if (cfg.voiceRate && this.elements.voiceRate) { this.elements.voiceRate.value = cfg.voiceRate; this.elements.voiceRateVal.textContent = cfg.voiceRate }
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
    if (this.elements.voiceRate) this.elements.voiceRate.addEventListener('input', () => {
      this.elements.voiceRateVal.textContent = this.elements.voiceRate.value
    })

    this.elements.gearBtn.addEventListener('click', () => this.toggle())
    this.elements.backBtn.addEventListener('click', () => this.close())
    this.elements.saveBtn.addEventListener('click', () => this.save())
    if (this.elements.ttsTestBtn) this.elements.ttsTestBtn.addEventListener('click', () => {
      window.api.speak('Hola, soy Vox. ¿Me escuchas bien?').catch(() => {})
    })
    if (this.elements.ttsDiagBtn) this.elements.ttsDiagBtn.addEventListener('click', async () => {
      this.elements.ttsStatus.textContent = 'Diagnosticando…'
      try {
        const r = await window.api.ttsSelfTest()
        if (r.engine !== 'piper') this.elements.ttsStatus.textContent = 'Motor sistema: prueba con el botón Probar voz.'
        else if (!r.generated) this.elements.ttsStatus.textContent = 'Falla al GENERAR voz: ' + (r.error || '?')
        else if (r.played === false) this.elements.ttsStatus.textContent = `Voz generada (${r.size} bytes) pero NO suena: revisa volumen/dispositivo de audio.`
        else this.elements.ttsStatus.textContent = 'Voz OK: genera y reproduce.'
      } catch {
        this.elements.ttsStatus.textContent = 'No se pudo diagnosticar.'
      }
    })
    if (this.elements.aiKeyBtn) this.elements.aiKeyBtn.addEventListener('click', () => {
      const g = document.getElementById('settings-key-guide')
      if (g) g.style.display = g.style.display === 'none' ? '' : 'none'
      window.api.openUrl('https://aistudio.google.com/apikey')
    })
    if (this.elements.aiLocalBtn) this.elements.aiLocalBtn.addEventListener('click', () => {
      this.elements.provider.value = 'local'
      this._toggleUrlField()
      this._fetchModels()
      this._refreshOllama()
    })
    if (this.elements.ollamaDlBtn) this.elements.ollamaDlBtn.addEventListener('click', async () => {
      this.elements.ollamaStatus.textContent = 'Descargando instalador… complétalo y vuelve.'
      await window.api.ollamaInstall()
    })
    if (this.elements.remoteQrBtn) this.elements.remoteQrBtn.addEventListener('click', async () => {
      try {
        const qr = await window.api.remoteQr()
        if (qr && qr.dataUrl && this.elements.remoteQr) {
          this.elements.remoteQr.src = qr.dataUrl
          this.elements.remoteQr.style.display = ''
        } else if (this.elements.remoteInfo) {
          this.elements.remoteInfo.textContent = 'Guarda primero con remoto activado.'
        }
      } catch {}
    })
    if (this.elements.remoteRevokeBtn) this.elements.remoteRevokeBtn.addEventListener('click', async () => {
      try {
        await window.api.remoteRevoke()
        if (this.elements.remoteQr) this.elements.remoteQr.style.display = 'none'
        this._refreshRemote()
      } catch {}
    })
    if (this.elements.modelDlBtn) this.elements.modelDlBtn.addEventListener('click', async () => {
      this.elements.modelDlBtn.disabled = true
      this.elements.modelMeter.style.display = ''
      this.elements.modelFill.style.width = '0%'
      this.elements.modelStatus.textContent = 'Descargando 2.3 GB… no cierres.'
      await window.api.modelsDownloadLarge()
    })
    if (window.api.onModelsProgress) window.api.onModelsProgress((r) => {
      if (r.busy) {
        if (this.elements.modelStatus) this.elements.modelStatus.textContent = 'Ya hay una descarga en curso.'
        return
      }
      if (this.elements.modelFill) this.elements.modelFill.style.width = (r.pct || 0) + '%'
      if (r.phase === 'resume' && this.elements.modelStatus) {
        this.elements.modelStatus.textContent = `Reanudando desde ${r.MB || 0} MB…`
      } else if (r.phase === 'download' && this.elements.modelStatus && r.totalMB) {
        this.elements.modelStatus.textContent = `Descargando… ${r.MB}/${r.totalMB} MB (si se corta, reanuda).`
      } else if (r.phase === 'retry' && this.elements.modelStatus) {
        this.elements.modelStatus.textContent = `Corte de red, reintentando (${r.attempt}/3)…`
      } else if (r.phase === 'extract' && this.elements.modelStatus) {
        this.elements.modelStatus.textContent = 'Extrayendo, tarda ~10 min… no cierres.'
      } else if (r.phase === 'verify' && this.elements.modelStatus) {
        this.elements.modelStatus.textContent = 'Verificando…'
      }
      if (r.done) {
        if (this.elements.modelMeter) this.elements.modelMeter.style.display = 'none'
        if (this.elements.modelDlBtn) this.elements.modelDlBtn.disabled = false
        if (r.ok) {
          this._refreshModelStatus()
        } else if (this.elements.modelStatus) {
          this.elements.modelStatus.textContent = 'No se pudo: ' + (r.error || 'error desconocido')
          if (this.elements.modelDlBtn) { this.elements.modelDlBtn.style.display = ''; this.elements.modelDlBtn.textContent = 'Reintentar descarga' }
        }
      }
    })
    if (this.elements.semDlBtn) this.elements.semDlBtn.addEventListener('click', async () => {
      this.elements.semDlBtn.disabled = true
      this.elements.semMeter.style.display = ''
      this.elements.semFill.style.width = '0%'
      this.elements.semStatus.textContent = 'Descargando cerebro (~135 MB)… no cierres.'
      await window.api.semanticDownload()
    })
    if (window.api.onSemanticProgress) window.api.onSemanticProgress((r) => {
      if (r.busy) {
        if (this.elements.semStatus) this.elements.semStatus.textContent = 'Ya hay una descarga en curso.'
        return
      }
      if (this.elements.semFill) this.elements.semFill.style.width = (r.pct || 0) + '%'
      if (r.phase === 'download' && this.elements.semStatus && r.totalMB) {
        this.elements.semStatus.textContent = `Descargando ${r.file || ''}… ${r.MB}/${r.totalMB} MB (si se corta, reanuda).`
      } else if (r.phase === 'retry' && this.elements.semStatus) {
        this.elements.semStatus.textContent = `Corte de red, reintentando (${r.attempt}/3)…`
      } else if (r.phase === 'verify' && this.elements.semStatus) {
        this.elements.semStatus.textContent = 'Verificando…'
      }
      if (r.done) {
        if (this.elements.semMeter) this.elements.semMeter.style.display = 'none'
        if (this.elements.semDlBtn) this.elements.semDlBtn.disabled = false
        if (r.ok) {
          this._refreshSemStatus()
        } else if (this.elements.semStatus) {
          this.elements.semStatus.textContent = 'No se pudo: ' + (r.error || 'error desconocido')
          if (this.elements.semDlBtn) { this.elements.semDlBtn.style.display = ''; this.elements.semDlBtn.textContent = 'Reintentar' }
        }
      }
    })
    if (this.elements.voiceAddBtn) this.elements.voiceAddBtn.addEventListener('click', async () => {
      const url = (this.elements.voiceUrl.value || '').trim()
      if (!url) { this.elements.voiceStatus.textContent = 'Pega primero el link .onnx.'; return }
      this.elements.voiceStatus.textContent = 'Descargando voz… tarda unos minutos.'
      try {
        const v = await window.api.voicesAdd('', url)
        this.elements.voiceUrl.value = ''
        this.elements.voiceStatus.textContent = `Voz "${v.name}" lista.`
        await this._refreshCustomVoices('custom:' + v.file)
      } catch (e) {
        this.elements.voiceStatus.textContent = 'No se pudo: ' + (e.message || 'revisa el link')
      }
    })
    if (this.elements.ollamaPullBtn) this.elements.ollamaPullBtn.addEventListener('click', async () => {
      const model = this.elements.model.value || 'qwen2.5:1.5b'
      this.elements.ollamaStatus.textContent = `Bajando ${model}… tarda varios minutos.`
      await window.api.ollamaPull(model)
    })
    if (window.api.onOllamaPullDone) window.api.onOllamaPullDone((r) => {
      this.elements.ollamaStatus.textContent = r.ok ? `Modelo ${r.model} listo.` : 'Falló la descarga del modelo.'
    })
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
    this._refreshOllama()
    this._refreshModelStatus()
    this._refreshSemStatus()
    await this._refreshCustomVoices()
    const p = this.elements.provider.value
    if (p === 'local' || this.elements.apiKey.value.trim()) await this._fetchModels()
  }

  async _refreshCustomVoices(savedVoice) {
    const box = this.elements.customVoices
    const sel = this.elements.voice
    if (!box || !sel) return
    box.querySelectorAll('[data-custom]').forEach(el => el.remove())
    let list = []
    try { list = await window.api.voicesList() } catch {}
    for (const v of list) {
      const val = 'custom:' + v.file
      if (![...sel.options].some(o => o.value === val)) {
        const opt = document.createElement('option')
        opt.value = val
        opt.textContent = v.name + ' (mía)'
        opt.setAttribute('data-custom', '1')
        sel.appendChild(opt)
      }
      const row = document.createElement('div')
      row.setAttribute('data-custom', '1')
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:10px;color:rgba(255,255,255,0.4);padding:2px 0'
      const label = document.createElement('span')
      label.textContent = v.name
      const del = document.createElement('button')
      del.textContent = 'quitar'
      del.className = 'btn-start'
      del.style.cssText = 'padding:2px 8px;font-size:10px'
      del.addEventListener('click', async () => {
        try { await window.api.voicesRemove(v.file) } catch {}
        if (sel.value === val) sel.value = 'mexicana'
        this._refreshCustomVoices(sel.value)
      })
      row.appendChild(label)
      row.appendChild(del)
      box.appendChild(row)
    }
    if (savedVoice && [...sel.options].some(o => o.value === savedVoice)) sel.value = savedVoice
  }

  async _refreshModelStatus() {
    if (!this.elements.modelStatus) return
    try {
      const st = await window.api.modelsStatus()
      if (st.largeDownloaded) {
        this.elements.modelStatus.textContent = `✓ Modelo preciso instalado (${st.MB || '?'} MB). Elíguelo arriba.`
        if (this.elements.modelDlBtn) this.elements.modelDlBtn.style.display = 'none'
        if (this.elements.modelMeter) this.elements.modelMeter.style.display = 'none'
      } else if (st.missing && st.missing.length) {
        this.elements.modelStatus.textContent = `Incompleto (${st.MB || 0} MB): faltan ${st.missing.join(', ')}. Reintenta.`
        if (this.elements.modelDlBtn) { this.elements.modelDlBtn.style.display = ''; this.elements.modelDlBtn.textContent = 'Reintentar descarga' }
      } else {
        this.elements.modelStatus.textContent = 'Modelo preciso no descargado (2.3 GB).'
        if (this.elements.modelDlBtn) { this.elements.modelDlBtn.style.display = ''; this.elements.modelDlBtn.textContent = 'Descargar preciso' }
      }
    } catch {
      this.elements.modelStatus.textContent = ''
    }
  }

  async _refreshSemStatus() {
    if (!this.elements.semStatus) return
    try {
      const st = await window.api.semanticStatus()
      if (st.available) {
        this.elements.semStatus.textContent = '✓ Cerebro activo: entiende ideas, no solo palabras.'
        if (this.elements.semDlBtn) this.elements.semDlBtn.style.display = 'none'
        if (this.elements.semMeter) this.elements.semMeter.style.display = 'none'
      } else {
        this.elements.semStatus.textContent = 'Cerebro no descargado (~135 MB, una vez). Sin él, Vox usa reglas.'
        if (this.elements.semDlBtn) { this.elements.semDlBtn.style.display = ''; this.elements.semDlBtn.textContent = 'Activar cerebro (~135 MB)' }
      }
    } catch {
      this.elements.semStatus.textContent = ''
    }
  }

  async _refreshRemote() {
    if (!this.elements.remoteInfo) return
    try {
      const info = await window.api.remoteInfo()
      if (!info.enabled) {
        this.elements.remoteInfo.textContent = 'Apagado. Actívalo y guarda para usarlo en tu WiFi.'
        if (this.elements.remoteQr) this.elements.remoteQr.style.display = 'none'
        return
      }
      this.elements.remoteInfo.textContent = info.url ? `Escucha en ${info.url} (solo tu WiFi)` : 'Activado: guarda para ver la dirección.'
    } catch {
      this.elements.remoteInfo.textContent = ''
    }
  }

  async _refreshOllama() {
    if (!this.elements.ollamaStatus || !window.api.ollamaStatus) return
    try {
      const st = await window.api.ollamaStatus()
      this.elements.ollamaStatus.textContent = !st.installed
        ? 'Ollama no detectado.'
        : `Ollama ${st.version} · modelos: ${st.models.length ? st.models.join(', ') : 'ninguno'}.`
    } catch {
      this.elements.ollamaStatus.textContent = ''
    }
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
    const keyWarn = await window.api.validateKey(this.elements.apiKey.value.trim(), this.elements.provider.value, this.elements.apiUrl.value.trim()).catch(() => null)
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
      patience: ['tranquilo', 'normal', 'rapido'].includes(this.elements.patience && this.elements.patience.value) ? this.elements.patience.value : 'normal',
      pttMode: !!(this.elements.ptt && this.elements.ptt.checked),
      followUp: !this.elements.followUp || !!this.elements.followUp.checked,
      remoteEnabled: !!(this.elements.remote && this.elements.remote.checked),
      voiceModel: this.elements.voiceModel ? this.elements.voiceModel.value : 'small',
      proactivity: this.elements.proactivity ? this.elements.proactivity.value : 'total',
      voice: this.elements.voice ? this.elements.voice.value : 'mexicana',
      voiceRate: this.elements.voiceRate ? parseFloat(this.elements.voiceRate.value) || 1 : 1,
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
    const base = data.apiKey || data.provider === 'local' ? `Configuración de ${data.provider} guardada.` : 'Sin API key. Solo comandos básicos.'
    this.elements.status.textContent = keyWarn ? `${keyWarn} (${base})` : base
    setTimeout(() => {
      this.elements.saveBtn.textContent = 'Guardar'
      this.elements.saveBtn.classList.remove('saved')
    }, 2000)
  }
}