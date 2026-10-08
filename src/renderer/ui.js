/*exported UIManager*/
class UIManager {
  constructor() {
    this.elements = {}
    this._level = 0
    this._peak = 0
    this._speaking = false
    this._vadState = 'idle'
    this._animFrame = null
    this._smoothLevel = 0
    this._smoothPeak = 0
  }

  init() {
    this.elements.status = document.getElementById('status')
    this.elements.transcript = document.getElementById('transcript')
    this.elements.response = document.getElementById('response')
    this.elements.history = document.getElementById('history')
    this.elements.btn = document.getElementById('btn-record')
    this.elements.levelMeter = document.getElementById('level-meter')
    this.elements.levelCanvas = document.getElementById('level-canvas')
    this.elements.vadLabel = document.getElementById('vad-label')
    this.elements.window = document.getElementById('window')
    this.elements.wakeIndicator = document.getElementById('wake-indicator')
    this.elements.modelInfo = document.getElementById('model-info')
    this.elements.recBadge = document.getElementById('rec-badge')
    this.elements.ttsOff = document.getElementById('tts-off')
    this.elements.btnStop = document.getElementById('btn-stop')
    this.elements.cmdInput = document.getElementById('cmd-input')

    if (this.elements.btn) {
      this.elements.btn.addEventListener('click', () => {
        if (this.onToggle) this.onToggle()
      })
    }

    if (this.elements.btnStop) {
      this.elements.btnStop.addEventListener('click', () => {
        if (this.onStop) this.onStop()
      })
    }

    this._initCanvas()
    this.setIdle()
  }

  _initCanvas() {
    const c = this.elements.levelCanvas
    if (!c) return
    const rect = this.elements.levelMeter.getBoundingClientRect()
    c.width = rect.width * window.devicePixelRatio || 320
    c.height = rect.height * window.devicePixelRatio || 40
    c.style.width = '100%'
    c.style.height = '100%'
    this._barCount = 48
    this._dpr = window.devicePixelRatio || 1
  }

  setAudioLevel(level, speaking, vad) {
    this._level = Math.min(1, Math.max(0, level))
    this._speaking = !!speaking
    this._vadState = vad || 'listening'
    if (!this._animFrame) this._startDrawLoop()
  }

  _startDrawLoop() {
    const draw = () => {
      this._drawLevels()
      const isActive = this._vadState === 'listening' || this._vadState === 'speaking'
      if (isActive || this._smoothLevel > 0.01) {
        this._animFrame = requestAnimationFrame(draw)
      } else {
        this._animFrame = null
      }
    }
    this._animFrame = requestAnimationFrame(draw)
  }

