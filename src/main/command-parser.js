const { COMMANDS } = require('../shared/constants')

const ALIASES = {
  'abrir': 'abre', 'abra': 'abre', 'abreme': 'abre',
  'lanza': 'abre', 'lanzar': 'abre', 'inicia': 'abre', 'iniciar': 'abre',
  'abrir el': 'abre', 'abre el': 'abre', 'abre la': 'abre',
  'buscar': 'busca', 'busca el': 'busca', 'busca la': 'busca',
  'escribir': 'escribe', 'escribe el': 'escribe', 'escribe la': 'escribe',
  'dime': 'di', 'diga': 'di', 'decir': 'di', 'habla': 'di',
  'detener': 'detente', 'para': 'detente', 'parar': 'detente',
  'ayudame': 'ayuda', 'ayudar': 'ayuda',
  'silencio': 'volumen', 'silencia': 'volumen', 'mutear': 'volumen',
  'recuerda': 'alarma', 'recuérdame': 'alarma', 'recordar': 'alarma',
  'temporizador': 'alarma', 'temporiza': 'alarma', 'alarma': 'alarma',
  'capturar': 'captura', 'captura': 'captura', 'foto': 'captura', 'fotografía': 'captura',
  'apaga': 'sistema', 'apagar': 'sistema', 'apagate': 'sistema',
  'reinicia': 'sistema', 'reiniciar': 'sistema', 'reiniciate': 'sistema',
  'bloquea': 'sistema', 'bloquear': 'sistema', 'bloquéate': 'sistema',
  'cierra': 'sistema', 'cerrar': 'sistema', 'mata': 'sistema', 'matar': 'sistema',
  'crea': 'sistema', 'crear': 'sistema', 'nueva': 'sistema', 'nuevo': 'sistema',
  'fondo': 'sistema', 'wallpaper': 'sistema', 'pantalla': 'sistema',
  'ejecuta': 'sistema', 'ejecutar': 'sistema', 'corre': 'sistema', 'correr': 'sistema',
  'suspende': 'sistema', 'suspender': 'sistema', 'duerme': 'sistema', 'hiberna': 'sistema',
  'muestra': 'sistema', 'mostrar': 'sistema', 'minimiza': 'sistema',
  'cancela': 'sistema', 'cancelar': 'sistema', 'aborta': 'sistema', 'abortar': 'sistema',
  'cambia': 'sistema', 'cambiar': 'sistema', 'pon': 'sistema', 'poner': 'sistema',
  'hora': 'sistema', 'tiempo': 'sistema', 'fecha': 'sistema',
  'batería': 'sistema', 'bateria': 'sistema', 'energía': 'sistema',
  'ip': 'sistema', 'red': 'sistema',
  'papelera': 'sistema', 'recicla': 'sistema',
  'sesión': 'sistema', 'sesion': 'sistema', 'salir': 'sistema',
  'abre': 'abre',
  'toma': 'nota', 'anota': 'nota', 'anotar': 'nota', 'nota': 'nota', 'apunta': 'nota',
  'clima': 'clima', 'climático': 'clima', 'temperatura': 'clima',
  'traduce': 'traduce', 'traducir': 'traduce', 'tradúceme': 'traduce', 'traducción': 'traduce',
  'redacta': 'redacta', 'redactar': 'redacta',
}

const GREETINGS = /^(hola|oye|hey|eh|ei|oiga|disculpa|perdona|por favor|buenas)\s+/i

class CommandParser {
  parse(transcript) {
    if (!transcript) return null
    let text = transcript.toLowerCase().trim()
    if (!text) return null

    if (text.includes(COMMANDS.STOP)) {
      return { command: COMMANDS.STOP, args: '' }
    }

    text = text.replace(GREETINGS, '').trim()
    const words = text.split(/\s+/)
    const entries = Object.entries(COMMANDS)

    for (let i = 0; i < words.length; i++) {
      const normalized = ALIASES[words[i]] || words[i]

      for (const [, keyword] of entries) {
        if (normalized === keyword) {
          let args = words.slice(i + 1).join(' ')
          args = args.replace(/^(el|la|los|las|un|una|unos|unas|en|a|al|de|del)\s+/i, '')
          return { command: keyword, args }
        }
      }
    }

    return null
  }
}

module.exports = new CommandParser()
