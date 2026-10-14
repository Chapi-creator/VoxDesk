// Fase 13: entender aunque la frase varíe. Normaliza + fuzzy contra ejemplos.
// Puro → testeable. Sin dependencias.
const SYNONYMS = {
  compu: 'equipo', computadora: 'equipo', computador: 'equipo', pc: 'equipo', ordenador: 'equipo',
  maquina: 'equipo', aparato: 'equipo', laptop: 'equipo', portatil: 'equipo',
  musica: 'musica', cancion: 'cancion', rola: 'cancion',
  screenshot: 'captura', pantallazo: 'captura', foto: 'captura',
  apagate: 'apaga', prendete: 'enciende',
  ordena: 'organiza', limpia: 'limpia', prende: 'enciende',
}

// intent -> ejemplos de verbo (minúsculas, sin tildes) + frase canónica
const INTENTS = [
  { id: 'apaga', ex: ['apaga el equipo', 'apaga la compu', 'apaga la pc', 'apagar equipo', 'apaga todo'], canon: 'apaga el equipo' },
  { id: 'reinicia', ex: ['reinicia el equipo', 'reinicia la compu', 'reiniciar pc', 'reinicia todo'], canon: 'reinicia el equipo' },
  { id: 'suspende', ex: ['suspende el equipo', 'duerme la compu', 'pon en suspension', 'suspender'], canon: 'suspende el equipo' },
  { id: 'bloquea', ex: ['bloquea el equipo', 'bloquea la pantalla', 'bloquear sesion'], canon: 'bloquea el equipo' },
  { id: 'sesion', ex: ['cierra sesion', 'cerrar sesion', 'salir', 'logoff'], canon: 'cierra sesión' },
  { id: 'volumen-subir', ex: ['sube el volumen', 'sube volumen', 'mas volumen', 'volumen mas alto'], canon: 'sube el volumen' },
  { id: 'volumen-bajar', ex: ['baja el volumen', 'baja volumen', 'menos volumen', 'volumen mas bajo'], canon: 'baja el volumen' },
  { id: 'silencio', ex: ['silencio', 'silencia todo', 'mute', 'callate', 'calla'], canon: 'silencio' },
  { id: 'hora', ex: ['que hora es', 'dime la hora', 'hora actual', 'que horas son'], canon: 'qué hora es' },
  { id: 'fecha', ex: ['que fecha es', 'que dia es hoy', 'dime la fecha', 'fecha de hoy'], canon: 'qué fecha es' },
  { id: 'clima', ex: ['clima', 'como esta el clima', 'va a llover', 'temperatura'], canon: 'clima' },
  { id: 'traduce', ex: ['como se dice', 'como se traduce', 'traduce esto'], canon: 'traduce' },
  { id: 'alarma', ex: ['alarma en', 'temporizador de', 'avisame en', 'recuerdame en', 'pon alarma'], canon: 'alarma en' },
  { id: 'captura', ex: ['captura la pantalla', 'toma captura', 'pantallazo', 'captura pantalla'], canon: 'captura la pantalla' },
  { id: 'ayuda', ex: ['ayuda', 'que sabes hacer', 'que puedes hacer', 'comandos', 'help'], canon: 'ayuda' },
  { id: 'bateria', ex: ['bateria', 'cuanta bateria', 'nivel de bateria', 'pila'], canon: 'batería' },
  { id: 'sistemas', ex: ['sistemas', 'estado de sistemas', 'reporte del sistema', 'como esta el equipo'], canon: 'sistemas' },
  { id: 'chiste', ex: ['cuentame un chiste', 'dime un chiste', 'chiste', 'hazme reir'], canon: 'cuéntame un chiste' },
  { id: 'papelera', ex: ['vacia la papelera', 'limpia la papelera', 'vaciar papelera'], canon: 'vacía la papelera' },
]

function normalize(s) {
  let t = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  t = t.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  return t.split(' ').map(w => SYNONYMS[w] || w).join(' ')
}

function lev(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

function sim(a, b) {
  const m = Math.max(a.length, b.length)
  return m ? 1 - lev(a, b) / m : 0
}

// Compara el inicio del texto (tantas palabras como el ejemplo) → [{id, conf, args, canon}]
// distintos por canon, ordenados. route() es el top-1 (comportamiento intacto).
function routeTop(text, extra = [], n = 3) {
  const norm = normalize(text)
  if (!norm) return []
  const words = norm.split(' ')
  const tables = INTENTS.map(i => ({ id: i.id, canon: i.canon, ex: i.ex }))
  for (const e of extra) {
    if (e && Array.isArray(e.ex) && e.ex.length) {
      tables.push({ id: e.id || 'pat', canon: e.canon || e.ex[0], ex: e.ex })
    }
  }
  const cands = []
  for (const intent of tables) {
    let bestConf = 0, bestArgs = ''
    for (const rawEx of intent.ex) {
      const ex = normalize(rawEx)
      const k = ex.split(' ').length
      const head = words.slice(0, k).join(' ')
      const c = sim(head, ex)
      if (c > bestConf) { bestConf = c; bestArgs = words.slice(k).join(' ') }
    }
    if (bestConf > 0) cands.push({ id: intent.id, conf: bestConf, args: bestArgs, canon: intent.canon })
  }
  cands.sort((a, b) => b.conf - a.conf)
  const seen = new Set()
  const out = []
  for (const c of cands) {
    if (seen.has(c.canon)) continue
    seen.add(c.canon)
    out.push(c)
    if (out.length >= (n || 3)) break
  }
  return out
}

function route(text, extra = []) {
  const top = routeTop(text, extra, 1)[0]
  return top && top.conf > 0 ? top : null
}

// ¿Merece preguntar a la IA? La basura ("ah", "mi", "h") jamás va a Gemini:
// antes parloteaba con cualquier resto. Solo peticiones reales. Puro.
const ASK2 = /^(que|cual|cuales|cuando|donde|como|porque|por que|cuanto|cuanta|dime|explica|explicitame|cuentame|resume|traduce|analiza|opinas|quien|hay|es|son|puedes|sabes|tienes|hace|paso|pasa|significa)/
function worthAsking(text) {
  const t = normalize(text)
  if (!t) return false
  const n = t.split(' ').length
  if (n >= 3) return true
  if (n === 2) return ASK2.test(t)
  return false
}

// Meta-órdenes que operan sobre lo anterior (no se guardan ni cachean).
function isMeta(text) {
  const t = String(text || '')
  return /^(rep[ií]telo|repite eso|otra vez|de nuevo)$/i.test(t)
    || /^(analiza|explica|explícame|explicitame|resume|traduce)\s+(eso|esto|lo anterior|lo)$/i.test(t)
    || /^(analiza|explica|resume|explícame|explicitame)$/i.test(t)
    || /^(y\s+)?eso\s+(que significa|qué significa|qué es)$/i.test(t)
}

module.exports = { normalize, lev, sim, route, routeTop, isMeta, worthAsking, INTENTS, HI: 0.82, MID: 0.6 }