  _drawLevels() {
    const c = this.elements.levelCanvas
    if (!c) return
    const ctx = c.getContext('2d')
    const w = c.width
    const h = c.height

    this._smoothLevel += (this._level - this._smoothLevel) * 0.3
    this._smoothPeak = Math.max(this._smoothPeak * 0.92, this._smoothLevel)

    ctx.clearRect(0, 0, w, h)

    const bars = this._barCount
    const gap = 2
    const barW = (w - gap * (bars - 1)) / bars
    const active = this._vadState === 'speaking'

    for (let i = 0; i < bars; i++) {
      const t = i / bars
      const val = Math.max(0.02, this._smoothLevel * (1 - t * 0.7))
      const barH = val * (h - 4)

      let color
      if (active) {
        const hue = 140 - t * 140
        color = `hsla(${hue}, 75%, ${50 + t * 20}%, ${0.5 + val * 0.5})`
      } else {
        color = `hsla(200, 60%, ${30 + t * 30}%, ${0.3 + val * 0.4})`
      }

      const x = i * (barW + gap)
      const y = h - 2 - barH
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(x, y, barW, barH, Math.min(1.5, barW / 2))
      ctx.fill()
    }

    // Peak indicator dot
    if (this._smoothPeak > 0.05) {
      const px = (this._smoothPeak * 0.8) * (w - 10)
      ctx.fillStyle = active ? 'rgba(129,199,132,0.6)' : 'rgba(79,195,247,0.4)'
      ctx.beginPath()
      ctx.arc(Math.min(w - 4, 4 + px), 4, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // VAD label
    if (this.elements.vadLabel) {
      const labels = { idle: 'INACTIVO', listening: 'ESCUCHANDO', speaking: 'HABLANDO', processing: 'PROCESANDO' }
      const cls = this._vadState || 'idle'
      this.elements.vadLabel.textContent = labels[cls] || 'INACTIVO'
      this.elements.vadLabel.className = `vad-label ${cls}`
    }
  }

  setListening() {
    this._setStatus('ESCUCHANDO', 'listening')
    if (this.elements.btn) this.elements.btn.classList.add('recording')
    if (this.elements.levelMeter) this.elements.levelMeter.classList.add('visible')
    if (this.elements.window) this.elements.window.classList.add('active')
  }

  setProcessing() {
    this._setStatus('PROCESANDO', 'processing')
    if (this.elements.levelMeter) this.elements.levelMeter.classList.remove('visible')
    if (this.elements.window) {
      this.elements.window.classList.add('active')
      this.elements.window.classList.remove('thinking')
    }
    this._vadState = 'processing'
  }

  setThinking() {
    this._setStatus('PENSANDO', 'thinking')
    if (this.elements.window) this.elements.window.classList.add('thinking')
  }

  setIdle() {
    this._setStatus('SISTEMAS LISTOS', 'idle')
    this.clearModelInfo()
    if (this.elements.btn) this.elements.btn.classList.remove('recording')
    if (this.elements.btnStop) this.elements.btnStop.classList.remove('visible')
    if (this.elements.levelMeter) this.elements.levelMeter.classList.remove('visible')
    if (this.elements.window) {
      this.elements.window.classList.remove('active')
      this.elements.window.classList.remove('thinking')
    }
    this._level = 0
    this._smoothLevel = 0
    this._smoothPeak = 0
    this._vadState = 'idle'
    if (this.elements.vadLabel) {
      this.elements.vadLabel.textContent = 'INACTIVO'
      this.elements.vadLabel.className = 'vad-label idle'
    }
  }

  setSpeaking() {
    this._setStatus('HABLANDO', 'speaking')
    if (this.elements.btnStop) this.elements.btnStop.classList.add('visible')
  }

  setError(msg) {
    this._setStatus(msg || 'ERROR', 'error')
    if (this.elements.levelMeter) this.elements.levelMeter.classList.remove('visible')
    if (this.elements.btnStop) this.elements.btnStop.classList.remove('visible')
    if (this.elements.window) {
      this.elements.window.classList.remove('active')
      this.elements.window.classList.remove('thinking')
    }
  }


  pushHistory(transcript, response) {
    if (!this.elements.history) return
    const e = document.createElement('div')
    e.className = 'hist-entry'
    const q = document.createElement('span'); q.className = 'h-q'; q.textContent = transcript
    const a = document.createElement('span'); a.className = 'h-a'; a.textContent = response
    e.appendChild(q); e.appendChild(a)
    if (transcript && !String(transcript).startsWith('[')) {
      const fb = document.createElement('span'); fb.className = 'h-fb'
      const up = document.createElement('button'); up.className = 'h-fb-btn'; up.textContent = '👍'; up.title = 'Bien así'
      const down = document.createElement('button'); down.className = 'h-fb-btn'; down.textContent = '👎'; down.title = 'Mal, no lo repitas'
      const done = (btn) => { up.disabled = true; down.disabled = true; btn.classList.add('picked') }
      up.addEventListener('click', () => { if (this.onFeedback) this.onFeedback(transcript, true); done(up) })
      down.addEventListener('click', () => { if (this.onFeedback) this.onFeedback(transcript, false); done(down) })
      fb.appendChild(up); fb.appendChild(down)
      e.appendChild(fb)
    }
    this.elements.history.appendChild(e)
    const MAX = 10
    while (this.elements.history.children.length > MAX) this.elements.history.removeChild(this.elements.history.firstChild)
  }

  showTranscript(text) {
    if (this.elements.transcript) {
      this.elements.transcript.textContent = `"${text}"`
    }
  }

  setModelInfo(info) {
    if (this.elements.modelInfo) {
      this.elements.modelInfo.textContent = `→ ${info}`
      this.elements.modelInfo.classList.add('active')
    }
  }

  clearModelInfo() {
    if (this.elements.modelInfo) {
      this.elements.modelInfo.textContent = ''
      this.elements.modelInfo.classList.remove('active')
    }
  }

  setWake(on) {
    if (this.elements.wakeIndicator) {
      this.elements.wakeIndicator.classList.toggle('active', on)
    }
  }

  showResponse(text) {
    if (this.elements.response) {
      this.elements.response.textContent = text
    }
  }

  _setStatus(text, className) {
    if (this.elements.status) {
      this.elements.status.textContent = text
      this.elements.status.className = `status ${className || ''}`
    }
  }

  setRecording(on) {
    if (this.elements.recBadge) {
      this.elements.recBadge.classList.toggle('visible', on)
    }
  }

  setTtsAvailable(ok) {
    this.setTtsEngine(ok ? 'sapi' : 'none', !!ok)
  }

  setTtsEngine(engine, ok) {
    if (!this.elements.ttsOff) return
    const labels = { piper: 'VOZ: NEURONAL', sapi: 'VOZ: SISTEMA', none: 'SIN VOZ' }
    this.elements.ttsOff.textContent = ok ? (labels[engine] || 'VOZ') : 'SIN VOZ'
    this.elements.ttsOff.classList.add('visible')
  }

  onToggle = null
}
