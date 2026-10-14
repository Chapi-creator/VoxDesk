// C: cliente del sidecar semántico. Si no hay modelo o el sidecar falla,
// el llamador usa las reglas (fallback) — nunca se rompe nada.
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2:onnx/model_quantized.onnx'
const DIM = 384
// Umbrales medidos con el banco (scripts/sem-bank.js + tests/semantic-bank.json).
// La red NUNCA ejecuta sola: solo promociona consenso o pregunta.
const SEM_AGREE = 0.60 // fuzzy MID + misma canon + red → ejecuta sin preguntar
const SEM_ASK = 0.60   // red sola con confianza → pregunta (nunca ejecuta)

function isPackaged() {
  try { return require('electron').app.isPackaged } catch { return false }
}

function sidecarBin() {
  if (isPackaged()) return path.join(process.resourcesPath, 'semroute.exe')
  return path.join(__dirname, '..', '..', 'dist', 'semroute.exe')
}

function sidecarPy() {
  return path.join(__dirname, 'semroute.py')
}

function modelFiles(modelsDir) {
  const dir = path.join(modelsDir || '', 'semantic')
  return {
    dir,
    onnx: path.join(dir, 'model.onnx'),
    tok: path.join(dir, 'tokenizer.json'),
    meta: path.join(dir, 'meta.json'),
  }
}

// ¿Modelo descargado y completo? Nunca lanza.
function status(modelsDir) {
  const f = modelFiles(modelsDir)
  const missing = ['onnx', 'tok'].filter(k => {
    try { return fs.statSync(f[k]).size < 1000000 } catch { return true }
  })
  try {
    const meta = JSON.parse(fs.readFileSync(f.meta, 'utf8'))
    if (!meta || meta.id !== MODEL_ID) missing.push('meta')
    else if (!missing.length) return { available: true, files: f, meta }
  } catch { missing.push('meta') }
  return { available: false, missing, files: f }
}

let _proc = null
let _rid = 0
let _pending = new Map()
let _restarts = []
let _coolUntil = 0

function _dead(crashed) {
  for (const [, p] of _pending) { try { p.reject(new Error('sidecar muerto')) } catch {} }
  _pending = new Map()
  _proc = null
  // Solo las muertes con trabajo en vuelo cuentan para el enfriamiento.
  if (crashed) {
    const now = Date.now()
    _restarts = _restarts.filter(t => now - t < 60000)
    _restarts.push(now)
  }
}

// bin/args inyectables (tests usan stub). Prod: exe o python+py.
function _spawn(modelsDir, over = {}) {
  const f = modelFiles(modelsDir)
  let bin = over.bin
  let args = over.args
  if (!bin) {
    const exe = sidecarBin()
    if (fs.existsSync(exe)) { bin = exe; args = ['--model', f.onnx, '--tokenizer', f.tok] }
    else {
      const py = process.env.VOXDESK_PYTHON || 'python'
      bin = py
      args = [sidecarPy(), '--model', f.onnx, '--tokenizer', f.tok]
    }
  }
  const child = spawn(bin, args || [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  let buf = ''
  child.stdout.on('data', (c) => {
    buf += c.toString('utf8')
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const ln of lines) {
      if (!ln.trim()) continue
      let o
      try { o = JSON.parse(ln) } catch { continue }
      if (o && o.event) continue
      const p = _pending.get(o && o.id)
      if (p) { _pending.delete(o.id); p.resolve(o) }
    }
  })
  // Un exit tardío de un sidecar viejo nunca toca los pendientes del nuevo.
  child.on('error', () => { if (child === _proc) _dead(_pending.size > 0) })
  child.on('exit', () => { if (child === _proc) _dead(_pending.size > 0) })
  return child
}

function _ensure(modelsDir, over = {}) {
  if (_proc && !_proc.killed && _proc.exitCode === null) return _proc
  const now = Date.now()
  if (now < _coolUntil) throw new Error('sidecar en enfriamiento')
  _restarts = _restarts.filter(t => now - t < 60000)
  if (_restarts.length >= 3) { _coolUntil = now + 5 * 60000; throw new Error('sidecar falló 3 veces, pausa 5 min') }
  _proc = _spawn(modelsDir, over)
  return _proc
}

function _call(modelsDir, msg, timeoutMs, over = {}) {
  const proc = _ensure(modelsDir, over)
  const id = ++_rid
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(id)
      reject(new Error('timeout sidecar'))
    }, timeoutMs || 60000)
    _pending.set(id, {
      resolve: (o) => { clearTimeout(timer); o && o.ok === false ? reject(new Error(o.error || 'sidecar')) : resolve(o) },
      reject: (e) => { clearTimeout(timer); reject(e) },
    })
    try {
      proc.stdin.write(JSON.stringify({ id, ...msg }) + '\n')
    } catch (e) {
      _pending.delete(id)
      clearTimeout(timer)
      reject(e)
    }
  })
}

