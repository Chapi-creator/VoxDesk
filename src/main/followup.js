// B1: continuaciones ("a las 8", "y en Madrid") y sí/no sobre lo preguntado.
// Puro (sin requires) → testeable. main.js hace el IO de memoria.
const PENDING_TTL = 90 * 1000

function norm1(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
}

const YES = /^(si|claro|dale|vale|ok|okay|correcto|exacto|eso|asi es|por supuesto|por favor|simona?)$/
const NO = /^(no|nel|ni madres|para|para nada|cancelado?|cancelalo|olvidalo|mejor no|tampoco)$/

function isYes(t) { return YES.test(norm1(t)) }
function isNo(t) { return NO.test(norm1(t)) }

// pending: {canon, at}. → {do:'run',command} | {do:'cancel'} | {do:'expired'} | null
function checkPending(text, pending, now) {
  if (!pending || !pending.canon) return null
  if ((now || Date.now()) - (pending.at || 0) > PENDING_TTL) return { do: 'expired' }
  if (isYes(text)) return { do: 'run', command: pending.canon }
  if (isNo(text)) return { do: 'cancel' }
  return null
}

// Lo último ejecutado (texto crudo) + frase corta → orden completa o null.
const ALARM_LIKE = /^(pon\s+(una\s+)?)?(alarma|temporizador|timer|recu[eé]rdam[eé]|av[ií]sam[eé])\b/i
const TIME_IN_LAST = /(a las\s+\d[^,;]*|en\s+\d+\s+(segundos?|minutos?|horas?)|mañ?ana(\s+a las\s+[^,;]*)?)/i
// Solo-hora: "a las 8", "en 10 minutos", "mañana", "cámbiala a las 9".
const TIME_ONLY = /^(a las\s+.+|en\s+\d+\s+(segundos?|minutos?|horas?)|manana(\s+a las\s+.+)?|hoy\s+a las\s+.+)$/i
const RETIME = /^(c[aá]mbia(la|lo|le)?|mejor|cambial[oa])\s+((?:a|para)\s+.+)$/i

function resolveFollowup(text, lastText) {
  const t = String(text || '').trim()
  const last = String(lastText || '').trim()
  if (!t || !last) return null
  // Clima: "y en Madrid" sobre "clima".
  if (/^clima\b/i.test(last)) {
    const m = /^(y\s+)?en\s+(.+)$/i.exec(t)
    if (m && m[2].trim()) return `clima en ${m[2].trim()}`
    return null
  }
  // Alarmas: hora nueva o re-hora sobre la última.
  if (ALARM_LIKE.test(last)) {
    const r = RETIME.exec(t)
    const nt = norm1(t)
    const newTime = r ? r[3].trim() : (TIME_ONLY.test(nt) ? t : null)
    if (!newTime) return null
    if (TIME_IN_LAST.test(last)) return last.replace(TIME_IN_LAST, newTime)
    return `${last} ${newTime}`
  }
  return null
}

// Corta-loop: 3 "no entendí" seguidos por voz suspenden el follow-up 5 min
// (la palabra clave sigue funcionando). Puro → testeable.
const MISS_MAX = 3
const MISS_COOLDOWN_MS = 5 * 60000

// streak:{n, until} + now + {miss:bool} → {streak, cooled}
function trackMiss(streak, now, miss) {
  const s = { n: (streak && streak.n) || 0, until: (streak && streak.until) || 0 }
  if (!miss) return { streak: { n: 0, until: 0 }, cooled: false }
  if (now < s.until) return { streak: s, cooled: true }
  s.n++
  if (s.n >= MISS_MAX) return { streak: { n: 0, until: now + MISS_COOLDOWN_MS }, cooled: true }
  return { streak: s, cooled: false }
}

module.exports = { isYes, isNo, checkPending, resolveFollowup, PENDING_TTL, trackMiss, MISS_COOLDOWN_MS }
