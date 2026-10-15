// Simulación de flujos del botón stop de punta a punta: app.js + ui.js +
// voice.js REALES, DOM falso, timers manuales, IPC con promesas diferidas.
// Caza carreras que los tests por clases no ven.
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const RB = path.join(__dirname, '..')

let passed = 0, failed = 0
const queue = []
function test(name, fn) { queue.push([name, fn]) }

function fakeClassList() {
  const s = new Set()
  return {
    add: (...c) => c.forEach(x => s.add(x)),
    remove: (...c) => c.forEach(x => s.delete(x)),
    toggle: (c, force) => {
      const on = force === undefined ? !s.has(c) : !!force
      if (on) s.add(c); else s.delete(c)
      return on
    },
    contains: (c) => s.has(c),
  }
}

function fakeEl(id) {
  const el = {
    id, innerHTML: '', value: '', checked: false,
    style: {}, children: [], listeners: {},
    width: 300, height: 150, options: [],
    classList: fakeClassList(),
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn) },
    appendChild(c) { this.children.push(c); return c },
    removeChild(c) { this.children = this.children.filter(x => x !== c) },
    getBoundingClientRect: () => ({ width: 300, height: 40 }),
    getContext: () => new Proxy({}, { get: () => () => ({}) }),
    querySelectorAll: () => [],
    _text: '',
  }
  Object.defineProperty(el, 'textContent', {
    get() { return el._text + el.children.map(c => (c && c.textContent) || '').join('') },
    set(v) { el._text = String(v ?? '') },
  })
  return el
}

function fakeTimers() {
  let now = 0, seq = 1
  const timers = new Map()
  return {
    setTimeout: (fn, ms) => { const id = seq++; timers.set(id, { fn, at: now + (ms || 0) }); return id },
    clearTimeout: (id) => { timers.delete(id) },
    setInterval: (fn, ms) => { const id = seq++; timers.set(id, { fn, at: now + (ms || 0), every: ms }); return id },
    advance: (ms) => {
      now += ms
      for (let round = 0; round < 50; round++) {
        let ran = false
        for (const [id, t] of [...timers]) {
          if (t.at <= now) {
            timers.delete(id)
            t.fn()
            if (t.every) timers.set(id, { fn: t.fn, at: now + t.every, every: t.every })
            ran = true
          }
        }
        if (!ran) break
      }
    },
  }
}

function deferred() {
  let resolve, reject
  const p = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise: p, resolve, reject }
}

function loadApp() {
  const reg = {}
  const doc = {
    _reg: reg,
    hidden: false,
    listeners: {},
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn) },
    getElementById: (id) => reg[id] || (reg[id] = fakeEl(id)),
    createElement: (tag) => fakeEl(tag),
  }
  const timers = fakeTimers()
  const calls = { stopSpeaking: 0, cancelSpeech: 0, finishCapture: 0, speak: 0, exec: [] }
  const handlers = {}
  const execDeferreds = []
  const speakDeferreds = []
  const recogDeferreds = []
  const base = {
    executeCommand: () => { const d = deferred(); execDeferreds.push(d); calls.exec.push(1); return d.promise },
    recognizeSpeech: () => { const d = deferred(); recogDeferreds.push(d); return d.promise },
    cancelSpeech: async () => { calls.cancelSpeech++; return true },
    speak: async (t) => { calls.speak++; const d = deferred(); speakDeferreds.push(d); return d.promise },
    stopSpeaking: async () => { calls.stopSpeaking++; return {} },
    toggleWake: async () => {},
    finishCapture: async () => { calls.finishCapture++; return true },
    getConfig: async () => ({}),
    saveConfig: async () => true,
    followupArm: async () => true,
    getPreference: async () => null,
    setPreference: async () => {},
    getTtsEngine: async () => ({ engine: 'piper', ok: true }),
    appHealth: async () => [],
    timersList: async () => [],
    listMicDevices: async () => [],
    voicesList: async () => [],
    getHelp: async () => ({ commands: [], groups: [] }),
    cacheFeedback: async () => {},
    onStatusUpdate: (cb) => { handlers.status = cb },
    onWakeDetected: (cb) => { handlers.wakeDetected = cb },
    onWakeResult: (cb) => { handlers.wakeResult = cb },
    onWakeToggle: () => {},
    onModelInfo: () => {},
    onAudioLevel: () => {},
    onLifeEvent: (cb) => { handlers.life = cb },
    onTtsState: (cb) => { handlers.tts = cb },
  }
  const api = new Proxy(base, { get: (t, p) => (p in t ? t[p] : (...a) => Promise.resolve()) })
  const win = { api }
  const nav = {}
  const raf = () => 0
  const scope = { window: win, document: doc, navigator: nav, requestAnimationFrame: raf,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval };
  const cls = {}
  for (const [file, name] of [['src/renderer/ui.js', 'UIManager'], ['src/renderer/voice.js', 'VoiceModule'],
      ['src/renderer/settings.js', 'SettingsManager'], ['src/renderer/guide.js', 'GuideManager'],
      ['src/renderer/onboarding.js', 'OnboardingManager']]) {
    const src = fs.readFileSync(path.join(RB, file), 'utf8')
    const names = ['window', 'document', 'navigator', 'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval']
    const fn = new Function(...names, src + `\nreturn ${name};`)
    cls[name] = fn(win, doc, nav, raf, timers.setTimeout, timers.clearTimeout, timers.setInterval)
  }
  const appSrc = fs.readFileSync(path.join(RB, 'src/renderer/app.js'), 'utf8')
  const appNames = ['window', 'document', 'navigator', 'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval',
    'VoiceModule', 'UIManager', 'SettingsManager', 'GuideManager', 'OnboardingManager']
  new Function(...appNames, appSrc)(
    win, doc, nav, raf, timers.setTimeout, timers.clearTimeout, timers.setInterval,
    cls.VoiceModule, cls.UIManager, cls.SettingsManager, cls.GuideManager, cls.OnboardingManager)
  return { doc, win, api, timers, calls, handlers, execDeferreds, speakDeferreds, recogDeferreds }
}

