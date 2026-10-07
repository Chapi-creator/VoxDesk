// Contenido local de Vox: chistes y datos. Sin red, sin IA. Puro → testeable.
const JOKES = [
  '¿Qué le dice un bit al otro? Nos vemos en el bus.',
  '¿Por qué los programadores confunden Halloween con Navidad? Porque OCT 31 == DEC 25.',
  'Mi teclado renunció: dijo que tenía demasiadas teclas sin resolver.',
  '¿Qué hace una abeja en el gimnasio? Zum-ba.',
  'Le dije a mi PC que necesitaba espacio… y borró mis fotos.',
  '¿Por qué el WiFi fue al psicólogo? Tenía problemas de conexión.',
  'Soy un asistente de voz y ni siquiera tengo voz propia. Ah, espera…',
  '¿Qué le dice el mouse al teclado? Deja de teclearme tan fuerte.',
  'Mi chiste sobre UDP es bueno, pero no sé si te llegó.',
  '¿Cómo se llama un pez con corbata? Sofis-ticado.',
  'Windows y yo tenemos algo en común: los dos nos quedamos pensando a veces.',
  '¿Por qué los esqueletos no pelean? No tienen agallas.',
]

const FACTS = [
  'Los pulpos tienen tres corazones y sangre azul.',
  'La miel nunca caduca: se encontraron tarros comestibles en tumbas egipcias.',
  'Tu cerebro gasta el 20% de tu energía aunque estés sin hacer nada.',
  'Los flamencos nacen grises; el color rosa viene de lo que comen.',
  'Hay más formas de barajar una baraja que átomos en la Tierra.',
  'Los gatos duermen el 70% de su vida. Yo solo el 10% si me dejas.',
  'El primer programador de la historia fue Ada Lovelace, en 1843.',
  'Los koalas tienen huellas dactilares casi idénticas a las humanas.',
  'Un rayo es 5 veces más caliente que la superficie del Sol.',
  'Las nutrias se toman de las manos para no separarse al dormir.',
  'El sonido viaja 4 veces más rápido en el agua que en el aire.',
  'Tu PC ejecuta miles de millones de operaciones por segundo. Úsalo para algo lindo.',
]

function pick(arr, rnd) {
  const r = typeof rnd === 'function' ? rnd() : Math.random()
  return arr[Math.floor(r * arr.length) % arr.length]
}

module.exports = { JOKES, FACTS, joke: (rnd) => pick(JOKES, rnd), fact: (rnd) => pick(FACTS, rnd) }
