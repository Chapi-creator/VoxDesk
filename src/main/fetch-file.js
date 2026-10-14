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
  const shouldAbort = opts.shouldAbort || (() => false)
  let lastErr = ''
  for (let i = 1; i <= 3; i++) {
    if (shouldAbort()) throw new Error('cancelado')
    try {
      return await _once(url, dest, { expectedBytes, minBytes, send, shouldAbort })
    } catch (e) {
      if (shouldAbort() || /cancelado/.test(e.message || '')) throw new Error('cancelado')
      lastErr = e.message || String(e)
      if (i < 3) {
        try { onRetry(i) } catch {}
        await new Promise(r => setTimeout(r, i * 4000))
      }
    }
  }
  throw new Error(lastErr || 'descarga falló')
}

function _once(url, dest, { expectedBytes, minBytes, send, shouldAbort }) {
  const abort = shouldAbort || (() => false)
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
        // FIX: el aborto se revisa también sin datos (el servidor puede quedarse mudo).
        const abortTimer = setInterval(() => {
          if (abort()) { clearInterval(abortTimer); req.destroy(new Error('cancelado')) }
        }, 250)
        const done = (fn) => { if (!settled) { settled = true; clearTimeout(idle); clearInterval(abortTimer); fn() } }
        res.on('data', (c) => {
          got += c.length
          poke()
          if (abort()) { req.destroy(new Error('cancelado')); return }
          if (total) {
            const pct = Math.min(99, Math.floor((got / total) * 100))
            if (pct !== lastPct) {
              lastPct = pct
              send({ phase: 'download', pct, MB: Math.round(got / 1048576), totalMB: Math.round(total / 1048576) })
            }
          }
        })
        // FIX: corte limpio a la mitad (sin 'end'): antes colgaba hasta el
        // timeout de 60 s por intento. 'aborted' es corte seguro; 'close' sin
        // 'end' previo también (el 'close' normal llega DESPUÉS de 'end').
        let settled = false
        let ended = false
        res.on('end', () => { ended = true; clearTimeout(idle) })
        res.on('aborted', () => done(() => reject(new Error('conexión cortada'))))
        res.on('close', () => { if (!ended) done(() => reject(new Error('conexión cortada'))) })
        res.pipe(out)
        out.on('finish', () => {
          out.close()
          done(() => {
            let final = 0
            try { final = fs.statSync(dest).size } catch {}
            if (expectedBytes && final !== expectedBytes) { reject(new Error(`incompleto: ${final}/${expectedBytes}`)); return }
            // FIX: el servidor anunció N y llegaron M<N (corte limpio): trunco.
            if (total && final !== total) { reject(new Error(`trunco: ${final}/${total}`)); return }
            resolve({ bytes: final, total: total || final, resumed })
          })
        })
        out.on('error', (e) => done(() => reject(e)))
      })
      req.on('error', reject)
      req.setTimeout(30000, () => req.destroy(new Error('conectando 30s sin respuesta')))
    }
    attempt(url, 0, start)
  })
}

module.exports = { fetchFile }
