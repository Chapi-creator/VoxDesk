// Dev: simula el pipeline real (fuzzy + consenso semántico) contra el banco.
// Uso: node scripts/sem-bank.js   (requiere modelo en %APPDATA%/ai-desktop-assistant/models)
const path = require('path')
const os = require('os')

process.chdir(path.join(__dirname, '..'))
const sem = require('../src/main/semroute')
const smart = require('../src/main/smart-exec')
const understand = require('../src/main/understand')

const MODELS = path.join(os.homedir(), 'AppData', 'Roaming', 'ai-desktop-assistant', 'models')
// Reglas de decisión = las de main.js (fuente única: semroute).
const SEM_AGREE = sem.SEM_AGREE
const SEM_ASK = sem.SEM_ASK

async function main() {
  const st = sem.status(MODELS)
  if (!st.available) {
    console.log('SKIP: sin modelo semántico en', MODELS)
    process.exit(0)
  }
  const bank = require('../tests/semantic-bank.json')
  const pats = smart.getPatternExamples()
  const byCanon = new Map(pats.map(p => [p.canon, p]))
  for (const p of bank.paraphrases) {
    if (!byCanon.has(p.canon)) throw new Error('canon del banco no existe: ' + p.canon)
  }
  // Candidatos con paridad fuzzy: INTENTS + ejemplos smart.
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
  console.log(`embeddings: ${flat.length} candidatos + ${uniqQ.length} queries…`)
  const t0 = Date.now()
  const candVecs = await sem.candidateVecs(MODELS, flat)
  const qVecs = await sem.embed(MODELS, uniqQ)
  console.log(`  ${Date.now() - t0} ms`)
  const qi = Object.fromEntries(uniqQ.map((t, i) => [t, i]))
  const XTRA = pats.map(e => ({ id: 'pat', canon: e.canon, ex: e.ex }))

  // Decide como main.js. Devuelve {verdict:'auto'|'ask'|'miss', canon}
  function decide(text) {
    const fz = understand.route(text, XTRA)
    const q = qVecs[qi[text]]
    const sb = sem.bestGroup(q, candVecs, groups)
    if (fz && fz.conf >= understand.HI) return { verdict: 'auto', canon: fz.canon, via: 'fuzzy' }
    if (fz && fz.conf >= understand.MID && sb.canon === fz.canon && sb.sim >= SEM_AGREE) {
      return { verdict: 'auto', canon: fz.canon, via: 'consenso' }
    }
    if (fz && fz.conf >= understand.MID) return { verdict: 'ask', canon: fz.canon, via: 'fuzzy' }
    if (sb.sim >= SEM_ASK) return { verdict: 'ask', canon: sb.canon, via: 'sem' }
    return { verdict: 'miss', canon: sb.canon, sim: sb.sim }
  }

  let sAuto = 0, pAuto = 0, pAsk = 0, pMiss = 0, falseAuto = 0, nAsk = 0
  const bad = []
  for (const s of sanity) {
    const d = decide(s.text)
    if (d.verdict === 'auto' && d.canon === s.canon) sAuto++
    else { bad.push(`SANITY ${d.verdict} "${s.text}" -> ${d.canon} (${d.via})`); if (d.verdict === 'auto') falseAuto++ }
  }
  for (const p of bank.paraphrases) {
    const d = decide(p.text)
    if (d.verdict === 'auto' && d.canon === p.canon) pAuto++
    else if (d.verdict === 'auto') { falseAuto++; bad.push(`FALSO-AUTO "${p.text}" -> ${d.canon} (${d.via})`) }
    else if (d.verdict === 'ask' && d.canon === p.canon) pAsk++
    else if (d.verdict === 'ask') bad.push(`ASK-MAL "${p.text}" -> ${d.canon} (${d.via})`)
    else { pMiss++; bad.push(`MISS "${p.text}" (mejor ${d.canon} ${Number(d.sim || 0).toFixed(2)})`) }
  }
  for (const n of bank.negatives) {
    const d = decide(n)
    if (d.verdict === 'auto') { falseAuto++; bad.push(`FALSO-AUTO-NEG "${n}" -> ${d.canon}`) }
    else if (d.verdict === 'ask') nAsk++
  }
  console.log(`\nsanity auto-ok: ${sAuto}/${sanity.length}`)
  console.log(`paráfrasis: auto-ok ${pAuto}, pregunta-ok ${pAsk}, perdidas ${pMiss} / ${bank.paraphrases.length}`)
  console.log(`negativas: preguntadas ${nAsk}/${bank.negatives.length}`)
  console.log(`FALSOS-AUTO (crítico): ${falseAuto}`)
  if (bad.length) console.log('\nDETALLE:\n' + bad.join('\n'))
  sem.stop()
}

main().catch((e) => { console.error(e); process.exit(1) })
