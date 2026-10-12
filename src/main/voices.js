// Voces custom de Piper desde HuggingFace. Descarga + registro. Testeable.
const https = require('https')
const fs = require('fs')
const path = require('path')
const os = require('os')
const memory = require('./memory')

const K = 'vox_custom_voices'
const ALLOWED_HOST = /(^|\.)huggingface\.co$/

// De una URL .onnx saca {file, jsonUrl}. Solo HF.
function filesFromUrl(url) {
  let u
  try { u = new URL(String(url || '').trim()) } catch { return null }
  if (u.protocol !== 'https:' || !ALLOWED_HOST.test(u.hostname)) return null
  if (!u.pathname.endsWith('.onnx')) return null
  const file = decodeURIComponent(u.pathname.split('/').pop())
  if (!/^[\w\-. ]+\.onnx$/.test(file) || file.includes('..')) return null
  return { file, jsonUrl: u.href + '.json' }
}

function downloadFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('redirects'))
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        downloadFile(res.headers.location, dest, redirects + 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return }
      const out = fs.createWriteStream(dest)
      res.pipe(out)
      out.on('finish', () => { out.close(); resolve() })
      out.on('error', reject)
    }).on('error', reject)
  })
}

function listCustom() {
  const v = memory.get(K)
  return Array.isArray(v) ? v : []
}

async function addCustomVoice(name, url, voicesDir) {
  const f = filesFromUrl(url)
  if (!f) throw new Error('URL inválida: pega el link .onnx de HuggingFace')
  const dir = path.join(voicesDir, 'custom')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, f.file)
  const tmp = dest + '.part'
  await downloadFile(url, tmp)
  await downloadFile(f.jsonUrl, tmp + '.json')
  const st = fs.statSync(tmp)
  if (st.size < 1024 * 1024) { try { fs.unlinkSync(tmp) } catch {}; try { fs.unlinkSync(tmp + '.json') } catch {}; throw new Error('Archivo muy chico, ¿URL correcta?') }
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
