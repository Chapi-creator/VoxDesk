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

await atest('getEngine edge resuelve voz', () => {
  const e = tts.getEngine('edge')
  assert.equal(e.engine, 'edge')
  assert.equal(e.voice, 'es-MX-DaliaNeural')
})

test('selfTest silencioso verifica generación', async () => {
  const fs = require('fs')
  const path = require('path')
  const vendor = path.join(__dirname, '..', 'vendor')
  if (!fs.existsSync(path.join(vendor, 'piper', 'piper.exe'))) {
    console.log('    (sin vendor, se omite)')
    return
  }
  const r = await tts.selfTest({ silent: true })
  assert.equal(r.engine, 'piper')
  assert.equal(r.generated, true)
  assert.ok(r.size > 1000)
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

console.log('\nescalera launch + barge-in (B3)')
const launch = require('../src/main/commands/launch')

test('findApp: alias instantáneo', () => {
  assert.deepEqual(launch.findApp('chrome'), { target: 'chrome', via: 'alias' })
})

test('findApp: vacío null', () => {
  assert.equal(launch.findApp(''), null)
  assert.equal(launch.findApp('   '), null)
})

test('findApp: where halla notepad', () => {
  const r = launch.findApp('notepad')
  assert.ok(r && r.target.toLowerCase().includes('notepad'))
  assert.ok(['where', 'alias'].includes(r.via), r.via)
})

test('findApp: invento no rompe', () => {
  const r = launch.findApp('zzzprogramaque_noexiste123')
  assert.ok(r === null || typeof r.target === 'string')
})

test('shouldHear: puerta anti-eco', () => {
  const wake = require('../src/main/wake')
  assert.equal(wake.shouldHear(false, 0, 1000), true)
  assert.equal(wake.shouldHear(true, 1000, 2000), true)
  assert.equal(wake.shouldHear(true, 0, 20000), false)
  assert.equal(wake.shouldHear(true, 1000, 9000), false)
})

console.log('\nsilencio (B2 sin noticias)')
test('silencio no colisiona', () => {
  const smart = require('../src/main/smart-exec')
  assert.equal(smart.route('modo silencio')[0].pattern.msg, 'Modo silencio')
  assert.equal(smart.route('vuelve')[0].pattern.msg, 'Fin del silencio')
  const saludo = smart.route('buenas noches')[0]
  assert.ok(/buenas/.test(String(saludo.pattern.match)))
  assert.notEqual(saludo.pattern.msg, 'Modo silencio')
})

console.log('\nejemplos unificados (deuda menor)')
test('cada ejemplo rutea a su propio patrón', () => {
  const smart = require('../src/main/smart-exec')
  const understand = require('../src/main/understand')
  const XTRA = smart.getPatternExamples().map(e => ({ id: 'pat', canon: e.canon, ex: e.ex }))
  const bad = []
  for (const { pattern, ex } of smart.getPatternExamples()) {
    for (const ejemplo of ex) {
      const hits = smart.route(ejemplo)
      const top = hits.length ? hits[0].pattern : null
      if (top !== pattern) bad.push(`${ejemplo} -> ${top ? top.msg : 'nada'}`)
    }
  }
  assert.deepEqual(bad, [])
})

test('route con extra usa ejemplos de patrones', () => {
  const smart = require('../src/main/smart-exec')
  const understand = require('../src/main/understand')
  const XTRA = smart.getPatternExamples().map(e => ({ id: 'pat', canon: e.canon, ex: e.ex }))
  const r = understand.route('apaga la compu', XTRA)
  assert.ok(r.conf >= understand.HI, r.conf)
  assert.equal(r.canon, 'apaga el equipo')
})

console.log('\npulir + añadir (P3/A2/A1/A3)')

test('voiceRate default 1', () => {
  const config = require('../src/main/config')
  config.setUserDataPath(require('os').tmpdir())
  assert.equal(config.load().voiceRate, 1)
})

const notes = require('../src/main/commands/notes')

await atest('notas: crear, listar, leer, buscar, borrar', async () => {
  const r1 = await notes.execute('comprar pan')
  assert.ok(r1.message.includes('Nota 1'))
  const r2 = await notes.execute('lista mis notas')
  assert.ok(r2.message.includes('comprar pan'))
  const r3 = await notes.execute('busca pan en mis notas')
  assert.ok(r3.message.includes('comprar pan'))
  const r4 = await notes.execute('lee la nota 1')
  assert.ok(r4.message.includes('comprar pan'))
  const r5 = await notes.execute('borra la nota 1')
  assert.ok(r5.message.includes('borrada'))
  const r6 = await notes.execute('lista mis notas')
  assert.ok(r6.message.includes('No tienes notas'))
})

await atest('notas: vacía pregunta', async () => {
  const r = await notes.execute('')
  assert.equal(r.success, false)
})

const timer = require('../src/main/commands/timer')

test('parseRepeat: cada hora/día/N', () => {
  assert.equal(timer.parseRepeat('recuérdame tomar agua cada hora').ms, 3600000)
  assert.equal(timer.parseRepeat('avísame cada día').ms, 86400000)
  assert.equal(timer.parseRepeat('cada 30 minutos').ms, 1800000)
  assert.equal(timer.parseRepeat('alarma en 10 segundos'), null)
})

await atest('recurrente se programa y lista', async () => {
  const r = await timer.execute('recuérdame tomar agua en 10 segundos cada hora')
  assert.ok(r.message.includes('cada hora'))
  const l = await timer.execute('qué recordatorios tengo')
  assert.ok(l.message.includes('tomar agua'))
  const c = await timer.execute('cancela el recordatorio 1')
  assert.ok(c.message.includes('cancelado'))
})

const profiles = require('../src/main/profiles')

test('perfiles existen con pasos', () => {
  assert.deepEqual(profiles.list(), ['trabajo', 'juego', 'estudio', 'normal'])
  assert.ok(profiles.get('trabajo').steps.length >= 2)
  assert.equal(profiles.get('inexistente'), null)
})

test('modo trabajo rutea a macro', () => {
  const smart = require('../src/main/smart-exec')
  const top = smart.route('modo trabajo')[0]
  const r = top.pattern.handler(['modo trabajo', 'trabajo'])
  assert.ok(Array.isArray(r._macro) && r._macro.length >= 2)
})

console.log('\nv1.0 (historial, timers, health)')
const timers = require('../src/main/commands/timer')

test('listTimers ordena y expone', () => {
  memory.saveReminder('zz prueba', Date.now() + 60000, 0)
  const all = timers.listTimers()
  assert.ok(all.some(r => r.message === 'zz prueba'))
  memory.listReminders().filter(r => r.message === 'zz prueba').forEach(r => memory.removeReminder(r.id))
})

test('wake.enginePath existe o null sin romper', () => {
  const wake = require('../src/main/wake')
  const p = wake.enginePath()
  assert.ok(p === null || typeof p === 'string')
})

console.log('\nvoces custom (HF)')
const voices = require('../src/main/voices')

test('filesFromUrl acepta HF y rechaza resto', () => {
  const ok = voices.filesFromUrl('https://huggingface.co/X/Y/resolve/main/voz.onnx')
  assert.equal(ok.file, 'voz.onnx')
  assert.ok(ok.jsonUrl.endsWith('.onnx.json'))
  assert.equal(voices.filesFromUrl('https://evil.com/voz.onnx'), null)
  assert.equal(voices.filesFromUrl('https://huggingface.co/X/Y/blob/main/voz.zip'), null)
  assert.equal(voices.filesFromUrl('no url'), null)
})

test('custom add/remove en memoria', () => {
  memory.set('vox_custom_voices', [{ name: 'Mía', file: 'mia.onnx' }])
  assert.equal(voices.listCustom().length, 1)
  voices.removeCustomVoice('mia.onnx')
  assert.equal(voices.listCustom().length, 0)
})

test('getEngine resuelve custom con override', () => {
  const fs = require('fs')
  const path = require('path')
  const tmp = path.join(require('os').tmpdir(), 'vox-voice-test')
  fs.mkdirSync(path.join(tmp, 'piper'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'voices', 'custom'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'piper', 'piper.exe'), 'x')
  fs.writeFileSync(path.join(tmp, 'voices', 'custom', 'mia.onnx'), 'x'.repeat(2000))
  const e = tts.getEngine('custom:mia.onnx', tmp)
  assert.equal(e.engine, 'piper')
  assert.ok(e.model.endsWith('mia.onnx'))
  fs.rmSync(tmp, { recursive: true, force: true })
})

console.log('\nmodelo grande (A1)')
const wakeMod = require('../src/main/wake')

test('config trae voiceModel small', () => {
  const config = require('../src/main/config')
  config.setUserDataPath(require('os').tmpdir())
  assert.equal(config.load().voiceModel, 'small')
})

test('wakeArgs arma flags', () => {
  assert.deepEqual(wakeMod.wakeArgs('hola', {}), ['hola'])
  assert.deepEqual(
    wakeMod.wakeArgs('hola', { device: 'mic', endPause: 2, modelDir: 'D:/m' }),
    ['hola', '--device', 'mic', '--end-pause', '2', '--model-dir', 'D:/m']
  )
})

console.log('\nproveedores (auditoría, fetch mock)')
const llm = require('../src/main/llm')

function mockFetch(fn) {
  const orig = global.fetch
  global.fetch = fn
  return () => { global.fetch = orig }
}

await atest('gemini ask devuelve texto', async () => {
  const config = require('../src/main/config')
  config.save({ provider: 'gemini', model: 'gemini-3.5-flash', apiKey: 'AIza123456789' })
  const restore = mockFetch(async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'hola' }] } }] }),
  }))
  try {
    const r = await llm.ask('hola')
    assert.equal(r, 'hola')
  } finally { restore() }
})

