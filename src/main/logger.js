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
  // Rotación barata: a 1MB, app.log -> app.1.log -> app.2.log (máx ~3MB).
  try {
    const f = path.join(_logDir, 'app.log')
    try {
      if (fs.statSync(f).size > 1024 * 1024) {
        try { fs.unlinkSync(path.join(_logDir, 'app.2.log')) } catch {}
        try { fs.renameSync(path.join(_logDir, 'app.1.log'), path.join(_logDir, 'app.2.log')) } catch {}
        try { fs.renameSync(f, path.join(_logDir, 'app.1.log')) } catch {}
      }
    } catch {}
    fs.appendFileSync(f, msg + '\n')
  } catch {}
}

module.exports = {
  init,
  info: (...args) => _write('INFO', args),
  warn: (...args) => _write('WARN', args),
  error: (...args) => _write('ERROR', args),
}
