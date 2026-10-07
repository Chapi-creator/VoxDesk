// Fase 14a: autonomía — planificar → ejecutar → verificar → corregir.
// Requiere IA (online u Ollama) para planificar; la ejecución reusa el
// pipeline normal (con sus confirms). Puro salvo requires perezosos → testeable.
const MAX_STEPS = 6

function catalog() {
  const { COMMANDS } = require('../shared/constants')
  const smart = require('./smart-exec')
  const groups = smart.getHelp().map(g => `${g.group}: ${g.items.slice(0, 10).join('; ')}`)
  return `COMANDOS: ${Object.values(COMMANDS).join(', ')}.\nCAPACIDADES:\n${groups.join('\n')}`
}

function parsePlan(raw) {
  if (!raw) return null
  const m = String(raw).match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const o = JSON.parse(m[0])
    const steps = Array.isArray(o.steps) ? o.steps : null
    if (!steps || !steps.length) return null
    const clean = steps.slice(0, MAX_STEPS)
      .map(s => ({ action: String((s && s.action) || '').trim() }))
      .filter(s => s.action)
    return clean.length ? clean : null
  } catch {
    return null
  }
}

async function plan(goal, askFn) {
  const prompt = `Eres el planificador de Vox, asistente de Windows. Meta del usuario: "${goal}".\n\n${catalog()}\n\nDevuelve SOLO este JSON, sin texto extra: {"steps": [{"action": "orden en español imperativo"}]}. De 1 a ${MAX_STEPS} pasos, solo con las CAPACIDADES listadas, en orden. Si la meta es imposible con ellas, devuelve {"steps": []}.`
  return parsePlan(await askFn(prompt))
}

async function run(goal, { ask, execStep, confirm }) {
  const steps = await plan(goal, ask)
  if (!steps) {
    return { ok: false, message: 'No pude armar un plan con lo que sé hacer. Reformula la meta o divídela en pasos.' }
  }
  const go = await confirm(steps)
  if (!go) return { ok: true, cancelled: true, message: 'Plan cancelado. Dime cuando quieras.' }
  const done = []
  let pending = [...steps]
  for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
    const failedThisRound = []
    for (const s of pending) {
      let r
      try {
        r = await execStep(s.action)
      } catch (e) {
        r = { success: false, message: 'Error: ' + e.message }
      }
      done.push({ ...s, ok: !!(r && r.success), say: (r && r.message) || '' })
      if (!r || !r.success) {
        failedThisRound.push(s)
        break
      }
    }
    pending = []
    const failed = done.find(d => !d.ok && !d.replanned)
    if (!failed) break
    failed.replanned = true
    // Reintento: pide a la IA una versión corregida de lo que falta
    const rest = done.filter(d => !d.ok).map(d => d.action).join(' | ')
    const fix = await plan(`Reformula en pasos alternativos usando las mismas capacidades: ${rest}`, ask)
    pending = fix || []
  }
  const okCount = done.filter(d => d.ok).length
  const bad = done.filter(d => !d.ok && !d.replanned)
  let message = `Plan listo: ${okCount}/${done.length} pasos.`
  if (bad.length) message += ` Falló: ${bad.map(b => `"${b.action}"`).join(', ')}.`
  else message += ' Todo ejecutado.'
  return { ok: bad.length === 0, message }
}

module.exports = { plan, parsePlan, run, MAX_STEPS }
