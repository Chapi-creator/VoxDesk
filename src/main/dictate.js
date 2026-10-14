// Máquina de estado del modo dictado. Pura (reloj inyectable) → testeable.
// main.js pone los textos/acciones; aquí solo la lógica de ventanas.
const IDLE_MS = 2 * 60000
const HARD_MS = 10 * 60000

function create(now) {
  return { until: 0, hard: 0 }
}

function start(st, now) {
  st.until = now + IDLE_MS
  st.hard = now + HARD_MS
}

function stop(st) {
  st.until = 0
  st.hard = 0
}

// → 'write' | 'idle-out' | 'hard-out' | null (fuera de dictado)
function classify(st, now) {
  if (!st.until || now >= st.until) return null
  if (st.hard && now > st.hard) return 'hard-out'
  return 'write'
}

function poke(st, now) {
  st.until = now + IDLE_MS
}

module.exports = { create, start, stop, classify, poke, IDLE_MS, HARD_MS }