await atest('ask sin key en público no llama red', async () => {
  const config = require('../src/main/config')
  config.save({ provider: 'gemini', model: 'gemini-3.5-flash', apiKey: '' })
  let called = 0
  const restore = mockFetch(async () => { called++; return { ok: true, json: async () => ({}) } })
  try {
    assert.equal(await llm.ask('hola'), '')
    assert.equal(called, 0)
  } finally { restore() }
})

await atest('local ask sin key sí llama', async () => {
  const config = require('../src/main/config')
  config.save({ provider: 'local', model: 'qwen2.5:1.5b', apiKey: '' })
  let url = ''
  const restore = mockFetch(async (u) => {
    url = u
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }
  })
  try {
    assert.equal(await llm.ask('hola'), 'ok')
    assert.ok(url.includes('127.0.0.1:11434'))
  } finally { restore() }
})

await atest('lmstudio lista modelos vivos', async () => {
  const restore = mockFetch(async () => ({
    ok: true, json: async () => ({ data: [{ id: 'qwen3-4b' }, { id: 'mistral-7b' }] }),
  }))
  try {
    const ms = await llm.listModels('', 'lmstudio')
    assert.equal(ms.length, 2)
    assert.equal(ms[0].name, 'qwen3-4b')
  } finally { restore() }
})

test('deepseek manda thinking desactivado', () => {
  const config = require('../src/main/config')
  config.save({ provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: 'sk-test12345678' })
  const { options } = llm.PROVIDERS.deepseek.buildRequest('sk-test12345678', 'deepseek-v4-flash', 'hola', [])
  const body = JSON.parse(options.body)
  assert.deepEqual(body.thinking, { type: 'disabled' })
  assert.equal(body.model, 'deepseek-v4-flash')
})

test('validateKey xai + local sin key', () => {
  assert.ok(llm.validateKey('xai', 'mal'))
  assert.equal(llm.validateKey('xai', 'xai-12345678'), null)
  assert.equal(llm.validateKey('local', ''), null)
  assert.equal(llm.validateKey('lmstudio', ''), null)
})

console.log('\nfechas naturales')
const dates = require('../src/main/dates')

test('mañana a las 8', () => {
  const now = new Date(2026, 9, 14, 10, 30)
  const r = dates.parseDate('recuérdame llamar mañana a las 8', now)
  assert.equal(r.date.getDate(), 15)
  assert.equal(r.date.getHours(), 8)
  assert.equal(r.date.getMinutes(), 0)
})

test('pasado mañana sin hora = 9:00', () => {
  const now = new Date(2026, 9, 14, 10, 30)
  const r = dates.parseDate('avísame pasado mañana', now)
  assert.equal(r.date.getDate(), 16)
  assert.equal(r.date.getHours(), 9)
})

test('en 3 días a las 7', () => {
  const now = new Date(2026, 9, 14, 10, 30)
  const r = dates.parseDate('recuérdame en 3 días a las 7', now)
  assert.equal(r.date.getDate(), 17)
  assert.equal(r.date.getHours(), 7)
})

test('el viernes es futuro', () => {
  const now = new Date(2026, 9, 14, 10, 30)
  const r = dates.parseDate('reunión el viernes a las 9', now)
  assert.equal(r.date.getDay(), 5)
  assert.ok(r.date > now)
})

test('hoy pasado usa mañana', () => {
  const now = new Date(2026, 9, 14, 22, 0)
  const r = dates.parseDate('alarma hoy a las 7', now)
  assert.equal(r.date.getDate(), 15)
})

test('sin fecha devuelve null', () => {
  assert.equal(dates.parseDate('abre chrome', new Date()), null)
})

console.log('\nrutinas (3)')
const routines = require('../src/main/routines')

test('parse: todos los días a las 8', () => {
  const r = routines.parse('todos los días a las 8 dime el clima')
  assert.equal(r.time, '08:00')
  assert.ok(r.action.includes('clima'))
})

test('parse: cada día 9pm', () => {
  const r = routines.parse('recuérdame cada día 9pm tomar agua')
  assert.equal(r.time, '21:00')
  assert.ok(r.action.length > 0)
})

test('parse: sin hora no vale', () => {
  assert.equal(routines.parse('todos los días dime hola'), null)
  assert.equal(routines.parse('abre chrome'), null)
})

test('dueRoutines: vencidas de hoy sin correr', () => {
  const now = new Date(2026, 9, 14, 10, 30)
  const list = [
    { id: 1, time: '08:00', action: 'a', lastRun: '' },
    { id: 2, time: '12:00', action: 'b', lastRun: '' },
    { id: 3, time: '08:00', action: 'c', lastRun: '2026-10-14' },
  ]
  const due = routines.dueRoutines(list, now)
  assert.deepEqual(due.map(r => r.id), [1])
})

