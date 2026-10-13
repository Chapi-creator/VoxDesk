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

// Estadísticas privadas de uso (para "tu uso" en la guía).
function trackStats(transcript, ok) {
  try {
    const st = memory.get('vox_stats') || { total: 0, ok: 0, cmds: {} }
    st.total++
    if (ok) st.ok++
    const k = String(transcript || '').toLowerCase().trim().slice(0, 40)
    if (k) {
      st.cmds[k] = (st.cmds[k] || 0) + 1
      const keys = Object.keys(st.cmds)
      if (keys.length > 50) {
        let minK = keys[0]
        for (const kk of keys) if (st.cmds[kk] < st.cmds[minK]) minK = kk
        delete st.cmds[minK]
      }
    }
    memory.set('vox_stats', st)
    return st
  } catch { return null }
}

function statsSummary() {
  const st = memory.get('vox_stats') || { total: 0, ok: 0, cmds: {} }
  const top = Object.entries(st.cmds || {}).sort((a, b) => b[1] - a[1]).slice(0, 5)
  return { total: st.total || 0, okRate: st.total ? Math.round((st.ok || 0) / st.total * 100) : 100, top }
}

module.exports = { getMood, addMood, getName, setName, touchSeen, daysSinceSeen, bumpStreak, markStreakDone, pushCmdTime, recentCount, trackStats, statsSummary }
