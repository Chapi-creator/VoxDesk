const fs = require('fs')
const path = require('path')
const memory = require('../memory')

const K = 'vox_notes'

function all() {
  const d = memory.get(K)
  return Array.isArray(d) ? d : []
}

function saveAll(notes) {
  memory.set(K, notes)
}

function addNote(text) {
  const notes = all()
  const id = notes.length ? Math.max(...notes.map(n => n.id)) + 1 : 1
  notes.push({ id, text: String(text).trim().slice(0, 500), at: Date.now() })
  saveAll(notes)
  return id
}

function listNotes() {
  return all()
}

function readNote(n) {
  return all().find(x => x.id === Number(n)) || null
}

function deleteNote(n) {
  const notes = all()
  const i = notes.findIndex(x => x.id === Number(n))
  if (i < 0) return false
  notes.splice(i, 1)
  saveAll(notes)
  return true
}

function searchNotes(q) {
  const needle = String(q || '').toLowerCase().trim()
  if (!needle) return []
  return all().filter(n => n.text.toLowerCase().includes(needle))
}

function exportNotes() {
  const file = path.join(require('os').homedir(), 'Desktop', 'notas_asistente.txt')
  const body = all().map(n => `[${new Date(n.at).toLocaleString('es-MX')}] (#${n.id}) ${n.text}`).join('\n')
  fs.writeFileSync(file, body || '(sin notas)', 'utf8')
  return file
}

function cleanNew(text) {
  return String(text || '')
    .replace(/^(una\s+nota|nota|que\s+diga|que|de\s+que)\s+/i, '')
    .replace(/^(una\s+nota|nota|que\s+diga|que|de\s+que)\s+/i, '')
    .trim()
}

function execute(text) {
  const t = String(text || '').trim()
  let m
  if (/^(lista|muestra|dime|lee)(\s+(mis|las))?\s+notas?$/.test(t)) {
    const notes = listNotes()
    if (!notes.length) return Promise.resolve({ success: true, message: 'No tienes notas.', speak: true })
    return Promise.resolve({ success: true, message: notes.map(n => `${n.id}. ${n.text}`).join('. '), speak: true })
  }
  if ((m = /^(lee|dime)(\s+la)?\s+nota\s+(\d+)$/.exec(t))) {
    const n = readNote(m[3])
    if (!n) return Promise.resolve({ success: false, message: `No hay nota ${m[3]}.`, speak: true })
    return Promise.resolve({ success: true, message: `Nota ${n.id}: ${n.text}`, speak: true })
  }
  if ((m = /^(borra|elimina)(\s+la)?\s+nota\s+(\d+)$/.exec(t))) {
    if (!deleteNote(m[3])) return Promise.resolve({ success: false, message: `No hay nota ${m[3]}.`, speak: true })
    return Promise.resolve({ success: true, message: `Nota ${m[3]} borrada.`, speak: true })
  }
  if ((m = /^(busca|buscar)\s+(.+?)\s+en\s+(mis\s+)?notas?$/.exec(t) || /nota\s+(que\s+)?(contenga|contiene|con|sobre)\s+(.+)/.exec(t))) {
    const q = (m[2] || m[4] || '').trim()
    const hits = searchNotes(q)
    if (!hits.length) return Promise.resolve({ success: true, message: `Nada sobre "${q}" en tus notas.`, speak: true })
    return Promise.resolve({ success: true, message: hits.map(n => `${n.id}. ${n.text}`).join('. '), speak: true })
  }
  if (/^exporta(\s+(mis|las))?\s+notas?$/.test(t)) {
    const file = exportNotes()
    return Promise.resolve({ success: true, message: `Notas exportadas al escritorio.`, speak: true })
  }
  const content = cleanNew(t)
  if (!content) return Promise.resolve({ success: false, message: '¿Qué anoto?', speak: true })
  const id = addNote(content)
  return Promise.resolve({ success: true, message: `Nota ${id} guardada.`, speak: true })
}

module.exports = { execute, addNote, listNotes, readNote, deleteNote, searchNotes, exportNotes }
