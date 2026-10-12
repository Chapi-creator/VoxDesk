const tts = require('../tts')
const { Notification } = require('electron')
const memory = require('../memory')

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
  try { tts.speak(msg) } catch {}
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
  const dur = parseDuration(text)
  if (!dur || dur.ms < 1000 || dur.ms > 86400000)
    return Promise.resolve({ success: true, message: dur && dur.ms < 1000 ? 'Muy poco tiempo' : dur && dur.ms > 86400000 ? 'Máximo 24 horas' : 'No entendí el tiempo. Di: "alarma en 10 segundos"', speak: true })

  const rep = parseRepeat(text)
  const msg = text.replace(dur.match, '').replace(/recuerda|recuérdame|alarma|temporizador|por|en/gi, '').trim() || 'Tiempo cumplido'
  const timestamp = Date.now() + dur.ms
  const id = memory.saveReminder(msg, timestamp, rep ? rep.ms : 0)
  scheduleById(id, dur.ms)
  return Promise.resolve({
    success: true,
    message: rep ? `Te avisaré "${msg}" en ${dur.amount} ${dur.unit} y luego ${rep.label}.` : `Recordatorio en ${dur.amount} ${dur.unit}: "${msg}"`,
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

module.exports = { execute, loadPending, parseDuration, parseRepeat, fmtRepeat, listTimers }

function listTimers() {
  return memory.listReminders()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(r => ({ message: r.message, timestamp: r.timestamp, repeatMs: r.repeatMs || 0 }))
}