test('add/remove rutinas', () => {
  const id = routines.add('07:30', 'prueba x')
  assert.ok(routines.all().some(r => r.id === id))
  assert.equal(routines.remove(id), true)
  assert.equal(routines.remove(999999), false)
})

console.log('\ndictado + stats (4+5)')
const type = require('../src/main/commands/type')

test('chunkText trocea en 400', () => {
  assert.deepEqual(type.chunkText('abc'), ['abc'])
  const long = 'x'.repeat(900)
  const parts = type.chunkText(long)
  assert.equal(parts.length, 3)
  assert.equal(parts.join(''), long)
})

test('trackStats cuenta y resume', () => {
  memory.set('vox_stats', null)
  mood.trackStats('abre chrome', true)
  mood.trackStats('abre chrome', true)
  mood.trackStats('falla esto', false)
  const s = mood.statsSummary()
  assert.equal(s.total, 3)
  assert.equal(s.okRate, 67)
  assert.equal(s.top[0][0], 'abre chrome')
  memory.set('vox_stats', null)
})

console.log('\nplugins (6)')
const plugins = require('../src/main/plugins')

await atest('plugins: match, run y error aislado', async () => {
  const fs = require('fs')
  const os = require('os')
  const path = require('path')
  const dir = path.join(os.tmpdir(), 'vox-skills-test')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'a.js'), "module.exports = { name: 'saludo', triggers: ['di hola con estilo'], run: async () => ({ message: 'hola!' }) }")
  fs.writeFileSync(path.join(dir, 'roto.js'), "module.exports = { name: 'roto', triggers: ['rompete'], run: async () => { throw new Error('pum') } }")
  fs.writeFileSync(path.join(dir, 'nota.txt'), 'ignorado')
  plugins.setSkillsDir(dir)
  const loaded = plugins.loadAll()
  assert.equal(loaded.length, 2)
  const hit = plugins.match('oye, di hola con estilo porfa')
  assert.equal(hit.name, 'saludo')
  assert.equal(plugins.match('abre chrome'), null)
  const ok = await plugins.runPlugin(hit, 'x', {})
  assert.equal(ok.message, 'hola!')
  const bad = await plugins.runPlugin(plugins.match('rompete ya'), 'x', {})
  assert.equal(bad.success, false)
  assert.ok(bad.message.includes('roto'))
  fs.rmSync(dir, { recursive: true, force: true })
  plugins.setSkillsDir('')
})

console.log('\nremoto (R1)')
const remoteApi = require('../src/main/remote')

test('token bearer + timingSafe', () => {
  const t = remoteApi.newToken()
  assert.equal(t.length, 64)
  const req = { headers: { authorization: 'Bearer ' + t } }
  assert.equal(remoteApi.parseBearer(req), t)
  assert.equal(remoteApi.parseBearer({ headers: {} }), '')
  assert.equal(remoteApi.checkToken(t, t), true)
  assert.equal(remoteApi.checkToken(t + 'x', t), false)
  assert.equal(remoteApi.checkToken('', t), false)
})

await atest('startRemote: 401 sin token, 200 con token, 404 resto', async () => {
  const http = require('http')
  const { server, port } = await remoteApi.startRemote({
    port: 45671,
    getToken: () => 'secreto',
    handlers: {
      execute: async (text) => ({ success: true, message: 'eco:' + text }),
      status: async () => ({ version: 'x' }),
      timers: async () => [{ message: 'a', timestamp: 1 }],
      speak: async () => true,
    },
  })
  const call = (path, opts = {}, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: opts.method || 'GET', headers: opts.headers || {} }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ code: res.statusCode, body: JSON.parse(d) }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
  try {
    assert.equal((await call('/api/status')).code, 401)
    const H = { authorization: 'Bearer secreto' }
    const st = await call('/api/status', { headers: H })
    assert.equal(st.code, 200)
    assert.equal(st.body.version, 'x')
    const ex = await call('/api/execute', { method: 'POST', headers: { ...H, 'content-type': 'application/json' } }, JSON.stringify({ text: 'hola' }))
    assert.equal(ex.body.message, 'eco:hola')
    const sp = await call('/api/speak', { method: 'POST', headers: { ...H, 'content-type': 'application/json' } }, JSON.stringify({ text: 'hola' }))
    assert.equal(sp.body.ok, true)
    assert.equal((await call('/api/nope', { headers: H })).code, 404)
    assert.equal((await call('/otro', { headers: H })).code, 404)
  } finally {
    server.close()
  }
})

console.log('\nPWA cliente (R2)')
const rclient = require('../src/remote/client')

test('parseToken saca hex del hash', () => {
  assert.equal(rclient.parseToken('http://1.2.3.4:4567/remote/#abc123'), 'abc123')
  assert.equal(rclient.parseToken('http://x/remote/'), '')
  assert.equal(rclient.parseToken('no url'), '')
})

test('apiCall mete Bearer y parsea', async () => {
  let got = null
  const fakeFetch = async (url, opts) => {
    got = { url, opts }
    return { ok: true, status: 200, json: async () => ({ ok: true }) }
  }
  const r = await rclient.apiCall(fakeFetch, 'http://1.2.3.4:4567/', 'tok', '/api/status')
  assert.equal(r.ok, true)
  assert.ok(got.url.endsWith('/api/status'))
  assert.equal(got.opts.headers.Authorization, 'Bearer tok')
})

await atest('apiCall 401 lanza', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, json: async () => ({}) })
  let err = null
  try { await rclient.apiCall(fakeFetch, 'http://x/', 'mal', '/api/status') } catch (e) { err = e }
  assert.ok(err && /acceso/.test(err.message))
})

await atest('PWA servida sin auth, API con auth', async () => {
  const http = require('http')
  const path = require('path')
  const { server, port } = await remoteApi.startRemote({
    port: 45672,
    remoteDir: path.join(__dirname, '..', 'src', 'remote'),
    getToken: () => 's3cr3t',
    handlers: { execute: async () => ({}), status: async () => ({}), timers: async () => [], speak: async () => true },
  })
  const get = (p, headers) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, headers: headers || {} }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ code: res.statusCode, type: res.headers['content-type'], body: d }))
    }).on('error', reject)
  })
  try {
    const idx = await get('/remote/')
    assert.equal(idx.code, 200)
    assert.ok(idx.type.includes('text/html'))
    assert.ok(idx.body.includes('VoxDesk Remoto'))
    const js = await get('/remote/client.js')
    assert.equal(js.code, 200)
    assert.ok(js.type.includes('javascript'))
    const trav = await get('/remote/%2e%2e/package.json')
    assert.ok([400, 403, 404].includes(trav.code))
    const api = await get('/api/status')
    assert.equal(api.code, 401)
  } finally {
    server.close()
  }
})

console.log('\naprobaciones (R3)')
const approvals = require('../src/main/approvals')

test('cola: encolar, listar, decidir, tope', () => {
  approvals.clear()
  const id = approvals.queue('Apagar equipo', 'detalle', 'apaga el equipo')
  assert.ok(approvals.list().some(x => x.id === id))
  const item = approvals.decide(id, true)
  assert.equal(item.transcript, 'apaga el equipo')
  assert.equal(approvals.list().length, 0)
  const id2 = approvals.queue('X', 'y', 'z')
  assert.equal(approvals.decide(999999, true), null)
  assert.equal(approvals.decide(id2, false), null)
  for (let i = 0; i < 25; i++) approvals.queue('T' + i, '', 'x')
  assert.ok(approvals.list().length <= 20)
  approvals.clear()
  assert.equal(approvals.list().length, 0)
})

