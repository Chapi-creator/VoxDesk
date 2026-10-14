// C3: banco semántico permanente. Sin modelo descargado → SKIP honesto (exit 0).
// Con modelo: 0 falsos-auto, sanity intacta, paráfrasis resueltas >= 28/40.
const assert = require('assert')
const path = require('path')
const os = require('os')

process.chdir(path.join(__dirname, '..'))
const sem = require('../src/main/semroute')
const smart = require('../src/main/smart-exec')
const understand = require('../src/main/understand')

const MODELS = path.join(os.homedir(), 'AppData', 'Roaming', 'ai-desktop-assistant', 'models')

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  V ${name}`) }
  catch (e) { failed++; console.log(`  ? ${name}: ${(e && e.stack) || e}`) }
}

async function run() {
  console.log('\nbanco semántico (C3)')
  if (sem.status(MODELS).available !== true) {
    console.log('  SKIP: sin modelo semántico descargado')
    console.log('\n0 tests, 0 passed, 0 failed (skip)\n')
    process.exit(0)
  }
  const bank = require('./semantic-bank.json')
  const pats = smart.getPatternExamples()
  const tables = understand.INTENTS.map(i => ({ canon: i.canon, ex: i.ex }))
  for (const p of pats) tables.push({ canon: p.canon, ex: p.ex })
  const flat = []
  const groups = tables.map((t) => {
    const vecIdx = t.ex.map((ex) => { flat.push(ex); return flat.length - 1 })
    return { canon: t.canon, vecIdx }
  })
  const queries = []
  const sanity = []
  for (const p of pats) for (const ex of p.ex) { sanity.push({ text: ex, canon: p.canon }); queries.push(ex) }
  for (const p of bank.paraphrases) queries.push(p.text)
  for (const n of bank.negatives) queries.push(n)
  const uniqQ = [...new Set(queries)]
  const candVecs = await sem.candidateVecs(MODELS, flat)
  const qVecs = await sem.embed(MODELS, uniqQ)
  const qi = Object.fromEntries(uniqQ.map((t, i) => [t, i]))
  const XTRA = pats.map(e => ({ id: 'pat', canon: e.canon, ex: e.ex }))

  // Espejo de main.js: fuzzy manda; sem promociona por consenso o pregunta.
  function decide(text) {
    const fz = understand.route(text, XTRA)
    const sb = sem.bestGroup(qVecs[qi[text]], candVecs, groups)
    if (fz && fz.conf >= understand.HI) return { verdict: 'auto', canon: fz.canon }
    if (fz && fz.conf >= understand.MID && sb.canon === fz.canon && sb.sim >= sem.SEM_AGREE) {
      return { verdict: 'auto', canon: fz.canon }
    }
    if (fz && fz.conf >= understand.MID) return { verdict: 'ask', canon: fz.canon }
    if (sb.sim >= sem.SEM_ASK) return { verdict: 'ask', canon: sb.canon }
    return { verdict: 'miss', canon: sb.canon, sim: sb.sim }
  }

  await test('sanity: los 86 ejemplos siguen auto-ejecutando', async () => {
    const bad = []
    for (const s of sanity) {
      const d = decide(s.text)
      if (d.verdict !== 'auto') bad.push(`${s.text} -> ${d.verdict}`)
    }
    assert.deepEqual(bad, [])
  })

  await test('cero falsos-auto en paráfrasis y negativas', async () => {
    const bad = []
    for (const p of bank.paraphrases) {
      const d = decide(p.text)
      if (d.verdict === 'auto' && d.canon !== p.canon) bad.push(`${p.text} -> ${d.canon}`)
    }
    for (const n of bank.negatives) {
      const d = decide(n)
      if (d.verdict === 'auto') bad.push(`NEG ${n} -> ${d.canon}`)
    }
    assert.deepEqual(bad, [])
  })

  await test('paráfrasis resueltas >= 28/40', async () => {
    let ok = 0
    for (const p of bank.paraphrases) {
      const d = decide(p.text)
      if ((d.verdict === 'auto' || d.verdict === 'ask') && d.canon === p.canon) ok++
    }
    assert.ok(ok >= 28, `resueltas ${ok}/40`)
  })

  sem.stop()
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

run().catch((e) => { console.error(e); process.exit(1) })
