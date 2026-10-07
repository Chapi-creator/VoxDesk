/*exported VoiceModule*/
class VoiceModule {
  constructor() {
    this.isListening = false
    this._stopped = false
    this.onResult = null
    this.onError = null
    this.onStateChange = null
  }

  async start() {
    if (this.isListening) return
    this._stopped = false
    this.isListening = true
    if (this.onStateChange) this.onStateChange(true)

    let result = null
    try {
      result = await window.api.recognizeSpeech()

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
    this.isListening = false
    if (this.onStateChange) this.onStateChange(false)
  }
}
