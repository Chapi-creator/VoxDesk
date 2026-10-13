// Descarga robusta del modelo grande Vosk. Sin Electron → testeable con servidor local.
// Robusta: reanuda (Range), reintenta x3, timeout, verifica zip (EOCD) antes de
// extraer, extrae a staging y solo sustituye si verifica OK. El modelo bueno
// instalado no se toca hasta que el nuevo pasa la verificación.
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const mc = require('./modelcheck')

const DEFAULT_URL = 'https://alphacephei.com/vosk/models/vosk-model-es-0.42.zip'

async function downloadLarge(opts = {}) {
  const modelsDir = opts.modelsDir
  const url = opts.url || DEFAULT_URL
  const minZipBytes = opts.minZipBytes || 1000000000
  const send = opts.send || (() => {})
  const dir = path.join(modelsDir, 'vosk-model-es-0.42')
  const stageRoot = path.join(modelsDir, '.stage-large')
  const stageDir = path.join(stageRoot, 'vosk-model-es-0.42')
  const zip = path.join(opts.tmpDir || os.tmpdir(), 'vosk-model-es-0.42.zip')

  const fail = (error) => {
    try { fs.rmSync(stageRoot, { recursive: true, force: true }) } catch {}
    // El zip parcial se conserva: la próxima vez reanuda donde quedó.
    send({ pct: 0, done: true, ok: false, error })
    return false
  }

  // Una pasada de descarga con reanudación. Resuelve con bytes totales o lanza.
  const get = () => new Promise((resolve, reject) => {
    let start = 0
    try { start = fs.statSync(zip).size } catch {}
    if (start > 0) send({ phase: 'resume', MB: Math.round(start / 1048576) })
    let lastPct = -1
    const attempt = (u, redirs, resumeFrom) => {
      const headers = resumeFrom > 0 ? { Range: `bytes=${resumeFrom}-` } : {}
      const mod = u.startsWith('https:') ? https : http
      const req = mod.get(u, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          if (redirs > 5) { reject(new Error('demasiadas redirecciones')); return }
          attempt(res.headers.location, redirs + 1, resumeFrom)
          return
        }
        const resumed = res.statusCode === 206
        if (res.statusCode !== 200 && !resumed) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return }
        const total = parseInt(res.headers['content-length'] || '0', 10) + (resumed ? resumeFrom : 0)
        if (total && total < minZipBytes) { res.resume(); reject(new Error('zip muy chico: ' + total)); return }
        if (!resumed && resumeFrom > 0) {
          try { fs.unlinkSync(zip) } catch {}
          resumeFrom = 0
        }
        let got = resumeFrom
        const out = fs.createWriteStream(zip, { flags: resumed ? 'a' : 'w' })
        const idleMs = 60000
        let idle = setTimeout(() => req.destroy(new Error('sin datos 60s')), idleMs)
        const poke = () => { clearTimeout(idle); idle = setTimeout(() => req.destroy(new Error('sin datos 60s')), idleMs) }
        res.on('data', (c) => {
          got += c.length
          poke()
          if (total) {
            const pct = Math.min(85, Math.floor((got / total) * 85))
            if (pct !== lastPct) {
              lastPct = pct
              send({ phase: 'download', pct, MB: Math.round(got / 1048576), totalMB: Math.round(total / 1048576) })
            }
          }
        })
        res.on('end', () => clearTimeout(idle))
        res.pipe(out)
        out.on('finish', () => { out.close(); resolve(total || got) })
        out.on('error', (e) => { clearTimeout(idle); reject(e) })
      })
      req.on('error', reject)
      req.setTimeout(30000, () => req.destroy(new Error('conectando 30s sin respuesta')))
    }
    attempt(url, 0, start)
  })

  try {
    send({ phase: 'download', pct: 0 })
    let lastErr = ''
    for (let i = 1; i <= 3; i++) {
      try { await get(); lastErr = ''; break } catch (e) { lastErr = e.message || String(e) }
      if (i < 3) {
        send({ phase: 'retry', attempt: i })
        await new Promise(r => setTimeout(r, i * 4000))
      }
    }
    if (lastErr) return fail('descarga falló 3 veces: ' + lastErr)
    if (!mc.zipLooksComplete(zip, minZipBytes)) return fail('zip incompleto o corrupto, reintenta para continuar')
    send({ phase: 'extract', pct: 88 })
    try { fs.rmSync(stageRoot, { recursive: true, force: true }) } catch {}
    fs.mkdirSync(stageRoot, { recursive: true })
    await new Promise((resolve, reject) => {
      execFile('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${stageRoot}' -Force`], { timeout: 30 * 60000 }, (err) => err ? reject(err) : resolve())
    })
    try { fs.unlinkSync(zip) } catch {}
    send({ phase: 'verify', pct: 96 })
    const check = mc.checkLargeModel(stageRoot)
    if (!check.ok) return fail('incompleto tras extraer, faltan: ' + check.missing.join(', '))
    // Swap: el modelo anterior solo se reemplaza con el nuevo verificado.
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
    fs.renameSync(stageDir, dir)
    try { fs.rmSync(stageRoot, { recursive: true, force: true }) } catch {}
    send({ pct: 100, done: true, ok: true })
    return true
  } catch (e) {
    return fail(e.message || String(e))
  }
}

module.exports = { downloadLarge, DEFAULT_URL }
