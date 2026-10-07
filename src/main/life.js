// Cerebro de Vox: decide acciones autónomas a partir del contexto.
// Puro (sin electron): main.js junta el ctx y aplica. Testeable.
// ctx: { now, hour, name, mood, daysAway, idleMin, recentCmds, battery,
//        lastMorning, lastNight, lastBatteryWarn, lastBreak, streak }
// Devuelve { id, state, text, speak, important, stamp } o null.
function evaluate(ctx) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
  const said = (key, ms) => ctx.now - (ctx[key] || 0) > ms
  const who = ctx.name ? `, ${ctx.name}` : ''
  const warm = ctx.mood >= 70 ? ' ¡Qué bueno verte!' : ''

  // 1. Batería crítica: lo único que salta cooldowns (pero no el silencio)
  if (ctx.battery !== null && ctx.battery <= 20 && said('lastBatteryWarn', 30 * 60000)) {
    return { id: 'battery', state: 'worried', speak: true, important: true,
      text: `Batería al ${ctx.battery}%${who}. Conéctame o me apago y te extraño.`,
      stamp: { lastBatteryWarn: ctx.now } }
  }
  // 2. Buenos días: primer evento del día entre 6 y 12
  const today = new Date(ctx.now).toISOString().slice(0, 10)
  if (ctx.hour >= 6 && ctx.hour < 12 && ctx.lastMorning !== today) {
    return { id: 'morning', state: 'happy', speak: true,
      text: pick([`Buenos días${who}.${warm} ¿En qué andamos hoy?`,
        `¡Buenos días${who}! Dormí bien (o sea, existí en silencio). ¿Empezamos?`]),
      stamp: { lastMorning: today } }
  }
  // 3. Buenas noches: primer evento desde las 22
  if (ctx.hour >= 22 && ctx.lastNight !== today) {
    return { id: 'night', state: 'sleep', speak: false,
      text: `Buenas noches${who}. Yo vigilo el PC mientras duermes.`,
      stamp: { lastNight: today } }
  }
  // 4. Te extrañé: 2+ días sin abrir
  if (ctx.daysAway >= 2 && said('lastMissed', 24 * 3600000)) {
    return { id: 'missed', state: 'happy', speak: false,
      text: pick([`¡Volviste${who}! Te extrañé ${ctx.daysAway} días.`,
        `${ctx.daysAway} días sin ti${who}. Ya temía que me hubieras cambiado por Cortana.`]),
      stamp: { lastMissed: ctx.now } }
  }
  // 5. Racha: 5 comandos hoy
  if (ctx.streak && ctx.streak.n >= 5 && !ctx.streak.done) {
    return { id: 'streak', state: 'happy', speak: false, streakDone: true,
      text: pick([`¡Racha de ${ctx.streak.n}! Estamos imparables${who}.`,
        `${ctx.streak.n} cosas hechas hoy. Date un premio (yo ya me lo di).`]) }
  }
  // 6. Pausa activa: mucho uso seguido
  if (ctx.recentCmds >= 5 && said('lastBreak', 3 * 3600000)) {
    return { id: 'break', state: 'worried', speak: false,
      text: pick(['Llevas un rato sin parar. Estira las piernas, yo cuido todo.',
        'Pausa de 2 minutos: mira lejos de la pantalla. Te espero.']),
      stamp: { lastBreak: ctx.now } }
  }
  // 7. Dormir: 10 min sin comandos (solo visual, lo despierta cualquier comando)
  if (ctx.idleMin >= 10 && ctx.lastSleepState !== 'sleep') {
    return { id: 'sleep', state: 'sleep', speak: false, text: '', sleepState: 'sleep' }
  }
  return null
}

module.exports = { evaluate }
