// Voces custom de Piper desde HuggingFace. Descarga + registro. Testeable.
const fs = require('fs')
const path = require('path')
const os = require('os')
const memory = require('./memory')
const { fetchFile } = require('./fetch-file')

const K = 'vox_custom_voices'
const ALLOWED_HOST = /(^|\.)huggingface\.co$/

// De una URL .onnx saca {file, jsonUrl}. Solo HF (allowHost para tests).
function filesFromUrl(url, allowHost) {
  let u
  try { u = new URL(String(url || '').trim()) } catch { return null }
  const hostOk = allowHost ? allowHost.test(u.hostname) : ALLOWED_HOST.test(u.hostname)
  if (u.protocol !== 'https:' && !allowHost) return null
  if (!hostOk) return null
  if (!u.pathname.endsWith('.onnx')) return null
  const file = decodeURIComponent(u.pathname.split('/').pop())
  if (!/^[\w\-. ]+\.onnx$/.test(file) || file.includes('..')) return null
  return { file, jsonUrl: u.href + '.json' }
}

function downloadFile(url, dest) {
  // Compat: ahora con resume+retry+timeout (fetch-file).
  return fetchFile(url, dest).then(() => undefined)
}

function listCustom() {
  const v = memory.get(K)
  return Array.isArray(v) ? v : []
}

async function addCustomVoice(name, url, voicesDir, opts = {}) {
  const f = filesFromUrl(url, opts.allowHost)
  if (!f) throw new Error('URL inválida: pega el link .onnx de HuggingFace')
  const dir = path.join(voicesDir, 'custom')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, f.file)
  const tmp = dest + '.part'
  const cleanup = () => { try { fs.unlinkSync(tmp) } catch {}; try { fs.unlinkSync(tmp + '.json') } catch {} }
  // FIX: resume+retry+timeout; un trunco se rechaza (antes colaba si >1MB).
  await fetchFile(url, tmp, { minBytes: 1024 * 1024, shouldAbort: opts.shouldAbort })
  await fetchFile(f.jsonUrl, tmp + '.json', { shouldAbort: opts.shouldAbort })
  // FIX: el .json debe parsear (un HTML de error antes colaba y Piper reventaba).
  try {
    JSON.parse(fs.readFileSync(tmp + '.json', 'utf8'))
  } catch {
    cleanup()
    throw new Error('Config de voz inválida (¿URL correcta?).')
  }
  const st = fs.statSync(tmp)
  if (st.size < 1024 * 1024) { cleanup(); throw new Error('Archivo muy chico, ¿URL correcta?') }
  fs.renameSync(tmp, dest)
  fs.renameSync(tmp + '.json', dest + '.json')
  const nm = String(name || f.file.replace(/\.onnx$/, '')).trim().slice(0, 40) || f.file
  const list = listCustom().filter(v => v.file !== f.file)
  list.push({ name: nm, file: f.file })
  memory.set(K, list)
  return { name: nm, file: f.file }
}

function removeCustomVoice(file) {
  const list = listCustom().filter(v => v.file !== file)
  memory.set(K, list)
  return list
}

module.exports = { filesFromUrl, downloadFile, listCustom, addCustomVoice, removeCustomVoice }
