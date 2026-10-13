// Verificación de integridad del modelo grande Vosk. Puro fs → testeable.
const fs = require('fs')
const path = require('path')

// Archivos que prueban una descarga completa (tamaños mínimos seguros).
const REQUIRED = [
  ['am', 'final.mdl', 50 * 1024 * 1024],
  ['graph', 'HCLr.fst', 50 * 1024 * 1024],
  ['graph', 'Gr.fst', 100 * 1024 * 1024],
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
