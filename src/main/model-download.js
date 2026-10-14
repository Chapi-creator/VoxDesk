// Descarga robusta del modelo grande Vosk. Sin Electron → testeable con servidor local.
// Red (fetch-file): reanuda, reintenta, timeouts. Aquí: verifica zip (EOCD),
// extrae a staging y solo sustituye si verifica OK. El modelo bueno instalado
// no se toca hasta que el nuevo pasa la verificación.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const mc = require('./modelcheck')
const { fetchFile } = require('./fetch-file')

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

  try {
    send({ phase: 'download', pct: 0 })
    let partial = 0
    try { partial = fs.statSync(zip).size } catch {}
    if (partial > 0) send({ phase: 'resume', MB: Math.round(partial / 1048576) })
    const mapSend = (e) => {
      if (e && e.phase === 'download') send({ ...e, pct: Math.min(85, Math.floor((e.pct || 0) * 85 / 100)) })
      else send(e)
    }
    try {
      await fetchFile(url, zip, { minBytes: minZipBytes, send: mapSend, onRetry: (i) => send({ phase: 'retry', attempt: i }) })
    } catch (e) {
      return fail('descarga falló 3 veces: ' + (e.message || e))
    }
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
