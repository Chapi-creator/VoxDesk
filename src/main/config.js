const fs = require('fs')
const path = require('path')
const logger = require('./logger')

let _userDataPath = ''

const DEFAULTS = { apiKey: '', provider: 'gemini', model: 'gemini-flash-latest', apiUrl: '', configured: false, wakeWord: 'asistente', aiKeywords: 'ia,bot,asistente', micDevice: '', endPause: 1.2, proactivity: 'total', smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', smtpFrom: '', systemPrompt: '', temperature: 0.7, maxTokens: 4096 }

function _getPath() {
  return path.join(_userDataPath, 'assistant-config.json')
}

function setUserDataPath(p) {
  _userDataPath = p
}

function _crypt() {
  try {
    const { safeStorage } = require('electron')
    return safeStorage
  } catch { return null }
}

function _encrypt(plain) {
  if (!plain) return ''
  try {
    const ss = _crypt()
    if (!ss || !ss.isEncryptionAvailable()) return plain
    return 'enc:' + ss.encryptString(plain).toString('base64')
  } catch { return plain }
}

function _decrypt(val) {
  if (!val) return ''
  if (!val.startsWith('enc:')) return val
  try {
    const ss = _crypt()
    if (!ss || !ss.isEncryptionAvailable()) return ''
    return ss.decryptString(Buffer.from(val.slice(4), 'base64'))
  } catch { return '' }
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(_getPath(), 'utf8'))
    if (raw.apiKey) raw.apiKey = _decrypt(raw.apiKey)
    if (raw.smtpPass) raw.smtpPass = _decrypt(raw.smtpPass)
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(data) {
  try {
    const dir = path.dirname(_getPath())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const out = { ...data }
    if (out.apiKey) out.apiKey = _encrypt(out.apiKey)
    if (out.smtpPass) out.smtpPass = _encrypt(out.smtpPass)
    fs.writeFileSync(_getPath(), JSON.stringify(out, null, 2))
    return true
  } catch (e) {
    logger.error('config.save falló en', _getPath(), '->', e.message)
    return false
  }
}

module.exports = { setUserDataPath, load, save }
