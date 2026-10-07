// Fase 9: harness del renderer sin dependencias (stubs de DOM/canvas).
// Pilla ReferenceErrors y cableado roto sin abrir la app.
const assert = require('assert')
const fs = require('fs')
const path = require('path')

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

function ctxProxy() {
  const anyFn = () => proxy
  const proxy = new Proxy({}, { get: (t, p) => (p === 'canvas' ? {} : anyFn), set: () => true })
  return proxy
}

function fakeEl(id) {
  return {
    id, textContent: '', innerHTML: '', value: '',
    style: {}, children: [], listeners: {},
    width: 300, height: 150, options: [],
    classList: fakeClassList(),
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn) },
    appendChild(c) { this.children.push(c); return c },
    removeChild(c) { this.children = this.children.filter(x => x !== c) },
    getBoundingClientRect: () => ({ width: 300, height: 40 }),
    getContext: () => ctxProxy(),
    querySelectorAll: () => [],
  }
}

function fakeDocument() {
  const reg = {}
  return {
    _reg: reg,
    hidden: false,
    getElementById: (id) => reg[id] || (reg[id] = fakeEl(id)),
    createElement: (tag) => fakeEl(tag),
  }
}

function apiStub(over = {}) {
  return {
    executeCommand: async () => ({ success: true, message: 'ok' }),
    recognizeSpeech: async () => ({ viaWake: true }),
    cancelSpeech: async () => true,
    speak: async () => {},
    stopSpeaking: async () => {},
    toggleWake: async () => {},
    getConfig: async () => ({}),
    saveConfig: async () => true,
    askLlm: async () => '',
    listModels: async () => [],
    clearLlmHistory: async () => {},
    getHelp: async () => ({ commands: ['abre', 'di'], groups: [{ group: 'G', items: ['x'] }] }),
    minimizeWindow: async () => {},
    closeWindow: async () => {},
    onStatusUpdate: () => {}, onWakeDetected: () => {}, onWakeResult: () => {},
    onWakeToggle: () => {}, onModelInfo: () => {}, onAudioLevel: () => {},
    checkTts: async () => true,
    getPreference: async () => null,
    setPreference: async () => {},
    listMicDevices: async () => [],
    ...over,
  }
}

function loadClass(file, name, extra = {}) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const names = ['window', 'document', 'navigator', 'requestAnimationFrame', ...Object.keys(extra)]
  const fn = new Function(...names, src + `\nreturn ${name};`)
  const base = { window: {}, document: fakeDocument(), navigator: {}, requestAnimationFrame: () => 0 }
  return fn(...names.map(n => (n in extra ? extra[n] : base[n] ?? {})))
}

function loadMascot(doc) {
  return loadClass('src/renderer/mascot.js', 'Mascot', { document: doc, requestAnimationFrame: () => 0 })
}

console.log('\nrenderer (Fase 9)')

test('Mascot: 5 estados dibujan sin romper + click', () => {
  const doc = fakeDocument()
  const Mascot = loadMascot(doc)
  let tapped = 0
  const mc = doc.getElementById('mascot-canvas')
  const m = new Mascot(mc, () => tapped++)
  for (const s of ['idle', 'listening', 'thinking', 'speaking', 'error']) {
    m.setState(s)
    m.setLevel(0.7)
    m._loop(1000 + ['idle', 'listening', 'thinking', 'speaking', 'error'].indexOf(s) * 500)
  }
  assert.equal(m.state, 'error')
  mc.listeners.click[0]()
  assert.equal(tapped, 1)
})

test('Mascot: setLevel recorta a 0..1', () => {
  const doc = fakeDocument()
  const Mascot = loadMascot(doc)
  const m = new Mascot(doc.getElementById('mascot-canvas'))
  m.setLevel(5); assert.equal(m.level, 1)
  m.setLevel(-2); assert.equal(m.level, 0)
})

test('UIManager: init + todos los estados + forward a mascota', () => {
  const doc = fakeDocument()
  const Mascot = loadMascot(doc)
  const UIManager = loadClass('src/renderer/ui.js', 'UIManager', { document: doc, requestAnimationFrame: () => 0, Mascot })
  const ui = new UIManager()
  ui.init()
  assert.ok(ui.mascot, 'mascota creada')
  ui.setListening(); assert.equal(ui.mascot.state, 'listening')
  ui.setProcessing(); assert.equal(ui.mascot.state, 'thinking')
  ui.setThinking(); assert.equal(ui.mascot.state, 'thinking')
  ui.setSpeaking(); assert.equal(ui.mascot.state, 'speaking')
  ui.setError('x'); assert.equal(ui.mascot.state, 'error')
  ui.setIdle(); assert.equal(ui.mascot.state, 'idle')
  ui.setAudioLevel(0.5, true, 'speaking')
  ui._drawLevels()
  ui.showTranscript('hola'); ui.showResponse('ok')
  assert.equal(doc.getElementById('transcript').textContent, '"hola"')
})

test('UIManager: boton grabar llama onToggle', () => {
  const doc = fakeDocument()
  const Mascot = loadMascot(doc)
  const UIManager = loadClass('src/renderer/ui.js', 'UIManager', { document: doc, requestAnimationFrame: () => 0, Mascot })
  const ui = new UIManager()
  ui.init()
  let n = 0
  ui.onToggle = () => n++
  doc.getElementById('btn-record').listeners.click[0]()
  assert.equal(n, 1)
})

