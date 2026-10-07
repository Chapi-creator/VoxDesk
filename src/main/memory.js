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

// Fase 16B1: caché de intenciones aprendidas (frase normalizada -> acción).
const CACHE_MAX = 200

function getCache() {
  const d = load()
  return d.cache || {}
}

function saveCachePair(normText, action) {
  if (!normText || !action) return
  const d = load()
  d.cache = d.cache || {}
  const k = d.cache[normText]
  if (k) { k.uses++; k.action = action; k.at = Date.now() }
  else d.cache[normText] = { action, uses: 1, at: Date.now() }
  const keys = Object.keys(d.cache)
  if (keys.length > CACHE_MAX) {
    keys.sort((a, b) => d.cache[a].at - d.cache[b].at)
    for (const old of keys.slice(0, keys.length - CACHE_MAX)) delete d.cache[old]
  }
  save(d)
}

function bumpCache(normText, delta) {
  const d = load()
  if (!d.cache || !d.cache[normText]) return false
  d.cache[normText].uses = Math.max(0, d.cache[normText].uses + delta)
  if (d.cache[normText].uses === 0) delete d.cache[normText]
  save(d)
  return true
}

function removeCache(normText) {
  const d = load()
  if (d.cache && d.cache[normText]) { delete d.cache[normText]; save(d); return true }
  return false
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

module.exports = { setUserDataPath, get, set, del, list, addCommand, removeCommand, matchCustom, getCache, saveCachePair, bumpCache, removeCache, startRecording, stopRecording, isRecording, saveMacro, loadMacro, deleteMacro, listMacros, saveReminder, removeReminder, listReminders }