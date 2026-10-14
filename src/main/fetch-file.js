// Núcleo de descarga robusta compartido (modelos, voces, cerebro semántico).
// Reanuda (Range), reintenta x3 con backoff, timeouts anti-cuelgue,
// verifica tamaño. Sin Electron → testeable con servidor local.
const https = require('https')
const http = require('http')
const fs = require('fs')

// Salvo error: resuelve {bytes, total, resumed}. Lanza con motivo si falla.
async function fetchFile(url, dest, opts = {}) {
  const expectedBytes = opts.expectedBytes || 0
  const minBytes = opts.minBytes || 0
  const send = opts.send || (() => {})
  const onRetry = opts.onRetry || (() => {})
  let lastErr = ''
  for (let i = 1; i <= 3; i++) {
    try {
      return await _once(url, dest, { expectedBytes, minBytes, send })
    } catch (e) {
      lastErr = e.message || String(e)
      if (i < 3) {
        try { onRetry(i) } catch {}
        await new Promise(r => setTimeout(r, i * 4000))
      }
    }
  }
  throw new Error(lastErr || 'descarga falló')
}

function _once(url, dest, { expectedBytes, minBytes, send }) {
  return new Promise((resolve, reject) => {
    let start = 0
    try { start = fs.statSync(dest).size } catch {}
    let lastPct = -1
    const attempt = (u, redirs, resumeFrom) => {
      const mod = u.startsWith('https:') ? https : http
      const req = mod.get(u, { headers: resumeFrom > 0 ? { Range: `bytes=${resumeFrom}-` } : {} }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          if (redirs > 5) { reject(new Error('demasiadas redirecciones')); return }
          attempt(res.headers.location, redirs + 1, resumeFrom)
          return
        }
        const resumed = res.statusCode === 206
        if (res.statusCode === 416 && resumeFrom > 0) {
          // Parcial corrupto (más grande que el archivo): empezar de cero.
          res.resume()
          try { fs.unlinkSync(dest) } catch {}
          attempt(u, redirs, 0)
          return
        }
        if (res.statusCode !== 200 && !resumed) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return }
        const total = parseInt(res.headers['content-length'] || '0', 10) + (resumed ? resumeFrom : 0)
        if (minBytes && total && total < minBytes) { res.resume(); reject(new Error('archivo muy chico: ' + total)); return }
        // Con resume el total ya incluye lo bajado: en ambos casos debe dar lo esperado.
        if (expectedBytes && total && total !== expectedBytes) { res.resume(); reject(new Error(`tamaño inesperado: ${total}, espero ${expectedBytes}`)); return }
        if (!resumed && resumeFrom > 0) {
          try { fs.unlinkSync(dest) } catch {}
          resumeFrom = 0
        }
        let got = resumeFrom
        const out = fs.createWriteStream(dest, { flags: resumed ? 'a' : 'w' })
        const idleMs = 60000
        let idle = setTimeout(() => req.destroy(new Error('sin datos 60s')), idleMs)
        const poke = () => { clearTimeout(idle); idle = setTimeout(() => req.destroy(new Error('sin datos 60s')), idleMs) }
        res.on('data', (c) => {
          got += c.length
          poke()
          if (total) {
            const pct = Math.min(99, Math.floor((got / total) * 100))
            if (pct !== lastPct) {
              lastPct = pct
              send({ phase: 'download', pct, MB: Math.round(got / 1048576), totalMB: Math.round(total / 1048576) })
            }
          }
        })
        res.on('end', () => clearTimeout(idle))
        res.pipe(out)
        out.on('finish', () => {
          out.close()
          let final = 0
          try { final = fs.statSync(dest).size } catch {}
          if (expectedBytes && final !== expectedBytes) { reject(new Error(`incompleto: ${final}/${expectedBytes}`)); return }
          resolve({ bytes: final, total: total || final, resumed })
        })
        out.on('error', (e) => { clearTimeout(idle); reject(e) })
      })
      req.on('error', reject)
      req.setTimeout(30000, () => req.destroy(new Error('conectando 30s sin respuesta')))
    }
    attempt(url, 0, start)
  })
}

module.exports = { fetchFile }
