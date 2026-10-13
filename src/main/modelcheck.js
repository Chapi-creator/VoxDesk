// Verificación de integridad del modelo grande Vosk. Puro fs → testeable.
const fs = require('fs')
const path = require('path')

// Archivos que prueban una descarga completa del GRANDE (HCLG único + rescore).
// OJO: no son los del small (HCLr.fst/Gr.fst no existen aquí).
const REQUIRED = [
  ['am', 'final.mdl', 50 * 1024 * 1024],
  ['graph', 'HCLG.fst', 300 * 1024 * 1024],
  ['conf', 'model.conf', 100],
]

function checkLargeModel(modelsDir) {
  const base = path.join(modelsDir || '', 'vosk-model-es-0.42')
  const missing = []
  let bytesPresent = 0
  for (const [dir, file, minSize] of REQUIRED) {
    const full = path.join(base, ...dir.split('/'), file)
    let size = 0
    try { size = fs.statSync(full).size } catch {}
    bytesPresent += size
    if (size < minSize) missing.push(`${dir}/${file}`)
  }
  return { ok: missing.length === 0, missing, bytesPresent, dir: base }
}

function wipeLargeModel(modelsDir) {
  const base = path.join(modelsDir || '', 'vosk-model-es-0.42')
  try { fs.rmSync(base, { recursive: true, force: true }) } catch {}
  return !fs.existsSync(base)
}

// El zip oficial pesa >1GB. Un zip trunco no tiene firma end-of-central-directory
// (PK\x05\x06) en sus últimos 66KB. Detectarlo evita extraer basura tras 20 min.
function zipLooksComplete(zipPath, minBytes) {
  try {
    const st = fs.statSync(zipPath)
    if (st.size < (minBytes || 1000000000)) return false
    const tail = Math.min(st.size, 70000)
    const fd = fs.openSync(zipPath, 'r')
    const buf = Buffer.alloc(tail)
    fs.readSync(fd, buf, 0, tail, st.size - tail)
    fs.closeSync(fd)
    return buf.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  } catch { return false }
}

module.exports = { checkLargeModel, wipeLargeModel, zipLooksComplete, REQUIRED }