test('GuideManager: ejemplos tocables ejecutan y cierran', async () => {
  const doc = fakeDocument()
  const GuideManager = loadClass('src/renderer/guide.js', 'GuideManager', {
    document: doc, window: { api: apiStub() },
  })
  const g = new GuideManager()
  let selected = null
  g.onSelect = (t) => { selected = t }
  await g.init()
  const tries = doc.getElementById('guide-list').children.filter(c => c.className === 'guide-item try')
  assert.ok(tries.length >= 4, 'hay ejemplos tocables')
  tries[0].listeners.click[0]()
  assert.equal(selected, 'di hola vox')
  assert.equal(g.open, false)
})

test('SettingsManager: init carga mics + save guarda mic/endpause', async () => {
  const doc = fakeDocument()
  const win = {
    api: apiStub({
      listMicDevices: async () => [{ index: 1, name: 'Micro A' }],
      getConfig: async () => ({ wakeWord: 'vox', micDevice: 'Micro A', endPause: 2 }),
    }),
  }
  const SettingsManager = loadClass('src/renderer/settings.js', 'SettingsManager', { document: doc, window: win })
  const s = new SettingsManager()
  await s.init()
  assert.equal(doc.getElementById('settings-mic').children.length, 2)
  let saved = null
  win.api.saveConfig = async (d) => { saved = d; return true }
  doc.getElementById('settings-provider').value = 'gemini'
  doc.getElementById('settings-model').value = 'x'
  s.save()
  await new Promise(r => setTimeout(r, 50))
  assert.equal(saved.micDevice, 'Micro A')
  assert.equal(saved.endPause, 2)
})

test('OnboardingManager: flujo 3 pasos con prueba', async () => {
  const doc = fakeDocument()
  const steps = [fakeEl('s1'), fakeEl('s2'), fakeEl('s3')]
  steps.forEach((s, i) => { s.dataset = { step: String(i + 1) } })
  const ob = doc.getElementById('onboarding')
  ob.querySelectorAll = (sel) => (sel === '.ob-step' ? steps : [])
  const win = { api: apiStub({ getConfig: async () => ({ wakeWord: 'vox' }) }) }
  const OnboardingManager = loadClass('src/renderer/onboarding.js', 'OnboardingManager', { document: doc, window: win })
  const o = new OnboardingManager()
  let tried = null
  o.onTry = async (t) => { tried = t }
  let done = false
  o.start(() => { done = true })
  assert.ok(ob.classList.contains('open'))
  await new Promise(r => setTimeout(r, 20))
  assert.equal(doc.getElementById('ob-wakeword').value, 'vox')
  doc.getElementById('ob-wakeword').value = 'vox!'
  await o._saveWakeWord()
  assert.ok(doc.getElementById('ob-ww-status').textContent.length > 0)
  doc.getElementById('ob-wakeword').value = 'vox'
  await o._saveWakeWord()
  await o._tryCommand()
  assert.equal(tried, 'qué hora es')
  o._finish()
  assert.ok(done && !ob.classList.contains('open'))
})

test('OnboardingManager: sin micro muestra mensaje, no rompe', async () => {
  const doc = fakeDocument()
  const win = { api: apiStub() }
  const OnboardingManager = loadClass('src/renderer/onboarding.js', 'OnboardingManager', { document: doc, window: win, navigator: {} })
  const o = new OnboardingManager()
  o.start(() => {})
  await o._testMic()
  assert.ok(doc.getElementById('ob-mic-status').textContent.length > 0)
})

test('VoiceModule: start/stop cambian estado', async () => {
  const VoiceModule = loadClass('src/renderer/voice.js', 'VoiceModule', { window: { api: apiStub() } })
  const v = new VoiceModule()
  const states = []
  v.onStateChange = (l) => states.push(l)
  await v.start() // viaWake: el flujo sigue en wake.exe, no emite false
  assert.equal(v.isListening, false)
  assert.deepEqual(states, [true])
  v.stop()
  assert.equal(v.isListening, false)

  const win2 = { api: apiStub({ recognizeSpeech: async () => 'qué hora es' }) }
  const VoiceModule2 = loadClass('src/renderer/voice.js', 'VoiceModule', { window: win2 })
  const v2 = new VoiceModule2()
  const states2 = []
  let heard = null
  v2.onStateChange = (l) => states2.push(l)
  v2.onResult = (t) => { heard = t }
  await v2.start()
  assert.equal(heard, 'qué hora es')
  assert.deepEqual(states2, [true, false])
})

test('sprites Vox existen y son PNG válidos', () => {
  for (const n of ['idle', 'blink', 'listening', 'thinking', 'speaking-open', 'speaking-closed', 'error', 'sleep', 'happy', 'worried']) {
    const b = fs.readFileSync(path.join(__dirname, '..', 'assets/vox', `vox-${n}.png`))
    assert.ok(b.length > 2000, n)
    assert.deepEqual([...b.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  }
})

test('UIManager: burbuja y moods', () => {
  const doc = fakeDocument()
  const Mascot = loadMascot(doc)
  const UIManager = loadClass('src/renderer/ui.js', 'UIManager', { document: doc, requestAnimationFrame: () => 0, Mascot })
  const ui = new UIManager()
  ui.init()
  ui.showBubble('hola')
  assert.ok(doc.getElementById('vox-bubble').classList.contains('visible'))
  ui.hideBubble()
  assert.ok(!doc.getElementById('vox-bubble').classList.contains('visible'))
  ui.setMood('happy')
  assert.equal(ui.mascot.state, 'happy')
  ui.setMood('bailar')
  assert.equal(ui.mascot.state, 'happy')
})

async function run() {
  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`) }
    catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`) }
  }
  console.log(`\n${passed + failed} renderer tests, ${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}
run()
