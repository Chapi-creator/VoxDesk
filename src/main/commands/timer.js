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

function schedule(msg, delayMs) {
  setTimeout(() => {
    new Notification({ title: 'Recordatorio', body: msg }).show()
    tts.speak(msg)
  }, delayMs)
}

function execute(text) {
  const dur = parseDuration(text)
  if (!dur || dur.ms < 1000 || dur.ms > 86400000)
    return Promise.resolve({ success: true, message: dur && dur.ms < 1000 ? 'Muy poco tiempo' : dur && dur.ms > 86400000 ? 'Máximo 24 horas' : 'No entendí el tiempo. Di: "alarma en 10 segundos"', speak: true })

  const msg = text.replace(dur.match, '').replace(/recuerda|recuérdame|alarma|temporizador|por|en/gi, '').trim() || 'Tiempo cumplido'
  const timestamp = Date.now() + dur.ms
  memory.saveReminder(msg, timestamp)
  schedule(msg, dur.ms)
  return Promise.resolve({ success: true, message: `Recordatorio en ${dur.amount} ${dur.unit}: "${msg}"`, speak: true })
}

function loadPending() {
  for (const r of memory.listReminders()) {
    const remaining = r.timestamp - Date.now()
    if (remaining <= 0) {
      memory.removeReminder(r.id)
    } else {
      schedule(r.message, remaining)
    }
  }
}

module.exports = { execute, loadPending, parseDuration }
