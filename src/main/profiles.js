// Perfiles de ambiente: un nombre -> lista de órdenes (se ejecutan como macro).
const PROFILES = {
  trabajo: {
    say: 'Modo trabajo: VS Code, Chrome y sin interrupciones.',
    steps: ['abre visual studio code', 'abre chrome', 'activa no molestar'],
  },
  juego: {
    say: 'Modo juego: Steam, volumen alto y no molestar.',
    steps: ['abre steam', 'volumen 80', 'activa no molestar'],
  },
  estudio: {
    say: 'Modo estudio: Chrome, bloc de notas y silencio.',
    steps: ['abre chrome', 'abre bloc de notas', 'volumen 40', 'activa no molestar'],
  },
  normal: {
    say: 'Modo normal: notificaciones activadas.',
    steps: ['quita no molestar'],
  },
}

function get(name) {
  return PROFILES[String(name || '').toLowerCase().trim()] || null
}

function list() {
  return Object.keys(PROFILES)
}

module.exports = { get, list }
