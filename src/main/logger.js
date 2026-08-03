const fs = require('fs')
const path = require('path')

let _logDir = ''

function init(userDataPath) {
  _logDir = path.join(userDataPath, 'logs')
  if (!fs.existsSync(_logDir)) fs.mkdirSync(_logDir, { recursive: true })
}

function _ts() { return new Date().toISOString().replace('T', ' ').slice(0, 19) }

function _write(level, args) {
  const msg = `[${_ts()}] [${level}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`
  console.log(msg)
  if (!_logDir) return
  try { fs.appendFileSync(path.join(_logDir, 'app.log'), msg + '\n') } catch {}
}

module.exports = {
  init,
  info: (...args) => _write('INFO', args),
  warn: (...args) => _write('WARN', args),
  error: (...args) => _write('ERROR', args),
}
