const https = require('https')

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 5000 }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { reject(new Error('parse')) } })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

const LANG_MAP = {
  'inglés': 'en', 'ingles': 'en', 'english': 'en',
  'español': 'es', 'espanol': 'es', 'spanish': 'es',
  'francés': 'fr', 'frances': 'fr', 'french': 'fr',
  'alemán': 'de', 'aleman': 'de', 'german': 'de',
  'italiano': 'it', 'italian': 'it',
  'portugués': 'pt', 'portugues': 'pt', 'portuguese': 'pt',
  'japonés': 'ja', 'japones': 'ja', 'japanese': 'ja',
  'chino': 'zh', 'mandarín': 'zh', 'mandarin': 'zh',
  'ruso': 'ru', 'russian': 'ru',
  'árabe': 'ar', 'arabe': 'ar', 'arabic': 'ar',
  'coreano': 'ko', 'korean': 'ko',
  'holandés': 'nl', 'holandes': 'nl', 'dutch': 'nl',
}

function parse(text) {
  const m = /^(.+?)\s+(a|al|para|en)\s+(.+)$/i.exec(text)
  if (!m) return { text, lang: 'en' }
  const lang = LANG_MAP[m[3].toLowerCase().trim()]
  if (lang) return { text: m[1].trim(), lang }
  return { text, lang: 'en' }
}

function execute(text) {
  const { text: raw, lang } = parse(text)
  if (!raw) return Promise.resolve({ success: false, message: '¿Qué texto quieres traducir?' })
  const q = encodeURIComponent(raw)
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${q}`
  return fetch(url).then((data) => {
    const t = data?.[0]?.[0]?.[0]
    if (!t) return { success: false, message: 'No pude traducir' }
    return { success: true, message: `"${raw}" → "${t}"`, speak: true }
  }).catch(() => {
    return { success: false, message: 'Sin conexión para traducir' }
  })
}

module.exports = { execute, parse }
