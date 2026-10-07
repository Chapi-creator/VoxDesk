/*exported GuideManager*/
class GuideManager {
  constructor() {
    this.open = false
    this.elements = {}
    this.onSelect = null // (texto) => ejecuta un comando de ejemplo
    // ponytail: tocar = intención explícita; lo delicado igual pide confirmación (Fase 3)
    this.tryItems = ['di hola vox', 'qué hora es', 'qué fecha es', 'ayuda', 'clima en Madrid', 'traduce hola al inglés', 'temporizador de 10 segundos', 'cuéntame un chiste']
  }

  async init() {
    this.elements.panel = document.getElementById('guide-panel')
    this.elements.list = document.getElementById('guide-list')
    this.elements.btn = document.getElementById('btn-guide')
    this.elements.backBtn = document.getElementById('btn-guide-back')

    this.elements.list.innerHTML = '<div class="guide-item"><span class="desc">Cargando...</span></div>'

    let help
    try { help = await window.api.getHelp() } catch { help = null }
    if (!help || !help.commands) {
      this.elements.list.innerHTML = '<div class="guide-item"><span class="desc" style="color:rgba(255,255,255,0.2)">Error al cargar la guía</span></div>'
      return
    }

    this.elements.list.innerHTML = ''
    const tryHeader = document.createElement('div')
    tryHeader.className = 'guide-group'
    tryHeader.innerHTML = '<strong>Toca para probar</strong>'
    this.elements.list.appendChild(tryHeader)
    for (const t of this.tryItems) {
      const div = document.createElement('div')
      div.className = 'guide-item try'
      div.innerHTML = `<span class="cmd">${t}</span><span class="desc"></span>`
      div.addEventListener('click', () => {
        this.close()
        if (this.onSelect) this.onSelect(t)
      })
      this.elements.list.appendChild(div)
    }
    const header = document.createElement('div')
    header.className = 'guide-group'
    header.innerHTML = '<strong>Comandos básicos</strong>'
    this.elements.list.appendChild(header)
    for (const cmd of help.commands) {
      const div = document.createElement('div')
      div.className = 'guide-item'
      div.innerHTML = `<span class="cmd">${cmd} [...]</span><span class="desc"> </span>`
      this.elements.list.appendChild(div)
    }

    for (const g of help.groups) {
      const header = document.createElement('div')
      header.className = 'guide-group'
      header.innerHTML = `<strong>${g.group}</strong>`
      this.elements.list.appendChild(header)
      for (const item of g.items) {
        const div = document.createElement('div')
        div.className = 'guide-item extra'
        div.innerHTML = `<span class="cmd">${item}</span><span class="desc"></span>`
        this.elements.list.appendChild(div)
      }
    }

    this.elements.btn.addEventListener('click', () => this.toggle())
    this.elements.backBtn.addEventListener('click', () => this.close())
  }

  toggle() {
    if (this.open) this.close()
    else this.open_()
  }

  open_() {
    this.open = true
    this.elements.panel.classList.add('open')
  }

  close() {
    this.open = false
    this.elements.panel.classList.remove('open')
  }
}