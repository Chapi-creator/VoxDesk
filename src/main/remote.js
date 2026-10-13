// Servidor LAN para control remoto (PWA del móvil). Sin nube ni cuentas.
// Auth Bearer por dispositivo + JSON. Puro salvo http/os → testeable.
const http = require('http')
const crypto = require('crypto')
const os = require('os')

function newToken() {
  return crypto.randomBytes(32).toString('hex')
}

function parseBearer(req) {
  const h = req.headers && req.headers.authorization
  if (!h) return ''
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim())
  return m ? m[1].trim() : ''
}

function checkToken(provided, expected) {
  try {
    const a = Buffer.from(String(provided || ''))
    const b = Buffer.from(String(expected || ''))
    if (!a.length || a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function lanIp() {
  try {
    for (const ifs of Object.values(os.networkInterfaces())) {
      for (const ni of ifs || []) {
        if (ni.family === 'IPv4' && !ni.internal && ni.address) return ni.address
      }
    }
  } catch {}
  return ''
}

function readBody(req, max = 65536) {
  return new Promise((resolve, reject) => {
    let n = 0
    const chunks = []
    req.on('data', (c) => {
      n += c.length
      if (n > max) { reject(new Error('body grande')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

// handlers: { execute(text)->obj, status()->obj, timers()->arr, speak(text)->bool }
// getToken: () => string vigente (para rotar sin reiniciar).
async function startRemote({ port, getToken, handlers }) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://x')
      if (!url.pathname.startsWith('/api/')) { send(res, 404, { error: 'no' }); return }
      if (!checkToken(parseBearer(req), getToken())) { send(res, 401, { error: 'token' }); return }
      if (req.method === 'GET' && url.pathname === '/api/status') {
        send(res, 200, { ok: true, ...(await handlers.status()) })
        return
      }
      if (req.method === 'GET' && url.pathname === '/api/timers') {
        send(res, 200, { ok: true, timers: await handlers.timers() })
        return
      }
      if (req.method === 'POST' && (url.pathname === '/api/execute' || url.pathname === '/api/speak')) {
        let body = {}
        try { body = JSON.parse(await readBody(req)) } catch { send(res, 400, { error: 'json' }); return }
        if (url.pathname === '/api/execute') {
          send(res, 200, await handlers.execute(String(body.text || '')))
          return
        }
        send(res, 200, { ok: await handlers.speak(String(body.text || '')) })
        return
      }
      send(res, 404, { error: 'no' })
    } catch {
      try { send(res, 500, { error: 'interno' }) } catch {}
    }
  })
  const base = Number(port) || 4567
  let lastErr = null
  for (let i = 0; i < 5; i++) {
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(base + i, '0.0.0.0', () => { server.removeListener('error', reject); resolve() })
      })
      return { server, port: base + i }
    } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('puerto ocupado')
}

module.exports = { newToken, parseBearer, checkToken, lanIp, startRemote }
