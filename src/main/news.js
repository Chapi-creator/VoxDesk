// Titulares por RSS (Google News ES), sin API key. Caché 30 min. Puro+https.
const https = require('https')

let _cache = { at: 0, items: [] }

function fetchText(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location, timeout).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return }
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

function clean(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, '')
    .replace(/\s+-\s+[^-]+$/, '')
    .replace(/\s+/g, ' ').trim()
}

function parseRss(xml) {
  const out = []
  const re = /<item>([\s\S]*?)<\/item>/g
  let m
  while ((m = re.exec(xml)) && out.length < 5) {
    const t = /<title>([\s\S]*?)<\/title>/.exec(m[1])
    const title = clean(t && t[1])
    if (title) out.push(title)
  }
  return out
}

async function headlines() {
  if (Date.now() - _cache.at < 30 * 60000 && _cache.items.length) return _cache.items
  const xml = await fetchText('https://news.google.com/rss?hl=es-419&gl=MX&ceid=MX%3Aes-419')
  const items = parseRss(xml)
  if (items.length) _cache = { at: Date.now(), items }
  return items
}

module.exports = { headlines, parseRss, clean }
