const fs = require('fs')
const path = require('path')

let DIR = ''
let FILE = ''

function _ensureDir() {
  if (!DIR) { DIR = process.env.APPDATA || require('os').homedir(); FILE = path.join(DIR, 'memory.json') }
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true })
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{"preferences":{},"custom_commands":[],"notes":[],"macros":{},"reminders":[]}', 'utf8')
}

function setUserDataPath(p) {
  DIR = p
  FILE = path.join(DIR, 'memory.json')
  _ensureDir()
}

function load() {
  _ensureDir()
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return { preferences: {}, custom_commands: [], notes: [], macros: {} } }
}

function save(data) {
  _ensureDir()
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8')
}

function get(key) { const d = load(); return d.preferences[key] }
function set(key, value) { const d = load(); d.preferences[key] = value; save(d) }
function del(key) { const d = load(); delete d.preferences[key]; save(d) }
function list() {
  const d = load()
  const parts = []
  for (const [k, v] of Object.entries(d.preferences)) parts.push(`${k}: ${v}`)
  if (d.custom_commands.length) parts.push('Comandos aprendidos: ' + d.custom_commands.map(c => c.trigger).join(', '))
  return parts.length ? parts.join(' | ') : 'No recuerdo nada aún'
}
function addCommand(trigger, action, reply) {
  const d = load()
  d.custom_commands.push({ trigger: trigger.toLowerCase().trim(), action, reply: reply || 'Ejecutando ' + trigger })
  save(d)
}
function removeCommand(trigger) {
  const d = load()
  const before = d.custom_commands.length
  d.custom_commands = d.custom_commands.filter(c => c.trigger !== trigger.toLowerCase().trim())
  save(d)
  return d.custom_commands.length < before
}
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function matchCustom(text) {
  const d = load()
  const lower = text.toLowerCase().trim()
  for (const c of d.custom_commands) {
    // Fase 6: bordes de palabra, no substring ("luz" no matchea "luces")
    if (new RegExp(`(?<!\\w)${escRe(c.trigger)}(?!\\w)`).test(lower)) return c
  }
  return null
}

let _recording = false

function startRecording() { _recording = true }
function stopRecording() { _recording = false }
function isRecording() { return _recording }

function saveMacro(name, commands) {
  const d = load()
  if (!d.macros) d.macros = {}
  d.macros[name.toLowerCase().trim()] = commands
  save(d)
}

function loadMacro(name) {
  const d = load()
  return d.macros ? d.macros[name.toLowerCase().trim()] : null
}

function deleteMacro(name) {
  const d = load()
  if (d.macros && d.macros[name.toLowerCase().trim()]) { delete d.macros[name.toLowerCase().trim()]; save(d); return true }
  return false
}

function listMacros() {
  const d = load()
  return d.macros ? Object.keys(d.macros) : []
}

let _reminderId = Date.now()

function saveReminder(message, timestamp) {
  const d = load()
  if (!d.reminders) d.reminders = []
  const id = ++_reminderId
  d.reminders.push({ id, message, timestamp })
  save(d)
  return id
}

function removeReminder(id) {
  const d = load()
  if (!d.reminders) return
  d.reminders = d.reminders.filter(r => r.id !== id)
  save(d)
}

function listReminders() {
  const d = load()
  return d.reminders || []
}

module.exports = { setUserDataPath, get, set, del, list, addCommand, removeCommand, matchCustom, startRecording, stopRecording, isRecording, saveMacro, loadMacro, deleteMacro, listMacros, saveReminder, removeReminder, listReminders }