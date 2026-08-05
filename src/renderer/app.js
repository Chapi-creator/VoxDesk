;(() => {
  const voice = new VoiceModule()
  const ui = new UIManager()
  const settings = new SettingsManager()
  const guide = new GuideManager()
  const onboarding = document.getElementById('onboarding')
  const startBtn = document.getElementById('btn-start')

  let _thinkTimer = null
  let _idleTimer = null

  async function handleCommand(transcript) {
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null }
    const prev = ui.elements.transcript?.textContent
    if (prev && prev !== '""') ui.pushHistory(prev.replace(/^"/,'').replace(/"$/,''), ui.elements.response?.textContent || '')
    ui.showTranscript(transcript)
    ui.setProcessing()
    _thinkTimer = setTimeout(() => ui.setThinking(), 1500)
    try {
      const result = await window.api.executeCommand(transcript)
      clearTimeout(_thinkTimer); _thinkTimer = null
      if (result.stop) { ui.showResponse(result.message || 'Detenido'); ui.setIdle(); return }
      ui.setRecording(!!result.recording)
      if (result._tts !== undefined) ui.setTtsAvailable(result._tts)
      ui.showResponse(result.message)
      if (result.success && result.speak) {
        ui.setSpeaking()
        await window.api.speak(result.message)
      } else {
        _idleTimer = setTimeout(() => { _idleTimer = null; ui.setIdle() }, 3000)
        return
      }
    } catch (e) {
      clearTimeout(_thinkTimer); _thinkTimer = null
      ui.setError('Error interno')
    }
    ui.setIdle()
  }

  async function handleResult(result) {
    clearTimeout(_thinkTimer); _thinkTimer = null
    if (result.stop) { ui.showResponse(result.message || 'Detenido'); ui.setIdle(); return }
    ui.setProcessing()
    ui.setRecording(!!result.recording)
    if (result._tts !== undefined) ui.setTtsAvailable(result._tts)
    ui.showResponse(result.message)
    if (result.success && result.speak) {
      ui.setSpeaking()
      await window.api.speak(result.message)
      ui.setIdle()
    } else {
      _idleTimer = setTimeout(() => { _idleTimer = null; ui.setIdle() }, 3000)
    }
  }

  ui.onToggle = () => {
    if (settings.open || guide.open) return
    if (voice.isListening) voice.stop()
    else voice.start()
  }

  ui.onStop = () => {
    window.api.stopSpeaking()
    window.api.cancelSpeech()
    ui.setIdle()
  }

  voice.onResult = (transcript) => { handleCommand(transcript) }

  voice.onError = (error) => {
    ui.setError(error)
    setTimeout(() => ui.setIdle(), 2000)
  }

  voice.onStateChange = (listening) => {
    if (listening && !settings.open) ui.setListening()
    if (!listening && !ui.elements.window?.classList.contains('active')) ui.setIdle()
  }

  window.api.onStatusUpdate((data) => {
    if (data === 'toggle-recording' && !settings.open) ui.onToggle()
    if (data === 'toggle-guide' && !settings.open) guide.toggle()
  })

  window.api.onAudioLevel((data) => {
    ui.setAudioLevel(data.level, data.speaking, data.vad)
  })

  window.api.onWakeDetected(async (command) => {
    if (settings.open) return
    if (command) { handleCommand(command); return }
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null }
    ui.setListening()
    ui.showTranscript('...')
  })

  window.api.onWakeResult((result) => {
    if (!result) return
    clearTimeout(_thinkTimer); _thinkTimer = null
    if (result._text) ui.showTranscript(result._text)
    handleResult(result)
  })

  window.api.onWakeToggle((on) => {
    ui.setWake(on)
  })

  window.api.onModelInfo((info) => {
    ui.setModelInfo(info)
  })

  document.getElementById('wake-indicator')?.addEventListener('click', () => {
    window.api.toggleWake()
  })

  window.api.getPreference('onboarding_done').then(done => {
    if (!done && onboarding) {
      onboarding.classList.add('open')
      startBtn?.addEventListener('click', () => {
        onboarding.classList.remove('open')
        window.api.setPreference('onboarding_done', '1')
      })
      ui.onToggle = (orig => function() {
        onboarding.classList.remove('open')
        window.api.setPreference('onboarding_done', '1')
        return orig.apply(this, arguments)
      })(ui.onToggle)
    }
  })

  ui.init()
  settings.init()
  guide.init()
  window.api.checkTts().then(ok => ui.setTtsAvailable(ok)).catch(() => {})
  ui.setIdle()
})()
