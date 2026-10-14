// C2: descarga del cerebro semántico (~135MB: onnx 118MB + tokenizer 17MB).
// Reusa fetch-file (resume+retry). Verifica por tamaño exacto conocido.
// El parcial se conserva para reanudar; meta.json solo se escribe al final OK.
const fs = require('fs')
const path = require('path')
const { fetchFile } = require('./fetch-file')
const { MODEL_ID, modelFiles } = require('./semroute')

const BASE = 'https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main'
const FILES = [
  { key: 'onnx', url: `${BASE}/onnx/model_quantized.onnx`, bytes: 118308126 },
  { key: 'tok', url: `${BASE}/tokenizer.json`, bytes: 17082913 },
]

async function downloadSemantic(opts = {}) {
  const modelsDir = opts.modelsDir
  const send = opts.send || (() => {})
  const urlOver = opts.urls || {}
  const f = modelFiles(modelsDir)
  const fail = (error) => {
    send({ pct: 0, done: true, ok: false, error })
    return false
  }
  try {
    fs.mkdirSync(f.dir, { recursive: true })
    const totalAll = FILES.reduce((a, x) => a + x.bytes, 0)
    let doneBytes = 0
    for (const spec of FILES) {
      try {
        const st = fs.statSync(f[spec.key])
        if (st.size === spec.bytes) { doneBytes += spec.bytes; continue }
      } catch {}
      send({ phase: 'download', pct: Math.floor((doneBytes / totalAll) * 100), file: spec.key })
      try {
        await fetchFile(urlOver[spec.key] || spec.url, f[spec.key], {
          expectedBytes: opts.exact === false ? 0 : spec.bytes,
          send: () => {
            // Progreso global exacto: lo ya bajado + tamaño actual en disco.
            let cur = 0
            try { cur = fs.statSync(f[spec.key]).size } catch {}
            send({
              phase: 'download', file: spec.key,
              MB: Math.round((doneBytes + cur) / 1048576), totalMB: Math.round(totalAll / 1048576),
              pct: Math.min(99, Math.floor(((doneBytes + cur) / totalAll) * 100)),
            })
          },
          onRetry: (n) => send({ phase: 'retry', attempt: n, file: spec.key }),
        })
      } catch (e) {
        return fail(`bajando ${spec.key}: ` + (e.message || e))
      }
      doneBytes += spec.bytes
    }
    send({ phase: 'verify', pct: 99 })
    try {
      fs.writeFileSync(f.meta, JSON.stringify({ id: MODEL_ID, onnxBytes: FILES[0].bytes, tokBytes: FILES[1].bytes, at: Date.now() }))
    } catch (e) {
      return fail('no pude guardar meta: ' + e.message)
    }
    send({ pct: 100, done: true, ok: true })
    return true
  } catch (e) {
    return fail(e.message || String(e))
  }
}

module.exports = { downloadSemantic, SEM_FILES: FILES }
