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

module.exports = { checkLargeModel, wipeLargeModel, REQUIRED }