console.log('\nmodelcheck (integridad)')
const modelcheck = require('../src/main/modelcheck')

test('detecta modelo incompleto y lo limpia', () => {
  const fs = require('fs')
  const path = require('path')
  const tmp = path.join(require('os').tmpdir(), 'vox-modelcheck-test')
  const base = path.join(tmp, 'vosk-model-es-0.42', 'am')
  fs.mkdirSync(base, { recursive: true })
  const fd = fs.openSync(path.join(base, 'final.mdl'), 'w')
  fs.ftruncateSync(fd, 60 * 1024 * 1024)
  fs.closeSync(fd)
  const r = modelcheck.checkLargeModel(tmp)
  assert.equal(r.ok, false)
  assert.ok(r.missing.some(m => m.includes('HCLG')))
  assert.ok(modelcheck.wipeLargeModel(tmp))
  assert.equal(fs.existsSync(path.join(tmp, 'vosk-model-es-0.42')), false)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('zip sin firma final se rechaza aunque pese 1GB', () => {
  const fs = require('fs')
  const path = require('path')
  const tmp = path.join(require('os').tmpdir(), 'vox-zipcheck-test')
  fs.mkdirSync(tmp, { recursive: true })
  const z = path.join(tmp, 'm.zip')
  const fd = fs.openSync(z, 'w')
  fs.ftruncateSync(fd, 1100 * 1024 * 1024)
  fs.closeSync(fd)
  assert.equal(modelcheck.zipLooksComplete(z), false)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('zip con firma EOCD al final pasa', () => {
  const fs = require('fs')
  const path = require('path')
  const tmp = path.join(require('os').tmpdir(), 'vox-zipcheck-test2')
  fs.mkdirSync(tmp, { recursive: true })
  const z = path.join(tmp, 'm.zip')
  const fd = fs.openSync(z, 'w')
  const size = 1100 * 1024 * 1024
  fs.ftruncateSync(fd, size)
  fs.writeSync(fd, Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]), 0, 22, size - 22)
  fs.closeSync(fd)
  assert.equal(modelcheck.zipLooksComplete(z), true)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('zip chico con firma se rechaza', () => {
  const fs = require('fs')
  const path = require('path')
  const tmp = path.join(require('os').tmpdir(), 'vox-zipcheck-test3')
  fs.mkdirSync(tmp, { recursive: true })
  const z = path.join(tmp, 'm.zip')
  fs.writeFileSync(z, Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  assert.equal(modelcheck.zipLooksComplete(z), false)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('modelo completo pasa', () => {
  const fs = require('fs')
  const path = require('path')
  const tmp = path.join(require('os').tmpdir(), 'vox-modelcheck-test2')
  for (const [d, f, sz] of [['am', 'final.mdl', 60], ['graph', 'HCLG.fst', 310], ['conf', 'model.conf', 1]]) {
    fs.mkdirSync(path.join(tmp, 'vosk-model-es-0.42', d), { recursive: true })
    const fd = fs.openSync(path.join(tmp, 'vosk-model-es-0.42', d, f), 'w')
    fs.ftruncateSync(fd, sz * 1024 * 1024)
    fs.closeSync(fd)
  }
  const r = modelcheck.checkLargeModel(tmp)
  assert.equal(r.ok, true)
  assert.equal(r.missing.length, 0)
  fs.rmSync(tmp, { recursive: true, force: true })
})

console.log('\nB1: followup (sí/no + continuaciones)')
const followup = require('../src/main/followup')

test('sí/no en español', () => {
  assert.ok(followup.isYes('sí'))
  assert.ok(followup.isYes('Si'))
  assert.ok(followup.isYes('dale'))
  assert.ok(followup.isYes('vale'))
  assert.ok(!followup.isYes('qué hora es'))
  assert.ok(followup.isNo('no'))
  assert.ok(followup.isNo('mejor no'))
  assert.ok(followup.isNo('para'))
  assert.ok(!followup.isNo('sí'))
})

test('pending: run/cancel/expirado', () => {
  const p = { canon: 'apaga el equipo', at: Date.now() }
  assert.deepEqual(followup.checkPending('sí', p).do, 'run')
  assert.equal(followup.checkPending('sí', p).command, 'apaga el equipo')
  assert.equal(followup.checkPending('no', p).do, 'cancel')
  assert.equal(followup.checkPending('qué hora es', p), null)
  assert.equal(followup.checkPending('sí', null), null)
  const old = { canon: 'x', at: Date.now() - followup.PENDING_TTL - 1000 }
  assert.equal(followup.checkPending('sí', old).do, 'expired')
})

test('followup clima con ciudad', () => {
  assert.equal(followup.resolveFollowup('y en Madrid', 'clima'), 'clima en Madrid')
  assert.equal(followup.resolveFollowup('en Barcelona', 'clima en Sevilla'), 'clima en Barcelona')
  assert.equal(followup.resolveFollowup('a las 8', 'clima'), null)
  assert.equal(followup.resolveFollowup('y en Madrid', 'qué hora es'), null)
})

test('followup alarma re-hora y hora nueva', () => {
  assert.equal(followup.resolveFollowup('a las 8', 'pon alarma a las 7'), 'pon alarma a las 8')
  assert.equal(followup.resolveFollowup('cámbiala a las 9', 'alarma a las 7'), 'alarma a las 9')
  assert.equal(followup.resolveFollowup('en 10 minutos', 'recuérdame llamar'), 'recuérdame llamar en 10 minutos')
  assert.equal(followup.resolveFollowup('a las 8', 'qué hora es'), null)
  assert.equal(followup.resolveFollowup('hola', 'pon alarma a las 7'), null)
})

console.log('\nB1: routeTop + sinónimos + calculadora en español')

test('routeTop ordena y route sigue igual', () => {
  const understand = require('../src/main/understand')
  const top = understand.routeTop('apaga la compu', [], 3)
  assert.ok(Array.isArray(top) && top.length >= 1)
  assert.equal(top[0].canon, 'apaga el equipo')
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].conf >= top[i].conf)
  assert.equal(new Set(top.map(x => x.canon)).size, top.length)
  const one = understand.route('apaga la compu', [])
  assert.equal(one.canon, top[0].canon)
})

test('sinónimos nuevos: máquina y aparato', () => {
  const understand = require('../src/main/understand')
  assert.equal(understand.route('apaga la maquina', []).id, 'apaga')
  assert.equal(understand.route('apaga el aparato', []).id, 'apaga')
})

test('sugerencias bajo MID', () => {
  const understand = require('../src/main/understand')
  const smart = require('../src/main/smart-exec')
  const XTRA = smart.getPatternExamples().map(e => ({ id: 'pat', canon: e.canon, ex: e.ex }))
  const sug = understand.routeTop('pon volumne alto', XTRA, 3).filter(s => s.conf >= 0.35 && s.conf < understand.MID)
  assert.ok(sug.length >= 1, 'sugiere algo parecido al volumen')
  assert.ok(sug[0].canon.toLowerCase().includes('volumen'))
})

await atest('calculadora entiende español', async () => {
  const smart = require('../src/main/smart-exec')
  const run = async (txt) => {
    const h = smart.route(txt)[0]
    assert.ok(h, 'rutea ' + txt)
    return String(await h.pattern.run(h.match))
  }
  assert.ok((await run('calcula 12 * 8')).includes('96'))
  assert.ok((await run('cuánto es 100 / 4')).includes('25'))
  assert.ok((await run('calcula 15 por ciento de 240')).includes('36'))
  assert.ok((await run('cuánto es 12 por 8')).includes('96'))
  assert.ok((await run('calcula 7 entre 2')).includes('3.5'))
  assert.ok((await run('calcula 50 menos 8')).includes('42'))
})

console.log('\nB2: enseñar por voz + resumen')

test('addCommand reemplaza, no duplica', () => {
  const memory = require('../src/main/memory')
  const fs = require('fs')
  const dir = fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'vox-b2-'))
  memory.setUserDataPath(dir)
  memory.addCommand('trabajo', 'abre chrome')
  memory.addCommand('trabajo', 'abre firefox')
  const d = memory.load()
  assert.equal(d.custom_commands.filter(c => c.trigger === 'trabajo').length, 1)
  assert.equal(d.custom_commands.find(c => c.trigger === 'trabajo').action, 'abre firefox')
  assert.ok(memory.removeCommand('trabajo'))
})

await atest('lo enseñado se ejecuta (macro con la acción)', async () => {
  const memory = require('../src/main/memory')
  const smart = require('../src/main/smart-exec')
  const fs = require('fs')
  const dir = fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'vox-b2b-'))
  memory.setUserDataPath(dir)
  memory.addCommand('trabajo', 'abre chrome', 'A trabajar')
  const r = await smart.execute('di trabajo')
  assert.ok(r && r.success, JSON.stringify(r && r.message))
  assert.deepEqual(r._macro, ['abre chrome'])
  assert.ok(r.message.includes('A trabajar'))
})

await atest('auto-referencia no ejecuta en bucle (anuncia)', async () => {
  const memory = require('../src/main/memory')
  const smart = require('../src/main/smart-exec')
  const fs = require('fs')
  const dir = fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'vox-b2c-'))
  memory.setUserDataPath(dir)
  memory.addCommand('eco', 'eco')
  const r = await smart.execute('eco')
  assert.ok(r && r.success)
  assert.equal(r._macro, undefined)
})

