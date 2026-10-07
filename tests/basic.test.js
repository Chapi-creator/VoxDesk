const assert = require('assert')
const path = require('path')

process.chdir(path.join(__dirname, '..'))

let passed = 0, failed = 0

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`) }
}

async function run() {
console.log('\ncommand-parser.js')
const parser = require('../src/main/command-parser')

test('abre chrome', () => {
  const r = parser.parse('abre chrome')
  assert.equal(r.command, 'abre')
  assert.equal(r.args, 'chrome')
})

test('abrir chrome (alias)', () => {
  const r = parser.parse('abrir chrome')
  assert.equal(r.command, 'abre')
})

test('clima en Madrid', () => {
  const r = parser.parse('clima en Madrid')
  assert.equal(r.command, 'clima')
  assert.equal(r.args, 'madrid')
})

test('cómo está el clima', () => {
  const r = parser.parse('cómo está el clima')
  assert.equal(r.command, 'clima')
  assert.equal(r.args, '')
})

test('temperatura en Barcelona', () => {
  const r = parser.parse('temperatura en Barcelona')
  assert.equal(r.command, 'clima')
  assert.equal(r.args, 'barcelona')
})

test('traduce hola al inglés', () => {
  const r = parser.parse('traduce hola al inglés')
  assert.equal(r.command, 'traduce')
  assert.equal(r.args, 'hola al inglés')
})

test('detente', () => {
  const r = parser.parse('detente')
  assert.equal(r.command, 'detente')
})

test('alarma en 5 minutos', () => {
  const r = parser.parse('alarma en 5 minutos')
  assert.equal(r.command, 'alarma')
  assert.equal(r.args, '5 minutos')
})

test('stop word filtering', () => {
  const r = parser.parse('abre el chrome')
  assert.equal(r.args, 'chrome')
})

test('greeting stripping', () => {
  const r = parser.parse('oye abre chrome')
  assert.equal(r.command, 'abre')
})

console.log('\ncommands/timer.js')
const timer = require('../src/main/commands/timer')

test('parseDuration 10 segundos', () => {
  const dur = timer.parseDuration?.('10 segundos')
  assert.ok(dur)
  assert.equal(dur.amount, 10)
  assert.equal(dur.ms, 10000)
})

test('parseDuration 1 hora', () => {
  const dur = timer.parseDuration?.('1 hora')
  assert.ok(dur)
  assert.equal(dur.amount, 1)
  assert.equal(dur.ms, 3600000)
})

console.log('\ncommands/translate.js')
const translate = require('../src/main/commands/translate')

test('parse "hola al inglés"', () => {
  const p = translate.parse?.('hola al inglés')
  assert.ok(p)
  assert.equal(p.text, 'hola')
  assert.equal(p.lang, 'en')
})

test('parse "hello a español"', () => {
  const p = translate.parse?.('hello a español')
  assert.ok(p)
  assert.equal(p.text, 'hello')
  assert.equal(p.lang, 'es')
})

console.log('\ncommands/weather.js')
const weather = require('../src/main/commands/weather')

try {
  const r = await weather.execute('Madrid')
  test('execute("Madrid") returns success', () => {
    assert.equal(r.success, true)
    assert.ok(r.message.includes('°C'))
  })
} catch (e) {
  test('execute("Madrid") should not throw', () => {
    throw new Error(e.message)
  })
}

console.log('\nmain/guard.js')
const guard = require('../src/main/guard')

test('detecta shutdown', () => {
  assert.equal(guard.isDangerous('shutdown /s /t 30'), true)
})

test('detecta Stop-Process -Force', () => {
  assert.equal(guard.isDangerous('Get-Process | Stop-Process -Force'), true)
})

test('detecta IEX + DownloadString', () => {
  assert.equal(guard.isDangerous('IEX (New-Object Net.WebClient).DownloadString("http://x")'), true)
})

test('detecta EncodedCommand', () => {
  assert.equal(guard.isDangerous('powershell -EncodedCommand aGVsbG8='), true)
})

test('detecta Remove-Item -Recurse', () => {
  assert.equal(guard.isDangerous('Remove-Item -Path C:\\x -Recurse -Force'), true)
})

test('permite diagnóstico de solo lectura', () => {
  assert.equal(guard.isDangerous('Get-Process | Select-Object Name, Id'), false)
})

test('permite texto normal', () => {
  assert.equal(guard.isDangerous('qué hora es'), false)
})

console.log('\nsmart-exec route/pickBest (Fase 5, sin ejecutar nada)')
const smart = require('../src/main/smart-exec')

test('route: cancela el apagado gana a apaga', () => {
  const hits = smart.route('cancela el apagado')
  assert.ok(hits.length >= 2, 'debe matchear ambos patrones')
  assert.equal(hits[0].pattern.msg, 'Apagado cancelado')
})

test('route: reinicia el servicio gana a reiniciar equipo', () => {
  const top = smart.route('reinicia el servicio de audio')[0]
  assert.equal(typeof top.pattern.msg, 'function')
  assert.ok(top.pattern.msg(top.match).includes('servicio'))
})

test('route: cierra todo usa el patron real', () => {
  const top = smart.route('cierra todo')[0]
  assert.equal(top.pattern.msg, 'Cerrando todo')
  assert.ok(top.pattern.run.includes('MainWindowTitle'), 'no debe ser stopProcess(todo)')
})

test('route: apagate en N programa apagado', () => {
  const top = smart.route('apágate en 5 minutos')[0]
  assert.ok(top.pattern.confirm(top.match).includes('5'), top.pattern.confirm(top.match))
})

test('route: apaga el equipo sigue apagando', () => {
  const top = smart.route('apaga el equipo')[0]
  assert.equal(top.pattern.msg({ 4: null }), 'Apagando en 30 segundos')
})

test('pickBest: empate riesgoso pregunta', () => {
  const r = smart.pickBest([
    { pattern: { msg: 'A', priority: 5 }, match: [] },
    { pattern: { msg: 'B', priority: 5 }, match: [] },
  ])
  assert.ok(r.ask && r.ask.length === 2)
})

test('pickBest: empate generico sin riesgo mantiene el primero', () => {
  const h = { pattern: { msg: 'A' }, match: [] }
  const r = smart.pickBest([h, { pattern: { msg: 'B' }, match: [] }])
  assert.equal(r.hit, h)
})

test('splitCommands: no parte dentro de comillas', () => {
  const parts = parser.splitCommands('di "pan y queso" y qué hora es', /(?:\s+y\s+)/i)
  assert.equal(parts.length, 2)
  assert.equal(parts[0], 'di "pan y queso"')
})

console.log('\nsystem.js confirm (Fase 6, denegar no ejecuta)')
const system = require('../src/main/commands/system')

async function run6() {
system.setConfirm(async () => false)
const denied = await system.executeSystem('apaga el equipo')
test('denegar apaga el equipo cancela sin ejecutar', () => {
  assert.equal(denied.message, 'Cancelado. ¿Necesitas algo más?')
})
system.setConfirm(null)

const hora = await system.executeSystem('qué hora es')
test('qué hora es sigue funcionando', () => {
  assert.equal(hora.success, true)
  assert.ok(hora.message.includes('Son las'))
})

console.log('\nmemory.matchCustom bordes (Fase 6)')
const os = require('os')
const memory = require('../src/main/memory')
memory.setUserDataPath(os.tmpdir())
memory.addCommand('luz del baño', '-encender')
test('matchCustom matchea frase con trigger', () => {
  assert.ok(memory.matchCustom('prende la luz del baño por favor'))
})
test('matchCustom no matchea subcadena parcial', () => {
  assert.equal(memory.matchCustom('enciende las luces'), null)
})
memory.removeCommand('luz del baño')

console.log('\nrun-ps compartido (Fase 6)')
const { runPs } = require('../src/main/run-ps')
const out = await runPs(`Write-Output hola`)
test('runPs captura stdout', () => {
  assert.equal(out.stdout, 'hola')
  assert.equal(out.err, null)
})

console.log('\nvoz Fase 7 (config + wake)')
const config = require('../src/main/config')
config.setUserDataPath(os.tmpdir())
const cfg = config.load()
test('config trae micDevice y endPause', () => {
  assert.ok('micDevice' in cfg)
  assert.ok(cfg.endPause >= 0.5 && cfg.endPause <= 5)
})

const wake = require('../src/main/wake')
test('wake.start sin motor devuelve false sin romper', () => {
  const fs = require('fs')
  const path = require('path')
  if (fs.existsSync(path.join(__dirname, '..', 'dist', 'wake.exe'))) {
    console.log('    (con motor compilado, se omite)')
    return
  }
  assert.equal(wake.start('asistente', { endPause: 1.2 }), false)
})

try {
  const devs = await wake.listDevices()
  test('listDevices devuelve arreglo', () => {
    assert.ok(Array.isArray(devs))
  })
} catch (e) {
  test('listDevices no debe lanzar', () => { throw new Error(e.message) })
}

console.log('\nvox con vida (Fase 11)')
const testDir = path.join(os.tmpdir(), 'voxdesk-test')
try { require('fs').mkdirSync(testDir, { recursive: true }) } catch {}
memory.setUserDataPath(testDir)
const mood = require('../src/main/mood')

test('mood arranca en 60 y recorta', () => {
  memory.set('vox_mood', undefined)
  assert.equal(mood.getMood(), 60)
  memory.set('vox_mood', 150)
  assert.equal(mood.getMood(), 100)
})

test('addMood suma', () => {
  memory.set('vox_mood', 60)
  assert.equal(mood.addMood(8), 68)
})

test('nombre se guarda y recorta a 30', () => {
  mood.setName('  Ana María de los Ángeles del Río Grande  ')
  assert.ok(mood.getName().length <= 30)
  mood.setName('')
})

const fun = require('../src/main/fun')
test('joke/fact salen de sus listas', () => {
  assert.ok(fun.JOKES.includes(fun.joke(() => 0)))
  assert.equal(fun.fact(() => 0), fun.FACTS[0])
})

const life = require('../src/main/life')
const today = new Date().toISOString().slice(0, 10)
const ctxBase = () => ({ now: Date.now(), hour: 9, name: '', mood: 60, daysAway: 0, idleMin: 1, recentCmds: 0, battery: 80, lastMorning: today, lastNight: today, lastBatteryWarn: 0, lastMissed: Date.now(), lastBreak: Date.now(), lastSleepState: '', streak: null })

test('batería crítica avisa con voz', () => {
  const a = life.evaluate({ ...ctxBase(), battery: 15 })
  assert.equal(a.id, 'battery')
  assert.equal(a.speak, true)
})

test('buenos días una sola vez', () => {
  const a = life.evaluate({ ...ctxBase(), lastMorning: '2000-01-01' })
  assert.equal(a.id, 'morning')
  assert.ok(a.stamp.lastMorning === today)
})

test('racha a los 5 pide marcar', () => {
  const a = life.evaluate({ ...ctxBase(), streak: { day: today, n: 5, done: false } })
  assert.equal(a.id, 'streak')
  assert.equal(a.streakDone, true)
})

test('dormir tras 10 min sin uso', () => {
  const a = life.evaluate({ ...ctxBase(), idleMin: 11, lastSleepState: '' })
  assert.equal(a.id, 'sleep')
})

test('sin nada no actúa', () => {
  assert.equal(life.evaluate(ctxBase()), null)
})

console.log('\ntts dual (Fase 12)')
const tts = require('../src/main/tts')
test('getEngine sin vendor cae a sapi', () => {
  const e = tts.getEngine('sistema')
  assert.equal(e.engine, 'sapi')
})
test('getEngine prefiere piper si hay vendor', () => {
  const fs = require('fs')
  const path = require('path')
  const vendor = path.join(__dirname, '..', 'vendor')
  if (!fs.existsSync(path.join(vendor, 'piper', 'piper.exe'))) {
    console.log('    (sin vendor, se omite)')
    return
  }
  const e = tts.getEngine('mexicana')
  assert.equal(e.engine, 'piper')
})

console.log('\nagente (Fase 14a, stubs)')
const agent = require('../src/main/agent')

async function atest(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`) }
}

