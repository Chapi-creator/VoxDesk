/*global VoiceModule, UIManager, SettingsManager, GuideManager, OnboardingManager*/
;(() => {
  const voice = new VoiceModule()
  const ui = new UIManager()
  const settings = new SettingsManager()
  const guide = new GuideManager()
  const ob = new OnboardingManager()
  ob.onTry = (text) => handleCommand(text)

  window.api.getPreference('onboarding_done').then(done => {
    if (!done) ob.start(() => window.api.setPreference('onboarding_done', '1'))
  })

  let _thinkTimer = null
  let _idleTimer = null
  // Kill-switch visible: mientras hay flujo en curso, el botón de hablar PARA.
  // Los resultados tardíos se descartan (cada stop invalida el flujo anterior).
  let _busy = false
  let _flowId = 0
  const _alive = (myFlow) => myFlow === _flowId && _busy

  function stopAll() {
    _flowId++
    _busy = false
    window.api.stopSpeaking()
    window.api.cancelSpeech()
    ui.showResponse('Detenido')
    ui.setIdle()
  }

  async function handleCommand(transcript) {
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null }
    _busy = true
    const myFlow = ++_flowId
    const prev = ui.elements.transcript?.textContent
    if (prev && prev !== '""') ui.pushHistory(prev.replace(/^"/,'').replace(/"$/,''), ui.elements.response?.textContent || '')
    ui.showTranscript(transcript)
    ui.setProcessing()
    _thinkTimer = setTimeout(() => ui.setThinking(), 1500)
    try {
      const result = await window.api.executeCommand(transcript)
      clearTimeout(_thinkTimer); _thinkTimer = null
      if (!_alive(myFlow)) return
      if (result.stop) { ui.showResponse(result.message || 'Detenido'); ui.setIdle(); _busy = false; return }
      ui.setRecording(!!result.recording)
      if (result._tts !== undefined) ui.setTtsAvailable(result._tts)
      ui.showResponse(result.message)
      window.api.followupArm().catch(() => {})
      if (result.success && result.speak) {
        ui.setSpeaking()
        await say(result.message)
        if (!_alive(myFlow)) return
      } else {
        _idleTimer = setTimeout(() => { _idleTimer = null; ui.setIdle() }, 3000)
        if (_alive(myFlow)) _busy = false
        return
      }
    } catch (e) {
      clearTimeout(_thinkTimer); _thinkTimer = null
      if (!_alive(myFlow)) return
      ui.setError('Error: ' + ((e && e.message) || 'reintenta o revisa el micrófono'))
    }
    if (_alive(myFlow)) _busy = false
    ui.setIdle()
  }

  async function handleResult(result) {
    clearTimeout(_thinkTimer); _thinkTimer = null
    _busy = true
    const myFlow = ++_flowId
    if (result.stop) { ui.showResponse(result.message || 'Detenido'); ui.setIdle(); _busy = false; return }
    ui.setProcessing()
    ui.setRecording(!!result.recording)
    if (result._tts !== undefined) ui.setTtsAvailable(result._tts)
    ui.showResponse(result.message)
    window.api.followupArm().catch(() => {})
    if (result.success && result.speak) {
      ui.setSpeaking()
      await say(result.message)
      if (!_alive(myFlow)) return
    } else {
      _idleTimer = setTimeout(() => { _idleTimer = null; ui.setIdle() }, 3000)
      if (_alive(myFlow)) _busy = false
      return
    }
    if (_alive(myFlow)) _busy = false
    ui.setIdle()
  }

  ui.onToggle = () => {
    if (settings.open || guide.open) return
    if (_busy) { stopAll(); return }
    if (voice.isListening) voice.stop()
    else voice.start()
  }

  ui.onStop = () => { stopAll() }

  ui.onFeedback = (transcript, good) => {
    window.api.cacheFeedback(transcript, good).catch(() => {})
  }

  voice.onResult = (transcript) => { handleCommand(transcript) }

  window.api.getConfig().then(cfg => {
    voice._pttMode = !!cfg.pttMode
  }).catch(() => {})

  // A2 PTT: mantener Ctrl+Shift+V = hablar sin cortes (solo con ventana al frente).
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyV' && !e.repeat) {
      if (voice.pttDown()) e.preventDefault()
    }
  })
  document.addEventListener('keyup', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyV') voice.pttUp()
  })

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
    if (data === 'idle-now' && !settings.open) ui.setIdle()
  })

  window.api.onAudioLevel((data) => {
    ui.setAudioLevel(data.level, data.speaking, data.vad, data.clipped)
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

  window.api.onLifeEvent(async (ev) => {
    if (!ev || settings.open) return
    if (ev.text) {
      ui.pushHistory('[sistema]', ev.text)
      ui.showResponse(ev.text)
      if (ev.speak) {
        ui.setSpeaking()
        await say(ev.text)
        ui.setIdle()
      }
    }
  })

  const cmdInput = document.getElementById('cmd-input')
  if (cmdInput) {
    cmdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const t = cmdInput.value.trim()
        if (t && !settings.open && !guide.open) {
          cmdInput.value = ''
          handleCommand(t)
        }
      }
    })
  }

  document.getElementById('wake-indicator')?.addEventListener('click', () => {
    window.api.toggleWake()
  })

  guide.onSelect = (text) => handleCommand(text)
  guide.onApprove = (message) => {
    ui.pushHistory('[aprobado]', message)
    ui.showResponse(message)
  }

  ui.init()
  settings.init()
  guide.init()
  window.api.getTtsEngine().then(({ engine, ok }) => ui.setTtsEngine(engine, ok)).catch(() => {})
  window.api.appHealth().then((checks) => ui.showHealth(checks)).catch(() => {})
  const refreshTimers = () => {
    window.api.timersList().then((list) => ui.refreshTimers(list)).catch(() => {})
  }
  refreshTimers()
  setInterval(refreshTimers, 5000)

  // A2: mute frontal con persistencia. Todo speak pasa por say().
  let _muted = false
  window.api.getPreference('vox_muted').then(v => {
    _muted = v === '1' || v === true
    updateMuteBtn()
  }).catch(() => {})
  const muteBtn = document.getElementById('btn-mute')
  function updateMuteBtn() {
    if (muteBtn) muteBtn.textContent = _muted ? '🔇' : '🔊'
  }
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      _muted = !_muted
      window.api.setPreference('vox_muted', _muted ? '1' : '').catch(() => {})
      updateMuteBtn()
      if (_muted) { window.api.stopSpeaking(); window.api.cancelSpeech() }
    })
  }
  async function say(text) {
    if (_muted || !text) return
    await window.api.speak(text)
  }
  const voiceBtn = document.getElementById('btn-test-voice')
  if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
      window.api.speak('Hola, soy Vox. ¿Me escuchas bien?').catch(() => {})
    })
  }
  ui.setIdle()
})()