test('cuando diga X haz Y guarda el comando', () => {
  const memory = require('../src/main/memory')
  const smart = require('../src/main/smart-exec')
  const fs = require('fs')
  const dir = fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'vox-b2d-'))
  memory.setUserDataPath(dir)
  const pat = smart.PATTERNS.find(p => String(p.match).includes('cuando'))
  assert.ok(pat, 'existe patrón cuando-diga')
  const msg = pat.handler(['cuando diga peli abre netflix', 'peli', 'abre', 'abre netflix'])
  assert.ok(/Aprendido/.test(msg))
  const got = memory.matchCustom('peli')
  assert.ok(got && got.action === 'abre netflix')
})

test('startupBrief: saludo + pendientes + sugerencia', () => {
  const life = require('../src/main/life')
  const b1 = life.startupBrief({ name: 'Bre', hour: 9, routines: 2, reminders: 1, topCmd: null, daysAway: 0 })
  assert.ok(/Buenos d[ií]as Bre|¡Buenas Bre!/.test(b1), b1)
  assert.ok(/2 rutinas hoy y 1 recordatorio/.test(b1), b1)
  const b2 = life.startupBrief({ name: '', hour: 15, routines: 0, reminders: 0, topCmd: null, daysAway: 0 })
  assert.ok(/Buenas tardes|¡Hola!/.test(b2) && /Nada pendiente/.test(b2), b2)
  const b3 = life.startupBrief({ name: '', hour: 9, routines: 0, reminders: 0, topCmd: { text: 'qué hora es', n: 5 }, daysAway: 3 })
  assert.ok(/3 días fuera/.test(b3) && /cuando diga/.test(b3), b3)
  const b4 = life.startupBrief({ name: '', hour: 9, routines: 0, reminders: 0, topCmd: { text: 'x', n: 2 }, daysAway: 0 })
  assert.ok(!/cuando diga/.test(b4))
})

console.log('\nB3: personalidad')

await atest('saludos y despedidas varían sin repetir', async () => {
  const memory = require('../src/main/memory')
  const smart = require('../src/main/smart-exec')
  const fs = require('fs')
  const dir = fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'vox-b3-'))
  memory.setUserDataPath(dir)
  const say = async (txt) => (await smart.execute(txt)).message
  const g1 = await say('hola')
  const g2 = await say('hola')
  const g3 = await say('hola')
  assert.ok(g1 && g2 && g1 !== g2, 'saludos distintos')
  assert.ok(g2 !== g3, 'tercero distinto del segundo')
  const a1 = await say('adiós')
  const a2 = await say('adiós')
  assert.ok(a1 !== a2, 'despedidas distintas')
})

await atest('quién eres + nombre + estado por ánimo', async () => {
  const memory = require('../src/main/memory')
  const mood = require('../src/main/mood')
  const smart = require('../src/main/smart-exec')
  const fs = require('fs')
  const dir = fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'vox-b3b-'))
  memory.setUserDataPath(dir)
  const say = async (txt) => (await smart.execute(txt)).message
  mood.setName('Bre')
  assert.ok((await say('quién eres')).includes('Vox'))
  assert.ok((await say('cómo te llamas')).includes('Bre'))
  memory.set('vox_mood', 90)
  assert.ok(/Genial/.test(await say('cómo estás')))
  memory.set('vox_mood', 10)
  assert.ok(/cansado/.test(await say('cómo estás')))
})

await atest('opiniones: banco temático + fallback variado', async () => {
  const memory = require('../src/main/memory')
  const smart = require('../src/main/smart-exec')
  const fs = require('fs')
  const dir = fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'vox-b3c-'))
  memory.setUserDataPath(dir)
  const say = async (txt) => (await smart.execute(txt)).message
  assert.ok((await say('qué opinas del café')).includes('café'))
  assert.ok((await say('qué opinas sobre los lunes')).includes('lunes'))
  const o1 = await say('qué opinas de los impuestos')
  assert.ok(o1.includes('impuestos'))
})

console.log('\nB4: voz que se entiende + oído preciso')

test('cleanForSpeech: urls, correos, siglas, unidades', () => {
  const tts = require('../src/main/tts')
  assert.equal(tts.cleanForSpeech('mira https://ejemplo.com/x y www.test.org ya'), 'mira enlace y enlace ya')
  assert.equal(tts.cleanForSpeech('escribe a juan@mail.com porfa'), 'escribe a correo electrónico porfa')
  assert.equal(tts.cleanForSpeech('reinicia la PC y el USB'), 'reinicia la pe ce y el u ese be')
  assert.equal(tts.cleanForSpeech('tengo 128 GB y 512 MB libres'), 'tengo 128 gigas y 512 megas libres')
  assert.equal(tts.cleanForSpeech('hace 25°C hoy'), 'hace 25grados hoy')
  assert.equal(tts.cleanForSpeech('**hola** `mundo`'), 'hola mundo')
  assert.equal(tts.cleanForSpeech('  hola   mundo  '), 'hola mundo')
  // Siglas en mayúsculas se expanden; minúsculas y dentro de palabras no.
  assert.equal(tts.cleanForSpeech('el CPU del equipo'), 'el ce pe u del equipo')
  assert.equal(tts.cleanForSpeech('ocupado y especial'), 'ocupado y especial')
})

