// Servidor LAN para control remoto (PWA del móvil). Sin nube ni cuentas.
// Auth Bearer por dispositivo + JSON. Puro salvo http/os → testeable.
const http = require('http')
const crypto = require('crypto')
const os = require('os')
const fs = require('fs')
const path = require('path')

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
  const all = lanIps()
  return all.length ? all[0].ip : ''
}

// Todas las IPv4 locales ordenadas: primero WiFi/LAN real, al final
// virtuales (Docker, VPN, VirtualBox). La primera ya no es una lotería.
function lanIps(ifs) {
  const out = []
  try {
    const table = ifs || os.networkInterfaces()
    for (const [name, addrs] of Object.entries(table)) {
      for (const ni of addrs || []) {
        if (!ni || ni.family !== 'IPv4' || ni.internal || !ni.address) continue
        const n = String(name || '').toLowerCase()
        const a = ni.address
        let score = 50
        if (/wi-?fi|wlan|wireless/.test(n)) score = 100
        else if (/^eth|ethernet|lan|en0|en1/.test(n)) score = 90
        else if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(a)) score += 10
        if (/docker|vethernet|virtualbox|vmnet|vmware|tailscale|tun|tap|vpn|hamachi|zerotier|vbox|hyper-v|wsl|br-|vswitch/i.test(n)) score = 1
        out.push({ name: String(name || ''), ip: a, score })
      }
    }
  } catch {}
  out.sort((x, y) => y.score - x.score)
  return out
}

// ¿El móvil puede ver el servidor? Sin token: 401 = llega; refused = firewall/red.
// Nunca lanza: devuelve {reachable, detail}.
function probeReachability(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    if (!ip || !port) { resolve({ reachable: false, detail: 'sin dirección' }); return }
    const timer = setTimeout(() => { try { req.destroy() } catch {} }, timeoutMs || 5000)
    let done = false
    const fin = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r) } }
    let req
    try {
      req = http.get({ host: ip, port: Number(port), path: '/api/status', timeout: timeoutMs || 5000 }, (res) => {
        res.resume()
        if (res.statusCode === 401) fin({ reachable: true, detail: 'el servidor responde (401 esperado sin token)' })
        else fin({ reachable: true, detail: 'responde HTTP ' + res.statusCode })
      })
    } catch (e) { fin({ reachable: false, detail: 'no se pudo pedir: ' + (e.message || e) }); return }
    req.on('timeout', () => { try { req.destroy() } catch {} })
    req.on('error', (e) => {
      const m = String((e && e.message) || e)
      if (/ECONNREFUSED/.test(m)) fin({ reachable: false, detail: 'conexión rechazada: firewall o el servidor no escucha ahí' })
      else if (/ETIMEDOUT|timeout/i.test(m)) fin({ reachable: false, detail: 'sin respuesta: ¿mismo WiFi? ¿firewall?' })
      else if (/EHOSTUNREACH|ENETUNREACH/.test(m)) fin({ reachable: false, detail: 'red inalcanzable: ¿mismo WiFi?' })
      else fin({ reachable: false, detail: m.slice(0, 120) })
    })
    req.on('close', () => fin({ reachable: false, detail: 'conexión cerrada sin respuesta' }))
  })
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
// remoteDir: carpeta con la PWA (se sirve sin auth; la API sí la exige).
async function startRemote({ port, getToken, handlers, remoteDir }) {
  const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://x')
      if (remoteDir && req.method === 'GET' && (url.pathname === '/remote' || url.pathname === '/remote/' || url.pathname.startsWith('/remote/'))) {
        let rel = url.pathname === '/remote' || url.pathname === '/remote/' ? 'index.html' : url.pathname.slice('/remote/'.length).split('?')[0]
        if (rel.includes('..') || rel.includes('\\')) { res.writeHead(400); res.end(); return }
        const full = path.join(remoteDir, rel)
        if (!full.startsWith(remoteDir)) { res.writeHead(403); res.end(); return }
        fs.readFile(full, (err, data) => {
          if (err) { res.writeHead(404); res.end(); return }
          res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' })
          res.end(data)
        })
        return
      }
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

module.exports = { newToken, parseBearer, checkToken, lanIp, lanIps, probeReachability, startRemote }
