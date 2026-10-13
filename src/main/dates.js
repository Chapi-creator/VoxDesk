// Fechas naturales en español: "mañana a las 8", "el lunes", "en 3 días".
// Puro (now inyectable) → testeable.
const DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 }

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function parseHora(t) {
  let m = /a las\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|de la manana|de la tarde|de la noche)?/.exec(t)
    || /\b(\d{1,2})\s*(am|pm)\b/.exec(t)
    || /\b(\d{1,2}):(\d{2})\b/.exec(t)
  let h, min = 0, matched = ''
  if (m) {
    h = parseInt(m[1])
    min = parseInt(m[2] || '0')
    matched = m[0]
    const suf = (m[3] || '').toLowerCase()
    if (suf === 'pm' || suf.includes('tarde') || suf.includes('noche')) { if (h < 12) h += 12 }
    if (suf === 'am' || suf.includes('mañana')) { if (h === 12) h = 0 }
  } else {
    m = /(\d{1,2})\s+y\s+media/.exec(t)
    if (m) { h = parseInt(m[1]); min = 30; matched = m[0] }
  }
  if (h === undefined || h > 23 || min > 59) return null
  return { h, min, matched }
}

function parseDate(text, now) {
  const t = norm(text)
  const base = now instanceof Date ? new Date(now) : new Date()
  const hora = parseHora(t)
  const at = (d, h, min) => { const r = new Date(d); r.setHours(h, min, 0, 0); return r }
  let m
  if (/\bpasado manana\b/.test(t)) {
    const d = new Date(base); d.setDate(d.getDate() + 2)
    const hh = hora || { h: 9, min: 0, matched: '' }
    return { date: at(d, hh.h, hh.min), matched: 'pasado manana ' + hh.matched }
  }
  if (/\bmanana\b/.test(t)) {
    const d = new Date(base); d.setDate(d.getDate() + 1)
    const hh = hora || { h: 9, min: 0, matched: '' }
    return { date: at(d, hh.h, hh.min), matched: 'manana ' + hh.matched }
  }
  if (/\bhoy\b/.test(t) && hora) {
    const d = at(base, hora.h, hora.min)
    if (d > base) return { date: d, matched: 'hoy ' + hora.matched }
    d.setDate(d.getDate() + 1)
    return { date: d, matched: 'hoy ' + hora.matched }
  }
  if ((m = /\ben\s+(\d+)\s+d[ií]as?\b/.exec(t))) {
    const d = new Date(base); d.setDate(d.getDate() + parseInt(m[1]))
    const hh = hora || { h: 9, min: 0, matched: '' }
    return { date: at(d, hh.h, hh.min), matched: m[0] + ' ' + hh.matched }
  }
  if ((m = /\b(el|este)\s+(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/.exec(t))) {
    const want = DIAS[m[2]]
    const hh = hora || { h: 9, min: 0, matched: '' }
    const d = new Date(base)
    let diff = (want - d.getDay() + 7) % 7
    let cand = at(d, hh.h, hh.min)
    cand.setDate(cand.getDate() + diff)
    if (cand <= base) cand.setDate(cand.getDate() + 7)
    return { date: cand, matched: m[0] + ' ' + hh.matched }
  }
  return null
}

function fmtDate(d) {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  return `${dias[d.getDay()]} ${d.getDate()} a las ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

module.exports = { parseDate, parseHora, fmtDate }
