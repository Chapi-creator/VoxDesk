// Onboarding en 3 pasos: micrófono real → palabra clave → prueba en vivo.
// ponytail: getUserMedia del navegador para el medidor (sin backend), el resto reusa APIs existentes.
/*exported OnboardingManager*/
class OnboardingManager {
  constructor() {
    this.onTry = null // (texto) => ejecuta un comando de prueba
    this._step = 1
    this._stream = null
  }

  start(onDone) {
    this._onDone = onDone
    this.el = document.getElementById('onboarding')
    if (!this.el) { onDone && onDone(); return }
    this.el.classList.add('open')
    this._show(1)
    document.getElementById('ob-mic-btn')?.addEventListener('click', () => this._testMic())
    document.getElementById('ob-ww-next')?.addEventListener('click', () => this._saveWakeWord())
    document.getElementById('ob-test-btn')?.addEventListener('click', () => this._tryCommand())
    document.getElementById('btn-start')?.addEventListener('click', () => this._finish())
    window.api.getConfig().then(cfg => {
      const input = document.getElementById('ob-wakeword')
      if (input && cfg.wakeWord) input.value = cfg.wakeWord
    }).catch(() => {})
  }

  _show(n) {
    this._step = n
    this.el.querySelectorAll('.ob-step').forEach(s => s.classList.toggle('active', s.dataset.step == n))
    this.el.querySelectorAll('.ob-dot').forEach((d, i) => d.classList.toggle('active', i + 1 === n))
  }

  async _testMic() {
    const status = document.getElementById('ob-mic-status')
    const fill = document.getElementById('ob-meter-fill')
    const btn = document.getElementById('ob-mic-btn')
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const actx = new (window.AudioContext || window.webkitAudioContext)()
      const src = actx.createMediaStreamSource(this._stream)
      const an = actx.createAnalyser()
      an.fftSize = 256
      src.connect(an)
      const data = new Uint8Array(an.frequencyBinCount)
      status.textContent = '¡Te escucho! Habla para ver la barra…'
      btn.textContent = 'Siguiente →'
      btn.onclick = () => { this._stopMic(); actx.close().catch(() => {}); this._show(2) }
      const tick = () => {
        if (!this._stream) return
        an.getByteFrequencyData(data)
        const v = data.reduce((a, b) => a + b, 0) / data.length / 255
        fill.style.width = Math.min(100, v * 220) + '%'
        requestAnimationFrame(tick)
      }
      tick()
    } catch {
      status.textContent = 'No pude acceder al micrófono. Revisa el permiso del navegador y reintenta.'
    }
  }

  _stopMic() {
    this._stream?.getTracks().forEach(t => t.stop())
    this._stream = null
  }

  async _saveWakeWord() {
    const input = document.getElementById('ob-wakeword')
    const status = document.getElementById('ob-ww-status')
    const ww = (input?.value || '').toLowerCase().trim() || 'asistente'
    if (!/^[a-záéíóúñ]+$/i.test(ww)) { status.textContent = 'Solo una palabra, sin espacios.'; return }
    try {
      const cfg = await window.api.getConfig()
      const ok = await window.api.saveConfig({ ...cfg, wakeWord: ww })
      status.textContent = ok ? `Listo: di «${ww}» y Vox despierta.` : 'No se pudo guardar.'
      if (ok) setTimeout(() => this._show(3), 700)
    } catch { status.textContent = 'No se pudo guardar.' }
  }

  async _tryCommand() {
    const box = document.getElementById('ob-test-result')
    box.textContent = 'Preguntando…'
    try {
      await (this.onTry ? this.onTry('qué hora es') : window.api.executeCommand('qué hora es'))
      box.textContent = '¡Funciona! Ya puedes comenzar.'
      const start = document.getElementById('btn-start')
      if (start) start.style.display = ''
    } catch { box.textContent = 'Algo falló, pero puedes comenzar igual.' }
  }

  _finish() {
    this._stopMic()
    this.el.classList.remove('open')
    if (this._onDone) this._onDone()
  }
}
