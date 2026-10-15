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
      // Vía wake: la captura sigue en el motor; isListening queda hasta que
      // llegue el resultado (heard), haya error o stop() explícito. Antes se
      // apagaba en ms y el segundo toque reiniciaba en vez de terminar.
      if (result && result.viaWake) return
      if (result === null) {
        this.isListening = false
        if (this.onError) this.onError('Tiempo de espera agotado')
      } else if (result.error) {
        this.isListening = false
        if (this.onError) this.onError(result.error)
      } else if (this.onResult) {
        this.isListening = false
        this.onResult(result)
      }
    } catch (err) {
      this.isListening = false
      if (!this._stopped && this.onError) this.onError(err.message || 'Error desconocido')
    } finally {
      if (!this.isListening && !this._stopped && !(result && result.viaWake) && this.onStateChange) this.onStateChange(false)
      this._stopped = false
    }
  }

  // Llegó el resultado de una captura (vía evento wake:result): cerrar estado.
  heard() {
    if (!this.isListening) return
    this.isListening = false
    if (this.onStateChange) this.onStateChange(false)
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
