/*exported VoiceModule*/
class VoiceModule {
  constructor() {
    this.isListening = false
    this._stopped = false
    this._ptt = false
    this.onResult = null
    this.onError = null
    this.onStateChange = null
  }

  async start(ptt) {
    if (this.isListening) return
    this._stopped = false
    this._ptt = !!ptt
    this.isListening = true
    if (this.onStateChange) this.onStateChange(true)

    let result = null
    try {
      result = await window.api.recognizeSpeech(this._ptt ? { ptt: true } : {})

      if (this._stopped) return
      if (result && result.viaWake) return
      if (result === null) {
        if (this.onError) this.onError('Tiempo de espera agotado')
      } else if (result.error) {
        if (this.onError) this.onError(result.error)
      } else if (this.onResult) {
        this.onResult(result)
      }
    } catch (err) {
      if (!this._stopped && this.onError) this.onError(err.message || 'Error desconocido')
    } finally {
      this.isListening = false
      if (!this._stopped && !(result && result.viaWake) && this.onStateChange) this.onStateChange(false)
      this._stopped = false
    }
  }

  stop() {
    this._stopped = true
    this._ptt = false
    this.isListening = false
    if (this.onStateChange) this.onStateChange(false)
  }

  // PTT: devuelve true si consumió el evento (modo push-to-talk activo).
  pttDown() {
    if (!this._pttMode) return false
    if (!this.isListening) this.start(true)
    return true
  }

  pttUp() {
    if (!this._pttMode || !this.isListening) return false
    // Soltar = terminar y razonar (antes descartaba lo hablado).
    this.stop()
    try { window.api.finishCapture() } catch {}
    return true
  }
}