test('parsePlan extrae JSON entre texto', () => {
  const steps = agent.parsePlan('Claro: {"steps": [{"action": "abre chrome"}, {"action": "qué hora es"}]} listo')
  assert.equal(steps.length, 2)
  assert.equal(steps[0].action, 'abre chrome')
})

test('parsePlan rechaza basura y vacíos', () => {
  assert.equal(agent.parsePlan('no hay json aquí'), null)
  assert.equal(agent.parsePlan('{"steps": []}'), null)
  assert.equal(agent.parsePlan(null), null)
})

await atest('run feliz ejecuta y resume', async () => {
  const seen = []
  const r = await agent.run('x', {
    ask: async () => '{"steps": [{"action": "a"}, {"action": "b"}]}',
    execStep: async (a) => { seen.push(a); return { success: true, message: a } },
    confirm: async () => true,
  })
  assert.deepEqual(seen, ['a', 'b'])
  assert.equal(r.ok, true)
  assert.ok(r.message.includes('2/2'))
})

await atest('run cancelado no ejecuta', async () => {
  let n = 0
  const r = await agent.run('x', {
    ask: async () => '{"steps": [{"action": "a"}]}',
    execStep: async () => { n++; return { success: true } },
    confirm: async () => false,
  })
  assert.equal(n, 0)
  assert.equal(r.cancelled, true)
})

