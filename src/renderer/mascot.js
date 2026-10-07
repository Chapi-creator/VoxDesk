// Vox: mascota 2D dibujada en canvas. Sin assets, sin dependencias.
// Estados: idle | listening | thinking | speaking | error. Click = hablar.
// ponytail: formas baratas + un solo RAF; se pausa con la ventana oculta.
/*exported Mascot*/
class Mascot {
  constructor(canvas, onTap) {
    this.c = canvas
    this.ctx = canvas.getContext('2d')
    this.state = 'idle'
    this.level = 0
    this.t = 0
    this.blink = 0
    this.nextBlink = 2000
    this.mouthOpen = 0
    if (onTap) canvas.addEventListener('click', onTap)
    canvas.style.cursor = 'pointer'
    this._loop = this._loop.bind(this)
    requestAnimationFrame(this._loop)
  }

  setState(s) { this.state = s }
  setLevel(v) { this.level = Math.min(1, Math.max(0, v || 0)) }

  _loop(ts) {
    requestAnimationFrame(this._loop)
    if (document.hidden || !this.ctx) return
    const dt = Math.min(50, Math.max(0, ts - (this._last || ts)))
    this._last = ts
    this.t += dt
    this.nextBlink -= dt
    if (this.nextBlink <= 0) { this.blink = 180; this.nextBlink = 2400 + Math.random() * 2600 }
    if (this.blink > 0) this.blink -= dt
    // la boca se abre/cierra al hablar, reacciona al micro al escuchar
    const target = this.state === 'speaking' ? (0.4 + 0.6 * Math.abs(Math.sin(this.t / 130)))
      : this.state === 'listening' ? this.level
      : this.state === 'thinking' ? 0.15 : 0.08
    this.mouthOpen += (target - this.mouthOpen) * 0.35
    this._draw()
  }

  _draw() {
    const { ctx, c } = this
    const w = c.width, h = c.height
    ctx.clearRect(0, 0, w, h)
    const cx = w / 2
    const bounce = this.state === 'listening' ? Math.sin(this.t / 180) * (3 + this.level * 8)
      : this.state === 'speaking' ? Math.sin(this.t / 150) * 3
      : Math.sin(this.t / 900) * 2
    const cy = h / 2 + 6 + bounce
    const R = Math.min(w, h) / 2 - 10

    // aura según estado
    const aura = { idle: 'rgba(79,195,247,0.10)', listening: 'rgba(79,195,247,0.22)', thinking: 'rgba(179,136,255,0.22)', speaking: 'rgba(129,199,132,0.20)', error: 'rgba(239,83,80,0.18)' }[this.state]
    const g0 = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 1.7)
    g0.addColorStop(0, aura); g0.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g0
    ctx.fillRect(0, 0, w, h)

    // cuerpo
    const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
    g.addColorStop(0, '#4fc3f7'); g.addColorStop(1, '#7e57c2')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fill()
    // brillo
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.ellipse(cx - R * 0.35, cy - R * 0.4, R * 0.28, R * 0.16, -0.5, 0, Math.PI * 2)
    ctx.fill()

    // ojos
    const eyeY = cy - R * 0.12
    const lookUp = this.state === 'thinking' ? -4 : 0
    const eyeDX = R * 0.32
    if (this.state === 'error') {
      ctx.strokeStyle = '#0e0e18'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      for (const s of [-1, 1]) {
        const ex = cx + s * eyeDX
        ctx.beginPath()
        ctx.moveTo(ex - 5, eyeY - 5); ctx.lineTo(ex + 5, eyeY + 5)
        ctx.moveTo(ex + 5, eyeY - 5); ctx.lineTo(ex - 5, eyeY + 5)
        ctx.stroke()
      }
    } else if (this.blink > 0) {
      ctx.strokeStyle = '#0e0e18'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      for (const s of [-1, 1]) {
        const ex = cx + s * eyeDX
        ctx.beginPath(); ctx.moveTo(ex - 6, eyeY); ctx.lineTo(ex + 6, eyeY); ctx.stroke()
      }
    } else {
      ctx.fillStyle = '#0e0e18'
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(cx + s * eyeDX, eyeY + lookUp, 7, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.beginPath()
        ctx.arc(cx + s * eyeDX + 2.5, eyeY + lookUp - 2.5, 2.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#0e0e18'
      }
    }

    // boca
    const mouthY = cy + R * 0.38
    ctx.fillStyle = '#0e0e18'
    if (this.state === 'thinking') {
      ctx.font = `${Math.round(R * 0.35)}px sans-serif`
      ctx.textAlign = 'center'
      const dots = '.'.repeat(1 + Math.floor(this.t / 400) % 3)
      ctx.fillText(dots, cx + R * 0.5, cy - R * 0.55)
      ctx.beginPath(); ctx.arc(cx, mouthY, 3, 0, Math.PI * 2); ctx.fill()
    } else {
      const open = this.mouthOpen * R * 0.28
      ctx.beginPath()
      ctx.ellipse(cx, mouthY, 8 + open * 0.4, 3 + open, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // rubor al hablar
    if (this.state === 'speaking' || this.state === 'listening') {
      ctx.fillStyle = 'rgba(255,138,128,0.45)'
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.ellipse(cx + s * R * 0.62, mouthY - 6, 7, 4.5, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}
