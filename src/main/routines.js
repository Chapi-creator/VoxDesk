// Rutinas diarias: "todos los días a las 8 dime el clima".
// Store en memory (vox_routines). Puro salvo memoria → testeable.
const memory = require('./memory')

const K = 'vox_routines'

function all() {
  const v = memory.get(K)
  return Array.isArray(v) ? v : []
}

function saveAll(list) {
  memory.set(K, list)
}

// "todos los días a las 8 dime el clima" -> {time:'08:00', action:'dime el clima'}
function parse(text) {
  const t = String(text || '')
  const m = /^(recu[eé]rdame|recuerda|haz)?\s*(todos los d[ií]as|cada d[ií]a|diariamente)\s*(.*)$/i.exec(t.trim())
  if (!m) return null
  const rest = (m[3] || '').trim()
  const norm = rest.toLowerCase().normalize('NFD').replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '')
  const hm = /a las\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|de la manana|de la tarde|de la noche)?/.exec(norm)
    || /\b(\d{1,2}):(\d{2})\b/.exec(norm)
    || /\b(\d{1,2})\s*(am|pm)\b/.exec(norm)
  if (!hm) return null
  let h = parseInt(hm[1])
  let min = parseInt(hm[2] || '0')
  if (isNaN(min)) min = 0
  const suf = [hm[2], hm[3]].map(x => String(x || '').toLowerCase()).find(x => /[a-z]/.test(x)) || ''
  if (suf === 'pm' || suf.includes('tarde') || suf.includes('noche')) { if (h < 12) h += 12 }
  if (suf === 'am' || suf.includes('manana')) { if (h === 12) h = 0 }
  if (h > 23 || min > 59) return null
  const action = rest.replace(hm[0], '').replace(/^(a las\s+)?/i, '').trim()
    .replace(/^(que|de que)\s+/i, '').trim()
  if (!action) return null
  return {
    time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
    action,
  }
}

function add(time, action) {
  const list = all()
  const id = list.length ? Math.max(...list.map(r => r.id)) + 1 : 1
  list.push({ id, time, action, lastRun: '' })
  saveAll(list)
  return id
}

function remove(id) {
  const list = all()
  const i = list.findIndex(r => r.id === Number(id))
  if (i < 0) return false
  list.splice(i, 1)
  saveAll(list)
  return true
}

function todayStr(d) {
  const x = d instanceof Date ? d : new Date()
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

// Rutinas cuya hora ya pasó hoy y no corrieron. Puro.
function dueRoutines(list, now) {
  const n = now instanceof Date ? now : new Date()
  const today = todayStr(n)
  const hm = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
  return (list || []).filter(r => r.time <= hm && r.lastRun !== today)
}

function markRun(id, now) {
  const list = all()
  const r = list.find(x => x.id === Number(id))
  if (!r) return
  r.lastRun = todayStr(now)
  saveAll(list)
}

module.exports = { parse, add, remove, all, dueRoutines, markRun, todayStr }