await atest('run replanifica un fallo y termina', async () => {
  let asks = 0
  const r = await agent.run('x', {
    ask: async () => { asks++; return asks === 1 ? '{"steps": [{"action": "a"}, {"action": "malo"}]}' : '{"steps": [{"action": "bueno"}]}' },
    execStep: async (a) => (a === 'malo' ? { success: false, message: 'falló' } : { success: true, message: a }),
    confirm: async () => true,
  })
  assert.equal(asks, 2)
  assert.equal(r.ok, true)
  assert.ok(r.message.includes('2/3'))
})

console.log('\nvitales (Fase 14b, puros)')
const vitals = require('../src/main/vitals')

test('parseSnapshot lee el formato', () => {
  const s = vitals.parseSnapshot('RAM:85|DISCO:62|DISCOGB:120.5|BAT:90|UP:1.5|CPU:12')
  assert.equal(s.ramFree, 85)
  assert.equal(s.diskFreeGB, 120.5)
  assert.equal(s.batt, 90)
})

test('parseSnapshot basura da -1', () => {
  const s = vitals.parseSnapshot('hola')
  assert.equal(s.ramFree, -1)
  assert.equal(s.cpu, -1)
})

test('score penaliza disco y ram', () => {
  assert.equal(vitals.score({ ramFree: 90, diskFree: 80, diskFreeGB: 200, batt: -1, upDays: 1, cpu: 5 }), 100)
  assert.ok(vitals.score({ ramFree: 10, diskFree: 5, diskFreeGB: 20, batt: 10, upDays: 9, cpu: 90 }) < 40)
})

