// Vox robot chibi por sprites (assets/vox/vox-<estado>.png, hechos con Pillow).
// Misma API que v1: setState idle|listening|thinking|speaking|error, setLevel 0..1.
// Sin sprites (o sin Image, como en tests) usa cara procedural mínima. Nunca queda en blanco.
// ponytail: un solo RAF; se pausa con la ventana oculta.
const VOX_FRAMES = ['idle', 'blink', 'listening', 'thinking', 'speaking-open', 'speaking-closed', 'error', 'sleep', 'happy', 'worried']

/*exported Mascot*/
class Mascot {
  constructor(canvas, onTap) {
    this.c = canvas
    this.ctx = canvas.getContext('2d')
    this.state = 'idle'
    this.level = 0
    this.t = 0
    this._blinkT = 2000
    this._blink = 0
    this._imgs = {}
    this._failed = typeof Image === 'undefined'
    if (!this._failed) {
      for (const n of VOX_FRAMES) {
        const im = new Image()
        im.onerror = () => { this._failed = true }
        im.src = 'assets/vox/vox-' + n + '.png'
        this._imgs[n] = im
      }
    }
    if (onTap) canvas.addEventListener('click', onTap)
    canvas.style.cursor = 'pointer'
    this._loop = this._loop.bind(this)
    requestAnimationFrame(this._loop)
  }

  setState(s) { this.state = s }
  setLevel(v) { this.level = Math.min(1, Math.max(0, v || 0)) }

  _frameFor() {
    if (this.state === 'listening') return 'listening'
    if (this.state === 'thinking') return 'thinking'
    if (this.state === 'error') return 'error'
    if (this.state === 'sleep') return 'sleep'
    if (this.state === 'happy') return 'happy'
    if (this.state === 'worried') return 'worried'
    if (this.state === 'speaking') return (Math.floor(this.t / 180) % 2) ? 'speaking-open' : 'speaking-closed'
    return this._blink > 0 ? 'blink' : 'idle'
  }

  _loop(ts) {
    requestAnimationFrame(this._loop)
    if (document.hidden || !this.ctx) return
    const dt = Math.min(50, Math.max(0, ts - (this._last || ts)))
    this._last = ts
    this.t += dt
    this._blinkT -= dt
    if (this._blinkT <= 0) { this._blink = 180; this._blinkT = 2400 + Math.random() * 2600 }
    if (this._blink > 0) this._blink -= dt
    this._draw()
  }

  _draw() {
    const { ctx, c } = this
    const w = c.width, h = c.height
    ctx.clearRect(0, 0, w, h)
    const bounce = this.state === 'listening' ? Math.sin(this.t / 180) * (3 + this.level * 8)
      : this.state === 'speaking' ? Math.sin(this.t / 150) * 3
      : Math.sin(this.t / 900) * 2
    const im = this._imgs[this._frameFor()]
    if (!this._failed && im && im.complete && im.naturalWidth) {
      const s = Math.min(w, h) / 200
      const dw = 200 * s, dh = 200 * s
      ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2 + bounce, dw, dh)
      return
    }
    this._failed = true
    this._drawFallback(w, h, bounce)
  }

  _drawFallback(w, h, bounce) {
    // Cara robot mínima si faltan los PNG. Nunca en blanco.
    const ctx = this.ctx
    const cx = w / 2, cy = h / 2 + bounce, R = Math.min(w, h) / 2 - 6
    ctx.fillStyle = '#93a7bd'
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0e1420'
    ctx.fillRect(cx - R * 0.52, cy - R * 0.3, R * 1.04, R * 0.62)
    ctx.fillStyle = this.state === 'error' ? '#ff5252' : '#4fc3f7'
    if (this.state === 'error') {
      ctx.font = `${Math.round(R * 0.4)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('X X', cx, cy + R * 0.2)
    } else {
      const open = this.state === 'speaking' ? (0.4 + 0.6 * Math.abs(Math.sin(this.t / 130))) : 0.1
      ctx.beginPath()
      ctx.arc(cx - R * 0.22, cy - R * 0.05, R * 0.1, 0, Math.PI * 2)
      ctx.arc(cx + R * 0.22, cy - R * 0.05, R * 0.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(cx, cy + R * 0.32, R * 0.12, R * 0.05 + open * R * 0.12, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
