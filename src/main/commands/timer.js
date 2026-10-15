const tts = require('../tts')
const { Notification } = require('electron')
const memory = require('../memory')

// Voz centralizada (main inyecta sayAloud para que la UI la vea).
let _speakFn = null
function setSpeaker(fn) { _speakFn = fn }
function _say(msg) {
  if (_speakFn) { try { _speakFn(msg) } catch {} return }
  try { tts.speak(msg) } catch {}
}

function parseDuration(text) {
  const m = /(\d+)\s*(segundos?|minutos?|horas?)/i.exec(text)
  if (!m) return null
  const amount = parseInt(m[1])
  const unit = m[2].toLowerCase()
  const ms = (unit.startsWith('seg') ? amount * 1000 : unit.startsWith('min') ? amount * 60000 : amount * 3600000)
  return { ms, amount, unit, match: m[0] }
}

function parseRepeat(text) {
  const lower = String(text || '').toLowerCase()
  let m = /cada\s+(\d+)\s*(segundos?|minutos?|horas?)/i.exec(lower)
  if (m) {
    const n = parseInt(m[1])
    const u = m[2].toLowerCase()
    return { ms: n * (u.startsWith('seg') ? 1000 : u.startsWith('min') ? 60000 : 3600000), label: m[0] }
  }
  if (/cada\s+hora\b/.test(lower)) return { ms: 3600000, label: 'cada hora' }
  if (/cada\s+d[ií]a\b/.test(lower)) return { ms: 86400000, label: 'cada día' }
  if (/cada\s+semana\b/.test(lower)) return { ms: 7 * 86400000, label: 'cada semana' }
  return null
}

function fireText(msg) {
  try { new Notification({ title: 'Recordatorio', body: msg }).show() } catch {}
  _say(msg)
}

// Programa por ID: si lo cancelaron antes de sonar, no suena.
function scheduleById(id, delayMs) {
  setTimeout(() => {
    const r = memory.listReminders().find(x => x.id === id)
    if (!r) return
    memory.removeReminder(id)
    if (r.repeatMs && r.repeatMs > 0) {
      const next = memory.saveReminder(r.message, Date.now() + r.repeatMs, r.repeatMs)
      scheduleById(next, r.repeatMs)
      fireText(r.message)
    } else {
      fireText(r.message)
    }
  }, Math.max(0, delayMs))
}

function fmtRepeat(ms) {
  if (ms % 86400000 === 0) return `cada ${ms / 86400000 === 1 ? 'día' : (ms / 86400000 + ' días')}`
  if (ms % 3600000 === 0) return `cada ${ms / 3600000 === 1 ? 'hora' : (ms / 3600000 + ' horas')}`
  if (ms % 60000 === 0) return `cada ${ms / 60000} minutos`
  return `cada ${Math.round(ms / 1000)} segundos`
}