test('reportText resume en una línea', () => {
  const t = vitals.reportText({ ramFree: 85, diskFree: 62, diskFreeGB: 120.5, batt: -1, upDays: 0.5, cpu: 12 })
  assert.ok(t.startsWith('Sistemas al 100%'))
  assert.ok(t.includes('120.5 GB'))
})

console.log('\nentender (Fase 13, puro)')
const understand = require('../src/main/understand')

test('normalize quita tildes y sinonimos', () => {
  assert.equal(understand.normalize('Apagá la compú!'), 'apaga la equipo')
})

test('route: apaga la compu -> apaga', () => {
  const r = understand.route('apaga la compu')
  assert.equal(r.id, 'apaga')
  assert.ok(r.conf >= understand.HI, r.conf)
  assert.equal(r.canon, 'apaga el equipo')
})

test('route: frase rara da baja confianza', () => {
  const r = understand.route('el ornitorrinco baila tango')
  assert.ok(!r || r.conf < understand.MID, r && r.conf)
})

test('validateKey acepta vacía en LAN', () => {
  const llm = require('../src/main/llm')
  assert.equal(llm.validateKey('x', '', 'http://127.0.0.1:1234/v1'), null)
  assert.equal(llm.validateKey('x', '', 'http://192.168.1.50:11434/v1'), null)
  assert.ok(llm.validateKey('gemini', '', 'https://generativelanguage.googleapis.com/v1beta'))
  assert.ok(llm.validateKey('gemini', 'corta'))
  assert.equal(llm.validateKey('gemini', 'AIza123456789'), null)
})

console.log('\ncaché + feedback (B1)')
test('isMeta detecta meta-órdenes', () => {
  const understand = require('../src/main/understand')
  assert.ok(understand.isMeta('repítelo'))
  assert.ok(understand.isMeta('analiza eso'))
  assert.ok(!understand.isMeta('apaga el equipo'))
})

test('caché guarda, usa y borra', () => {
  memory.saveCachePair('apaga la equipo', 'apaga el equipo')
  assert.equal(memory.getCache()['apaga la equipo'].action, 'apaga el equipo')
  assert.equal(memory.bumpCache('apaga la equipo', 3), true)
  assert.equal(memory.getCache()['apaga la equipo'].uses, 4)
  assert.equal(memory.removeCache('apaga la equipo'), true)
  assert.equal(memory.getCache()['apaga la equipo'], undefined)
})

test('lee esto rutea al lector', () => {
  const smart = require('../src/main/smart-exec')
  const top = smart.route('lee esto')[0]
  assert.equal(top.pattern.msg, 'Leyendo selección')
})

console.log('\nnoticias + silencio (B2)')
const news = require('../src/main/news')

test('parseRss saca 5 titulares limpios', () => {
  const xml = '<rss><channel>' + [1, 2, 3, 4, 5, 6].map(i => `<item><title>Noticia ${i} <![CDATA[x]]> - Medio ${i}</title></item>`).join('') + '</channel></rss>'
  const hs = news.parseRss(xml)
  assert.equal(hs.length, 5)
  assert.equal(hs[0], 'Noticia 1 x')
})

test('noticias RSS gana al viejo', () => {
  const smart = require('../src/main/smart-exec')
  const top = smart.route('cuéntame las noticias')[0]
  assert.equal(top.pattern.msg, 'Leyendo titulares')
})

test('silencio no colisiona', () => {
  const smart = require('../src/main/smart-exec')
  assert.equal(smart.route('modo silencio')[0].pattern.msg, 'Modo silencio')
  assert.equal(smart.route('vuelve')[0].pattern.msg, 'Fin del silencio')
  const saludo = smart.route('buenas noches')[0]
  assert.ok(/buenas/.test(String(saludo.pattern.match)))
  assert.notEqual(saludo.pattern.msg, 'Modo silencio')
})

console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
}

await run6()
}

run()