test('resolveModel: grande solo si verifica', () => {
  const wake = require('../src/main/wake')
  const fs = require('fs')
  const path = require('path')
  const empty = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vox-b4-'))
  const r1 = wake.resolveModel(empty)
  assert.equal(r1.kind, 'small')
  assert.equal(r1.dir, null)
  const full = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vox-b4b-'))
  for (const [d, f, sz] of [['am', 'final.mdl', 60], ['graph', 'HCLG.fst', 310], ['conf', 'model.conf', 1]]) {
    fs.mkdirSync(path.join(full, 'vosk-model-es-0.42', d), { recursive: true })
    const fd = fs.openSync(path.join(full, 'vosk-model-es-0.42', d, f), 'w')
    fs.ftruncateSync(fd, sz * 1024 * 1024)
    fs.closeSync(fd)
  }
  const r2 = wake.resolveModel(full)
  assert.equal(r2.kind, 'large')
  assert.ok(r2.dir.endsWith('vosk-model-es-0.42'))
  fs.rmSync(full, { recursive: true, force: true })
})

console.log('\nFIX: avisos no repiten (marcas consistentes)')

test('STAMPS: 5 claves con la caja exacta', () => {
  const life = require('../src/main/life')
  assert.deepEqual(Object.keys(life.STAMPS).sort(), ['lastBatteryWarn', 'lastBreak', 'lastMissed', 'lastMorning', 'lastNight'])
  for (const v of Object.values(life.STAMPS)) assert.ok(/^vox_last[A-Z]/.test(v), v)
})

test('roundtrip guardar→leer por la misma clave', () => {
  const life = require('../src/main/life')
  const store = {}
  life.applyStamps((k, v) => { store[k] = v }, { lastNight: '2026-10-14', lastBreak: 123 })
  assert.equal(store.vox_lastNight, '2026-10-14')
  const back = life.readStamps((k) => store[k])
  assert.equal(back.lastNight, '2026-10-14')
  assert.equal(back.lastBreak, 123)
})

test('segundo tick no repite buenas noches', () => {
  const life = require('../src/main/life')
  const store = {}
  const base = { name: '', mood: 60, daysAway: 0, idleMin: 0, recentCmds: 0, battery: 100, lastSleepState: '', streak: null }
  const t1 = new Date(2026, 9, 14, 23, 30).getTime()
  const a1 = life.evaluate({ ...base, now: t1, hour: 23, ...life.readStamps((k) => store[k]) })
  assert.ok(a1 && a1.id === 'night', JSON.stringify(a1 && a1.id))
  life.applyStamps((k, v) => { store[k] = v }, a1.stamp)
  const a2 = life.evaluate({ ...base, now: t1 + 60000, hour: 23, ...life.readStamps((k) => store[k]) })
  assert.equal(a2, null)
})

test('segundo tick no repite buenos días', () => {
  const life = require('../src/main/life')
  const store = {}
  const base = { name: '', mood: 60, daysAway: 0, idleMin: 0, recentCmds: 0, battery: 100, lastSleepState: '', streak: null }
  const t1 = new Date(2026, 9, 14, 8, 5).getTime()
  const a1 = life.evaluate({ ...base, now: t1, hour: 8, ...life.readStamps((k) => store[k]) })
  assert.ok(a1 && a1.id === 'morning')
  life.applyStamps((k, v) => { store[k] = v }, a1.stamp)
  const a2 = life.evaluate({ ...base, now: t1 + 60000, hour: 8, ...life.readStamps((k) => store[k]) })
  assert.equal(a2, null)
})

console.log('\nFIX2: voces verificadas + dictate con tope + ollama seguro')

await atest('voz trunca se rechaza (aunque >1MB)', async () => {
  const http = require('http')
  const fs = require('fs')
  const path = require('path')
  const voices = require('../src/main/voices')
  const memory = require('../src/main/memory')
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vox-vx-'))
  memory.setUserDataPath(dir)
  const big = Buffer.alloc(3 * 1024 * 1024, 7)
  const srv = http.createServer((req, res) => {
    if (req.url.endsWith('.json')) { res.writeHead(200, { 'Content-Length': 50 }); res.end('{"ok":true}'); return }
    res.writeHead(200, { 'Content-Length': big.length })
    res.end(big.subarray(0, 2 * 1024 * 1024)) // corta a 2MB de 3MB
  })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  try {
    const url = `http://127.0.0.1:${srv.address().port}/v.onnx`
    let err = ''
    try {
      await voices.addCustomVoice('x', url, dir, { allowHost: /127\.0\.0\.1/ })
    } catch (e) { err = e.message }
    assert.ok(/trunco|cortada|incompleto|falló/i.test(err), err)
  } finally { srv.close() }
})

await atest('voz con json inválido se rechaza', async () => {
  const http = require('http')
  const fs = require('fs')
  const path = require('path')
  const voices = require('../src/main/voices')
  const memory = require('../src/main/memory')
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vox-vx2-'))
  memory.setUserDataPath(dir)
  const big = Buffer.alloc(Math.floor(1.2 * 1024 * 1024), 7)
  const srv = http.createServer((req, res) => {
    const bad = Buffer.from('<html>no hay</html>', 'utf8')
    if (req.url.endsWith('.json')) { res.writeHead(200, { 'Content-Length': bad.length }); res.end(bad); return }
    res.writeHead(200, { 'Content-Length': big.length })
    res.end(big)
  })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  try {
    const url = `http://127.0.0.1:${srv.address().port}/v.onnx`
    let err = ''
    try {
      await voices.addCustomVoice('x', url, dir, { allowHost: /127\.0\.0\.1/ })
    } catch (e) { err = e.message }
    assert.ok(/inválida/i.test(err), err)
  } finally { srv.close() }
})

test('dictate: escribe, expira por silencio y por tope duro', () => {
  const dictate = require('../src/main/dictate')
  const st = dictate.create()
  assert.equal(dictate.classify(st, 1000), null)
  dictate.start(st, 1000)
  assert.equal(dictate.classify(st, 2000), 'write')
  dictate.poke(st, 50000) // habla: ventana se extiende
  assert.equal(dictate.classify(st, 50000 + dictate.IDLE_MS - 1000), 'write')
  assert.equal(dictate.classify(st, 50000 + dictate.IDLE_MS + 1000), null)
  // Tope duro aunque hable sin parar (cada poke extiende lo ocioso, no lo duro).
  const st2 = dictate.create()
  dictate.start(st2, 0)
  dictate.poke(st2, dictate.HARD_MS - 2000)
  assert.equal(dictate.classify(st2, dictate.HARD_MS - 1000), 'write')
  dictate.poke(st2, dictate.HARD_MS - 500)
  assert.equal(dictate.classify(st2, dictate.HARD_MS + 1000), 'hard-out')
  dictate.stop(st2)
  assert.equal(dictate.classify(st2, dictate.HARD_MS + 2000), null)
})