function execute(text) {
  const lower = String(text || '').toLowerCase().trim()
  if (/^(qu[eé]|cu[aá]les|lista|muestra).*(rutinas?)/.test(lower)) {
    const routines = require('../routines')
    const all = routines.all().slice().sort((a, b) => a.time.localeCompare(b.time))
    if (!all.length) return Promise.resolve({ success: true, message: 'No tienes rutinas. Di: "todos los días a las 8 dime el clima".', speak: true })
    return Promise.resolve({
      success: true,
      message: all.map((r, i) => `${i + 1}. ${r.time}: ${r.action}`).join('. '),
      speak: true,
    })
  }
  let mr = /^(cancela|borra|elimina)(\s+la)?\s+rutina\s+(\d+)$/.exec(lower)
  if (mr) {
    const routines = require('../routines')
    const all = routines.all().slice().sort((a, b) => a.time.localeCompare(b.time))
    const r = all[parseInt(mr[3]) - 1]
    if (!r || !routines.remove(r.id)) return Promise.resolve({ success: false, message: 'No hay esa rutina.', speak: true })
    return Promise.resolve({ success: true, message: `Rutina de las ${r.time} cancelada.`, speak: true })
  }
  if (/^(qu[eé]|cu[aá]les|lista|muestra).*(recordatorios?|alarmas?|eventos?)/.test(lower)) {
    const all = memory.listReminders().sort((a, b) => a.timestamp - b.timestamp)
    if (!all.length) return Promise.resolve({ success: true, message: 'No tienes recordatorios.', speak: true })
    return Promise.resolve({
      success: true,
      message: all.map((r, i) => `${i + 1}. ${r.message}${r.repeatMs ? ` (${fmtRepeat(r.repeatMs)})` : ''}`).join('. '),
      speak: true,
    })
  }
  let m = /^(cancela|borra|elimina)(\s+el)?\s+(recordatorio|alarma|evento)\s+(\d+)$/.exec(lower)
  if (m) {
    const all = memory.listReminders().sort((a, b) => a.timestamp - b.timestamp)
    const r = all[parseInt(m[4]) - 1]
    if (!r) return Promise.resolve({ success: false, message: 'No hay ese recordatorio.', speak: true })
    memory.removeReminder(r.id)
    return Promise.resolve({ success: true, message: `Recordatorio "${r.message}" cancelado.`, speak: true })
  }
  const rep = parseRepeat(text)
  // Rutinas diarias ("todos los días a las 8 dime el clima").
  try {
    const routines = require('../routines')
    const r = routines.parse(text)
    if (r) {
      const id = routines.add(r.time, r.action)
      return Promise.resolve({ success: true, message: `Rutina ${id}: todos los días a las ${r.time}, "${r.action}".`, speak: true })
    }
  } catch {}
  // Fechas naturales ("mañana a las 8") van primero; si no hay, duración.
  try {
    const dates = require('../dates')
    const f = dates.parseDate(text)
    if (f && f.date > new Date()) {
      const fmsg = text.replace(f.matched, '').replace(/recuerda|recuérdame|alarma|temporizador|por|en|el|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|mañana|hoy|pasado|a las/gi, '').trim() || 'Tiempo cumplido'
      const fid = memory.saveReminder(fmsg, f.date.getTime(), rep ? rep.ms : 0)
      scheduleById(fid, f.date.getTime() - Date.now())
      const fwhen = dates.fmtDate(f.date)
      return Promise.resolve({
        success: true,
        message: rep ? `Te avisaré "${fmsg}" ${fwhen} y luego ${rep.label}.` : `Recordatorio ${fwhen}: "${fmsg}"`,
        speak: true,
      })
    }
  } catch {}
  const dur = parseDuration(text)
  if (!dur || dur.ms < 1000 || dur.ms > 86400000)
    return Promise.resolve({ success: true, message: dur && dur.ms < 1000 ? 'Muy poco tiempo' : dur && dur.ms > 86400000 ? 'Máximo 24 horas' : 'No entendí el tiempo. Di: "alarma en 10 segundos"', speak: true })

  let msg = text.replace(dur.match, '').replace(/recuerda|recuérdame|alarma|temporizador|por|en/gi, '').trim() || 'Tiempo cumplido'
  let timestamp = Date.now() + dur.ms
  let when = `en ${dur.amount} ${dur.unit}`
  const id = memory.saveReminder(msg, timestamp, rep ? rep.ms : 0)
  scheduleById(id, timestamp - Date.now())
  return Promise.resolve({
    success: true,
    message: rep ? `Te avisaré "${msg}" ${when} y luego ${rep.label}.` : `Recordatorio ${when}: "${msg}"`,
    speak: true,
  })
}

function loadPending() {
  for (const r of memory.listReminders()) {
    const remaining = r.timestamp - Date.now()
    if (remaining <= 0) {
      memory.removeReminder(r.id)
      if (r.repeatMs && r.repeatMs > 0) {
        const id = memory.saveReminder(r.message, Date.now() + r.repeatMs, r.repeatMs)
        scheduleById(id, r.repeatMs)
        fireText(`Te lo perdiste: ${r.message} (sigo ${fmtRepeat(r.repeatMs)})`)
      } else {
        fireText(`Te lo perdiste: ${r.message}`)
      }
    } else {
      scheduleById(r.id, remaining)
    }
  }
}

module.exports = { execute, loadPending, parseDuration, parseRepeat, fmtRepeat, listTimers, setSpeaker }

function listTimers() {
  return memory.listReminders()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(r => ({ message: r.message, timestamp: r.timestamp, repeatMs: r.repeatMs || 0 }))
}
