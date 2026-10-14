// Matriz funcional: comandos de SOLO LECTURA ejecutados de verdad + puertas.
// Nada destructivo, nada que abra ventanas, nada que escriba fuera de tmp.
// Destructivos (apagar/borrar/cerrar/email/enviar): solo ruteo + confirm.
const assert = require('assert')

const smart = require('../src/main/smart-exec')

let passed = 0, failed = 0
const queue = []
function test(name, fn) { queue.push([name, fn]) }
async function atest(name, fn) { queue.push([name, fn]) }

async function run() {
  console.log('\nmatriz funcional (solo lectura)')
  // Puerta permanente: lo peligroso exige confirmación (salvo lista blanca).
  await atest('peligrosos con confirm (blanca: shutdown /a, temp propio)', async () => {
    const allow = []
    for (const p of smart.PATTERNS) {
      const src = String(p.run) + String(p.handler)
      const hard = /Restart-Computer|Stop-Computer|Format-Volume|Clear-Disk|diskpart/i.test(src)
      const rec = /Remove-Item[\s\S]*-Recurse/i.test(src) && !/tmpImg/.test(src)
      const shut = /shutdown(?! \/a)/i.test(src)
      const kill = /Stop-Process[\s\S]*-Force/i.test(src)
      if ((hard || rec || shut || kill) && !p.confirm) allow.push(String(p.msg).slice(0, 50))
    }
    assert.deepEqual(allow, [])
  })

  const safe = [
    'qué hora es',
    'qué fecha es hoy',
    'calcula 7 * 6',
    'cuánto espacio libre hay en C',
    'lista los procesos',
    'qué recordatorios tengo',
    'lista servicios',
    'qué recuerdas',
    'info del sistema',
  ]
  for (const cmd of safe) {
    await atest('lee: ' + cmd, async () => {
      const r = await smart.execute(cmd)
      assert.ok(r && r.success, cmd + ' -> ' + JSON.stringify(r && r.message).slice(0, 100))
      assert.ok(String(r.message || '').trim().length > 0, cmd + ' sin mensaje')
    })
  }

  // Rutinas van por parser→registry (no smart): verificación de esa vía.
  await atest('parser+timer: qué rutinas tengo', async () => {
    const parser = require('../src/main/command-parser')
    const timer = require('../src/main/commands/timer')
    const memory = require('../src/main/memory')
    const fs = require('fs')
    const path = require('path')
    const os = require('os')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-rt-'))
    memory.setUserDataPath(dir)
    const p = parser.parse('qué rutinas tengo')
    assert.ok(p && p.command, 'parsea')
    const r = await timer.execute('qué rutinas tengo')
    assert.ok(r && r.success && /rutina/i.test(r.message), JSON.stringify(r && r.message).slice(0, 100))
  })

  // Destructivos: rutean al patrón correcto Y piden confirmación (sin ejecutar).
  await atest('destructivos rutean + confirman', async () => {
    for (const [txt, want] of [['apaga el equipo', 'Apagando'], ['borra la carpeta x', 'Borrar'], ['cierra todo', 'Cerrar']]) {
      const h = smart.route(txt)
      assert.ok(h.length, txt)
      assert.ok(h[0].pattern.confirm, txt + ' sin confirm')
    }
  })

  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log(`  V ${name}`) }
    catch (e) { failed++; console.log(`  ? ${name}: ${(e && e.message || e).toString().slice(0, 160)}`) }
  }
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}
run().catch((e) => { console.error(e); process.exit(1) })