test('ollama: solo etiquetas válidas', () => {
  const llm = require('../src/main/llm')
  assert.ok(llm.validOllamaTag('qwen2.5:1.5b'))
  assert.ok(llm.validOllamaTag('llama3.1'))
  assert.ok(llm.validOllamaTag('hf.co/unsloth/model'))
  assert.ok(!llm.validOllamaTag('x; calc'))
  assert.ok(!llm.validOllamaTag('a & b'))
  assert.ok(!llm.validOllamaTag('$(quien)'))
  assert.ok(!llm.validOllamaTag('a`b`'))
  assert.ok(!llm.validOllamaTag('a|b'))
  assert.ok(!llm.validOllamaTag(''))
})

console.log('\nFIX: claves de memoria sin colisión')

test('vox_confirm (voz) y approvals usan claves distintas', () => {
  const fs = require('fs')
  const approvalsSrc = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'main', 'approvals.js'), 'utf8')
  const mainSrc = fs.readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8')
  const kAp = /const K = '([^']+)'/.exec(approvalsSrc)[1]
  assert.ok(/vox_confirm/.test(mainSrc), 'voz usa vox_confirm')
  assert.ok(!/vox_pending/.test(mainSrc), 'main no toca la clave de approvals')
  assert.notEqual(kAp, 'vox_confirm')
})

test('confirmación de voz sobrevive a una aprobación remota', () => {
  const memory = require('../src/main/memory')
  const approvals = require('../src/main/approvals')
  const fs = require('fs')
  const dir = fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'vox-keys-'))
  memory.setUserDataPath(dir)
  memory.set('vox_confirm', { canon: 'apaga el equipo', at: Date.now() })
  approvals.queue('Reiniciar', 'detalle', 'reinicia el equipo')
  assert.deepEqual(memory.get('vox_confirm'), { canon: 'apaga el equipo', at: memory.get('vox_confirm').at })
  assert.equal(approvals.list().length, 1)
  approvals.clear()
  assert.deepEqual(memory.get('vox_confirm').canon, 'apaga el equipo')
})

console.log('\nFIX: sin inyección PowerShell')

// Batería permanente: cada sitio con interpolación recibe texto hostil.
// La forma escapada debe estar presente y cada resto sensible debe ir
// precedido de backtick (sin él, $" ejecuta). Si un patrón futuro interpola
// crudo, cae aquí.
function assertOnlyEscaped(out, escapedForm, rawCore, label) {
  assert.ok(out.includes(escapedForm), `${label}: forma escapada presente`)
  let i = -1
  while ((i = out.indexOf(rawCore, i + 1)) !== -1) {
    assert.equal(out[i - 1], '`', `${label}: resto sin escapar en ${i} (${out.slice(Math.max(0, i - 20), i + 30)})`)
  }
}

test('sanitize desarma comillas, backticks, $ y pipes', () => {
  const fs = require('fs')
  for (const f of ['src/main/commands/system.js', 'src/main/commands/launch.js']) {
    const src = fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8')
    const m = /function sanitize\(str\) \{ return ([^\n]+) \}/.exec(src)
    assert.ok(m, f + ' tiene sanitize')
    for (const ch of ['"', '`', '$']) assert.ok(m[1].includes(ch), `${f} filtra ${ch}`)
  }
})

test('rutas/archivos: hostil queda entre comillas simples', () => {
  const smart = require('../src/main/smart-exec')
  const evil = 'a"$(calc)b'
  const byMatch = (frag) => smart.PATTERNS.find(p => typeof p.run === 'function' && String(p.match).includes(frag))
  const out1 = String(byMatch('directorio').run(['x', undefined, undefined, undefined, evil, undefined, evil]))
  assert.ok(out1.includes(`'${evil}'`), 'lista: ' + out1.slice(0, 100))
  const out2 = String(byMatch('renombra').run(['x', evil, 'y']))
  assert.ok(out2.includes(`'${evil}'`), 'renombra')
  const out3 = String(byMatch('unzip').run(['x', evil, undefined]))
  assert.ok(out3.includes(`'${evil}'`), 'extrae')
  // (Sin assertPsSafe aquí: entre comillas simples el " es literal y seguro.)
})

await atest('doble comilla: hostil neutralizado con backtick', async () => {
  const smart = require('../src/main/smart-exec')
  const byMatch = (frag) => smart.PATTERNS.find(p => typeof p.run === 'function' && String(p.match).includes(frag))
  const evil = 'a"$(calc)b'
  // (descarga usa fetchFile/Node directo, sin shell: sin superficie PS.)
  const out2 = String(byMatch('acceso').run(['x', undefined, evil, 'y']))
  assertOnlyEscaped(out2, smart.escapePs(evil), '$(calc)', 'acceso directo')
})

test('SendKeys y portapapeles: comillas y teclas neutralizadas', () => {
  const smart = require('../src/main/smart-exec')
  const dicta = smart.PATTERNS.find(p => /dicta/.test(String(p.match)) && typeof p.run === 'function')
  const out = String(dicta.run(['dicta 100% "ya"', '100% "ya"']))
  assert.ok(!out.includes('\\"'), 'sin backslash-escape (no existe en PS)')
  assert.ok(out.includes('{%}'), '% va entre llaves')
  const clip = smart.PATTERNS.find(p => /portapapeles/.test(String(p.match)) && String(p.run).includes('Set-Clipboard'))
  const out2 = String(clip.run(['copia x"$(calc) al portapapeles', 'x"$(calc)']))
  assert.ok(out2.includes(`'x"$(calc)'`), 'clipboard entre comillas simples')
})

test('scheduled task: texto con comillas anidado intacto', () => {
  const smart = require('../src/main/smart-exec')
  const pat = smart.PATTERNS.find(p => /New-ScheduledTaskAction/.test(String(p.run)))
  assert.ok(pat, 'existe patrón de recordatorio programado')
  const hostile = `di "hola" y $(calc)`
  const out = String(pat.run(['x', hostile, '5', 'minutos']))
  // Entre comillas simples el $" es literal: basta que salga intacto y único.
  const span = `''${hostile}''`
  assert.ok(out.includes(span), 'span citado intacto')
  assert.ok(!out.split(span).join('').includes('$(calc)'), 'sin resto fuera del citado')
})

console.log('\nFIX: primitivas de escape + gate de apps')

test('escapePs/escapeLike/escapeSendKeys/psStr neutralizan', () => {
  const smart = require('../src/main/smart-exec')
  assert.equal(smart.escapePs('a"$(calc)b`c'), 'a`"`$(calc)b``c')
  assert.equal(smart.psStr(`di 'hola'`), `'di ''hola'''`)
  assert.equal(smart.escapeLike('a"$(calc)b*[x]'), 'a(calc)bx')
  assert.ok(smart.escapeSendKeys('100% "ya" ^c').includes('{%}'))
  assert.ok(!smart.escapeSendKeys('a+b').includes('+') || smart.escapeSendKeys('a+b').includes('{+}'))
})

await atest('app desconocida pide permiso y obedece el no', async () => {
  const launch = require('../src/main/commands/launch')
  let asked = null
  launch.setConfirm(async (title) => { asked = title; return false })
  const r = await launch.execute('abre zzzinexistente123')
  assert.ok(asked && asked.includes('zzzinexistente123'), 'preguntó: ' + asked)
  assert.ok(/Cancelado/.test(r.message))
  launch.setConfirm(null)
})

