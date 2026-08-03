const https = require('https')

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 5000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { reject(new Error('Error al parsear respuesta')) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Tiempo de espera agotado')) })
  })
}

function execute(text) {
  const location = text ? encodeURIComponent(text.trim()) : ''
  const url = `https://wttr.in/${location}?format=j1&lang=es`
  return fetch(url).then((data) => {
    const c = data.current_condition?.[0]
    const area = data.nearest_area?.[0]
    if (!c) return { success: false, message: 'No pude obtener el clima' }
    const city = area?.areaName?.[0]?.value || 'tu ubicación'
    const country = area?.country?.[0]?.value || ''
    const temp = c.temp_C || '?'
    const feels = c.FeelsLikeC || temp
    const desc = c.lang_es?.[0]?.value || c.weatherDesc?.[0]?.value || ''
    const humidity = c.humidity || '?'
    const wind = c.windspeedKmph || '0'
    const dir = c.winddir16Point || ''
    const msg = `${city}${country ? ', ' + country : ''}: ${desc.toLowerCase()}, ${temp}°C (sensación ${feels}°C), humedad ${humidity}%, viento ${wind} km/h${dir ? ' del ' + dir : ''}`
    return { success: true, message: msg, speak: true }
  }).catch((e) => {
    return { success: false, message: e.message.includes('parsear') ? 'Servicio de clima no disponible' : 'Sin conexión para consultar el clima' }
  })
}

module.exports = { execute }