async function ping(modelsDir, over = {}) {
  const st = status(modelsDir)
  if (!st.available && !over.bin && !over.args) throw new Error('sin modelo: ' + (st.missing || []).join(','))
  return _call(modelsDir, { op: 'ping' }, 30000, over)
}

async function embed(modelsDir, texts, over = {}) {
  const st = status(modelsDir)
  if (!st.available && !over.bin && !over.args) throw new Error('sin modelo: ' + (st.missing || []).join(','))
  // El sidecar topa en 32 por llamada: trocear aquí (los candidatos son 86+).
  const out = []
  for (let i = 0; i < texts.length; i += 32) {
    const r = await _call(modelsDir, { op: 'embed', texts: texts.slice(i, i + 32) }, over.timeoutMs || 90000, over)
    if (!Array.isArray(r.vecs) || (r.vecs.length && r.vecs[0].length !== DIM)) {
      throw new Error('dim inesperada')
    }
    out.push(...r.vecs)
  }
  if (out.length !== texts.length) throw new Error(`vecs ${out.length}/${texts.length}`)
  return out
}

function stop() {
  try { if (_proc) _proc.kill() } catch {}
  _dead(false)
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function routeSemantic(q, vecs) {
  let best = { idx: -1, sim: -2 }
  for (let i = 0; i < vecs.length; i++) {
    const s = cosine(q, vecs[i])
    if (s > best.sim) best = { idx: i, sim: s }
  }
  return best
}

// groups: [{canon, vecIdx:[...]}] → mejor grupo por similitud máxima.
// La red elige el PATRÓN; el texto original se ejecuta para conservar argumentos.
function bestGroup(q, vecs, groups) {
  let best = { group: -1, sim: -2, canon: null }
  groups.forEach((g, gi) => {
    let m = -2
    for (const vi of g.vecIdx || []) {
      if (!vecs[vi]) continue
      const s = cosine(q, vecs[vi])
      if (s > m) m = s
    }
    if (m > best.sim) best = { group: gi, sim: m, canon: g.canon }
  })
  return best
}

// Tablas candidatas con paridad fuzzy: INTENTS + ejemplos smart.
// Devuelve {tables, flat, groups} para candidateVecs + bestGroup.
function candidateTables() {
  const understand = require('./understand')
  const smart = require('./smart-exec')
  const tables = understand.INTENTS.map(i => ({ canon: i.canon, ex: i.ex }))
  for (const p of smart.getPatternExamples()) tables.push({ canon: p.canon, ex: p.ex })
  const flat = []
  const groups = tables.map((t) => {
    const vecIdx = t.ex.map((ex) => { flat.push(ex); return flat.length - 1 })
    return { canon: t.canon, vecIdx }
  })
  return { tables, flat, groups }
}
async function candidateVecs(modelsDir, texts, over = {}) {
  const f = modelFiles(modelsDir)
  // pad128-v1 invalida cachés del pooling antiguo (padding variable → sesgo de lote).
  const hash = crypto.createHash('sha1').update('pad128-v1\n' + MODEL_ID + '\n' + JSON.stringify(texts)).digest('hex').slice(0, 16)
  const cacheFile = path.join(f.dir, `vecs-${hash}.json`)
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    if (Array.isArray(c.vecs) && c.vecs.length === texts.length) return c.vecs
  } catch {}
  const vecs = await embed(modelsDir, texts, over)
  try { fs.writeFileSync(cacheFile, JSON.stringify({ hash, vecs })) } catch {}
  return vecs
}

module.exports = {
  MODEL_ID, DIM, SEM_AGREE, SEM_ASK,
  status, modelFiles, ping, embed, stop, cosine, routeSemantic, bestGroup, candidateVecs, candidateTables,
}
