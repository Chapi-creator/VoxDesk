// Cola de acciones remotas pendientes de aprobar en el PC.
// Lo delicado a distancia no se ejecuta: se encola. Puro sobre memory.
const memory = require('./memory')

const K = 'vox_pending'
const MAX = 20

function list() {
  const v = memory.get(K)
  return Array.isArray(v) ? v : []
}

function queue(title, detail, transcript) {
  const all = list()
  const id = Date.now()
  all.push({ id, title: String(title || 'Acción'), detail: String(detail || '').slice(0, 500), transcript: String(transcript || ''), at: id })
  while (all.length > MAX) all.shift()
  memory.set(K, all)
  return id
}

function decide(id, ok) {
  const all = list()
  const i = all.findIndex(x => x.id === Number(id))
  if (i < 0) return null
  const [item] = all.splice(i, 1)
  memory.set(K, all)
  return ok ? item : null
}

function clear() {
  memory.set(K, [])
}

module.exports = { list, queue, decide, clear }
