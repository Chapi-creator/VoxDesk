// Ánimo y memoria social de Vox. Todo vive en memory.json (preferences).
// Sin dependencias salvo memory → testeable.
const memory = require('./memory')

const K_MOOD = 'vox_mood'
const K_NAME = 'vox_name'
const K_SEEN = 'vox_last_seen'
const K_STREAK = 'vox_streak'
const K_CMDS = 'vox_cmd_times'

function getMood() {
  const v = memory.get(K_MOOD)
  return typeof v === 'number' ? Math.min(100, Math.max(0, v)) : 60
}

function addMood(n) {
  memory.set(K_MOOD, getMood() + n)
  return getMood()
}

function getName() { return memory.get(K_NAME) || '' }
function setName(n) { memory.set(K_NAME, String(n || '').trim().slice(0, 30)) }

function touchSeen() { memory.set(K_SEEN, Date.now()) }
function daysSinceSeen() {
  const t = memory.get(K_SEEN)
  if (!t) return 99
  return Math.floor((Date.now() - t) / 86400000)
}

// Racha diaria de comandos con éxito. Devuelve la racha actual.
function bumpStreak() {
  const today = new Date().toISOString().slice(0, 10)
  const s = memory.get(K_STREAK) || {}
  if (s.day !== today) { s.day = today; s.n = 0; s.done = false }
  s.n++
  memory.set(K_STREAK, s)
  return s
}

function markStreakDone() {
  const s = memory.get(K_STREAK) || {}
  s.done = true
  memory.set(K_STREAK, s)
}

// Timestamps de comandos (máx 20) para detectar uso continuo.
function pushCmdTime() {
  const arr = (memory.get(K_CMDS) || []).filter(t => Date.now() - t < 3 * 3600000)
  arr.push(Date.now())
  memory.set(K_CMDS, arr.slice(-20))
  return arr
}

function recentCount(ms) {
  const arr = memory.get(K_CMDS) || []
  return arr.filter(t => Date.now() - t < (ms || 90 * 60000)).length
}

module.exports = { getMood, addMood, getName, setName, touchSeen, daysSinceSeen, bumpStreak, markStreakDone, pushCmdTime, recentCount }