const tick = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)) }
const stopVisible = (doc) => doc.getElementById('btn-stop').classList.contains('visible')
function typeCommand(doc, text) {
  const input = doc.getElementById('cmd-input')
  input.value = text
  for (const fn of (input.listeners.keydown || [])) fn({ key: 'Enter' })
}
function clickBtn(doc, id) {
  for (const fn of ((doc.getElementById(id).listeners.click) || [])) fn()
}

async function run() {
  console.log('\nflujos stop (app real headless)')

  await test('stop visible durante habla y se oculta al terminar', async () => {
    const t = loadApp()
    await tick()
    typeCommand(t.doc, 'hola')
    await tick()
    t.execDeferreds[0].resolve({ success: true, message: 'hola mundo', speak: true })
    await tick()
    assert.equal(stopVisible(t.doc), true, 'stop visible hablando')
    assert.ok(/HABLANDO/.test(t.doc.getElementById('status').textContent))
    t.speakDeferreds[0].resolve()
    await tick()
    assert.equal(stopVisible(t.doc), false, 'stop oculto al terminar')
  })

  await test('idle-now y timers rancios no apagan habla en curso', async () => {
    const t = loadApp()
    await tick()
    typeCommand(t.doc, 'uno')
    await tick()
    // flujo viejo que termina callado programa idle a 3s
    t.execDeferreds[0].resolve({ success: true, message: 'ok', speak: false })
    await tick()
    // nuevo flujo que sí habla antes de los 3s
    typeCommand(t.doc, 'dos')
    await tick()
    t.execDeferreds[1].resolve({ success: true, message: 'hablando', speak: true })
    await tick()
    assert.equal(stopVisible(t.doc), true)
    t.handlers.status('idle-now')
    await tick()
    assert.equal(stopVisible(t.doc), true, 'idle-now no apaga')
    t.timers.advance(3000)
    await tick()
    assert.equal(stopVisible(t.doc), true, 'timer rancio no apaga')
    t.speakDeferreds[0].resolve()
    await tick()
    assert.equal(stopVisible(t.doc), false)
  })

  await test('hablar en ocupado detiene (kill-switch visible)', async () => {
    const t = loadApp()
    await tick()
    typeCommand(t.doc, 'hola')
    await tick()
    t.execDeferreds[0].resolve({ success: true, message: 'hablando largo', speak: true })
    await tick()
    assert.equal(stopVisible(t.doc), true)
    clickBtn(t.doc, 'btn-record')
    await tick()
    assert.ok(t.calls.stopSpeaking > 0 && t.calls.cancelSpeech > 0, 'llamó stop')
    assert.ok(/Detenido/.test(t.doc.getElementById('response').textContent))
    assert.equal(stopVisible(t.doc), false)
    t.speakDeferreds[0].resolve() // tardío: no resucita
    await tick()
    assert.equal(stopVisible(t.doc), false)
    assert.ok(/Detenido/.test(t.doc.getElementById('response').textContent))
  })

  await test('btn-stop directo para y oculta', async () => {
    const t = loadApp()
    await tick()
    typeCommand(t.doc, 'hola')
    await tick()
    t.execDeferreds[0].resolve({ success: true, message: 'x', speak: true })
    await tick()
    assert.equal(stopVisible(t.doc), true)
    clickBtn(t.doc, 'btn-stop')
    await tick()
    assert.equal(stopVisible(t.doc), false)
    assert.ok(t.calls.stopSpeaking > 0)
  })

  await test('hablar capturando termina y razona (no abandona)', async () => {
    const t = loadApp()
    await tick()
    clickBtn(t.doc, 'btn-record') // empieza a escuchar (vía botón)
    await tick()
    clickBtn(t.doc, 'btn-record') // segundo toque = terminar
    await tick()
    assert.equal(t.calls.finishCapture, 1, 'pidió finish, no cancel')
    assert.equal(t.calls.cancelSpeech || 0, 0, 'no canceló')
    assert.ok(/PROCESANDO/.test(t.doc.getElementById('status').textContent))
  })

  await test('voz de fondo (timer/remoto) muestra stop y lo oculta al callar', async () => {
    const t = loadApp()
    await tick()
    assert.equal(stopVisible(t.doc), false)
    t.handlers.tts({ speaking: true, id: 7 })
    await tick()
    assert.equal(stopVisible(t.doc), true, 'stop visible en voz de fondo')
    assert.ok(/HABLANDO/.test(t.doc.getElementById('status').textContent))
    t.handlers.tts({ speaking: false, id: 7 })
    await tick()
    assert.equal(stopVisible(t.doc), false)
  })

  await test('fin de voz rancio no oculta habla nueva', async () => {
    const t = loadApp()
    await tick()
    t.handlers.tts({ speaking: true, id: 7 })
    await tick()
    t.handlers.tts({ speaking: true, id: 8 })
    await tick()
    t.handlers.tts({ speaking: false, id: 7 })
    await tick()
    assert.equal(stopVisible(t.doc), true, 'sigue visible (id 8 manda)')
    t.handlers.tts({ speaking: false, id: 8 })
    await tick()
    assert.equal(stopVisible(t.doc), false)
  })

  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log(`  V ${name}`) }
    catch (e) { failed++; console.log(`  ? ${name}: ${(e && e.message || e).toString().slice(0, 200)}`) }
  }
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

run().catch((e) => { console.error(e); process.exit(1) })