await atest('buscar con texto hostil no rompe ni ejecuta', async () => {
  const search = require('../src/main/commands/search')
  // escapeLike ya unit-testeado; aquí: resuelve sin colgar ni reventar PS.
  const r = await search.execute('busca en documentos a"$(calc)b-zzz-unico')
  assert.ok(r && typeof r.message === 'string' && r.message.length > 0, JSON.stringify(r))
})

console.log('\nFIX: rendimiento (caché RAM + rotación)')

test('memory: caché respeta escritura externa (mtime)', () => {
  const memory = require('../src/main/memory')
  const fs = require('fs')
  const path = require('path')
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vox-perf-'))
  memory.setUserDataPath(dir)
  memory.set('a', 1)
  assert.equal(memory.get('a'), 1)
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'memory.json'), 'utf8'))
  raw.preferences.a = 2
  fs.writeFileSync(path.join(dir, 'memory.json'), JSON.stringify(raw))
  const t = new Date(Date.now() + 2000)
  fs.utimesSync(path.join(dir, 'memory.json'), t, t) // mtime distinto seguro
  assert.equal(memory.get('a'), 2)
})

test('config: caché con defaults y refresh', () => {
  const config = require('../src/main/config')
  const fs = require('fs')
  const path = require('path')
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vox-perf2-'))
  config.setUserDataPath(dir)
  const c1 = config.load()
  assert.equal(c1.voiceModel, 'small')
  config.save({ ...c1, wakeWord: 'vox' })
  assert.equal(config.load().wakeWord, 'vox')
})

test('logger rota a 1MB (no crece infinito)', () => {
  const logger = require('../src/main/logger')
  const fs = require('fs')
  const path = require('path')
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vox-log-'))
  logger.init(dir)
  const big = 'x'.repeat(20000)
  for (let i = 0; i < 60; i++) logger.info(big)
  const logs = fs.readdirSync(path.join(dir, 'logs')).filter(f => f.endsWith('.log')).sort()
  assert.ok(logs.includes('app.1.log'), logs.join(','))
  let total = 0
  for (const f of logs) total += fs.statSync(path.join(dir, 'logs', f)).size
  assert.ok(total < 4 * 1024 * 1024, 'tope ~3MB, real: ' + total)
})

console.log('\nFIX: UX + launch con permiso')

await atest('descarga real a Descargas con errores honestos', async () => {
  const http = require('http')
  const fs = require('fs')
  const path = require('path')
  const os = require('os')
  const data = Buffer.alloc(50000, 3)
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Length': data.length })
    res.end(data)
  })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  try {
    const smart = require('../src/main/smart-exec')
    const url = `http://127.0.0.1:${srv.address().port}/t.bin`
    const h = smart.route('descarga ' + url)[0]
    assert.ok(h, 'rutea descarga')
    const r = await h.pattern.handler([url, url, undefined])
    assert.ok(String(r && r.message || r).includes('Descargado'), JSON.stringify(r).slice(0, 120))
    const dest = path.join(os.homedir(), 'Downloads', 't.bin')
    assert.ok(fs.readFileSync(dest).equals(data))
    fs.unlinkSync(dest)
    const bad = await h.pattern.handler(['descarga http://127.0.0.1:9/nada', 'http://127.0.0.1:9/nada', undefined])
    assert.ok(bad && bad.success === false && /No pude descargar/.test(bad.message), JSON.stringify(bad).slice(0, 120))
  } finally { srv.close() }
})

test('carpeta con .. no escapa de la base', () => {
  const launch = require('../src/main/commands/launch')
  const path = require('path')
  const docs = path.join(process.env.USERPROFILE || '', 'Documents')
  const r = launch.resolveFolderPath('abre carpeta ..')
  assert.ok(r === docs || r.startsWith(docs + path.sep), r)
})

console.log('\nFIX: corta-loop de followup')

test('isMissResult: preguntas también alimentan el loop', () => {
  const followup = require('../src/main/followup')
  assert.equal(followup.isMissResult({ success: false, message: 'No entendí: "x".' }), true)
  assert.equal(followup.isMissResult({ success: true, message: '¿Quisiste decir "apaga"?' }), true)
  assert.equal(followup.isMissResult({ success: false, message: 'No entendí.' }), true)
  assert.equal(followup.isMissResult({ success: true, message: 'Apagando.' }), false)
  assert.equal(followup.isMissResult({ success: false, message: 'Detenido', stop: true }), false)
  assert.equal(followup.isMissResult({ success: false, message: 'No entendí.' }, true), false)
  assert.equal(followup.isMissResult(null), false)
})

test('trackMiss: 3 fallos enfrían 5 min, un acierto resetea', () => {
  const followup = require('../src/main/followup')
  let s = { n: 0, until: 0 }
  let r = followup.trackMiss(s, 1000, true)
  assert.equal(r.cooled, false)
  r = followup.trackMiss(r.streak, 2000, true)
  assert.equal(r.cooled, false)
  r = followup.trackMiss(r.streak, 3000, true)
  assert.equal(r.cooled, true)
  s = r.streak
  r = followup.trackMiss(s, 4000, true)
  assert.equal(r.cooled, true) // sigue en cooldown
  r = followup.trackMiss(s, 4000 + followup.MISS_COOLDOWN_MS + 1000, true)
  assert.equal(r.cooled, false) // pasó: cuenta de nuevo
  r = followup.trackMiss({ n: 2, until: 0 }, 5000, false)
  assert.deepEqual(r.streak, { n: 0, until: 0 })
  assert.equal(followup.MISS_COOLDOWN_MS, 300000)
})

console.log('\nFIX: remoto con QR fiable')

test('lanIps: WiFi primero, virtuales al final', () => {
  const remote = require('../src/main/remote')
  const ifs = {
    'vEthernet (Docker)': [{ family: 'IPv4', internal: false, address: '172.17.0.1' }],
    'Wi-Fi': [{ family: 'IPv4', internal: false, address: '192.168.1.50' }],
    'VPN-x': [{ family: 'IPv4', internal: false, address: '10.8.0.2' }],
    'Ethernet': [{ family: 'IPv4', internal: false, address: '192.168.1.51' }],
    'Loopback': [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
  }
  const list = remote.lanIps(ifs)
  assert.equal(list[0].ip, '192.168.1.50')
  assert.equal(list[list.length - 1].ip, '10.8.0.2')
  assert.ok(!list.some(x => x.ip === '127.0.0.1'))
  assert.deepEqual(remote.lanIps({}), [])
})

await atest('probe: 401 es alcanzable, puerto cerrado no', async () => {
  const http = require('http')
  const remote = require('../src/main/remote')
  const srv = http.createServer((req, res) => { res.writeHead(401); res.end('{}') })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  try {
    const ok = await remote.probeReachability('127.0.0.1', srv.address().port, 3000)
    assert.equal(ok.reachable, true)
    const bad = await remote.probeReachability('127.0.0.1', 9, 2000)
    assert.equal(bad.reachable, false)
    assert.ok(/firewall|rechazada|inaccesible|WiFi|red/i.test(bad.detail), bad.detail)
  } finally { srv.close() }
})

console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
}

await run6()
}

run()
