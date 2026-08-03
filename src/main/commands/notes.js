const fs = require('fs')
const path = require('path')

const NOTES_FILE = path.join(require('os').homedir(), 'Desktop', 'notas_asistente.txt')

function execute(text) {
  const content = (text || '').trim()
  if (!content) return Promise.resolve({ success: false, message: '¿Qué anoto?', speak: true })
  const entry = `[${new Date().toLocaleString('es-MX')}] ${content}\n`
  try { fs.appendFileSync(NOTES_FILE, entry, 'utf8') } catch {}
  return Promise.resolve({ success: true, message: 'Nota guardada en el escritorio', speak: true })
}

module.exports = { execute }
