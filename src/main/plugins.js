// Plugins del usuario: skills/*.js en userData. API acotada (sin shell directo).
// { name, triggers: [...], run: async (text, tools) => ({ message, speak?, open? }) }
// tools: { open(target) } — resuelve por la escalera launch (whitelist, no arbitrario).
const fs = require('fs')
const path = require('path')

let DIR = ''
let _cache = []

function setSkillsDir(d) {
  DIR = d
  _cache = []
}

function skillsDir() {
  return DIR
}

function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

const EXAMPLE = `// Mi primer plugin de VoxDesk.
// triggers: frases que lo activan (sin tildes da igual). run devuelve { message }.
// tools.open(appOUrl) abre con la escalera segura (mismo que "abre X").
// ¡No hay shell aquí a propósito! Guarda y di "recarga plugins".
module.exports = {
  name: 'ejemplo',
  triggers: ['di hola con estilo'],
  run: async (text, tools) => {
    return { message: '¡Hola con mucho estilo!', speak: true }
  },
}
`

function ensureExample() {
  try {
    if (!DIR) return
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true })
    const f = path.join(DIR, 'ejemplo.js')
    if (!fs.existsSync(f)) fs.writeFileSync(f, EXAMPLE, 'utf8')
  } catch {}
}

function loadAll() {
  _cache = []
  try {
    if (!DIR || !fs.existsSync(DIR)) return _cache
    for (const f of fs.readdirSync(DIR)) {
      if (!f.endsWith('.js')) continue
      const full = path.join(DIR, f)
      try {
        delete require.cache[require.resolve(full)]
        const mod = require(full)
        if (mod && mod.name && Array.isArray(mod.triggers) && typeof mod.run === 'function') {
          _cache.push({ file: f, name: String(mod.name), triggers: mod.triggers.map(String), run: mod.run })
        }
      } catch {}
    }
  } catch {}
  return _cache
}

function match(text) {
  const lower = String(text || '').toLowerCase().trim()
  for (const p of _cache) {
    for (const t of p.triggers) {
      const nt = t.toLowerCase().trim()
      if (nt && new RegExp(`(?<!\\w)${escRe(nt)}(?!\\w)`).test(lower)) return p
    }
  }
  return null
}

async function runPlugin(p, text, tools) {
  try {
    const r = await p.run(text, tools)
    if (typeof r === 'string') return { success: true, message: r, speak: true }
    if (r && typeof r === 'object') {
      if (r.open) {
        try { await tools.open(r.open) } catch {}
      }
      return { success: r.success !== false, message: r.message || 'Hecho', speak: r.speak !== false }
    }
    return { success: false, message: 'El plugin no devolvió nada útil.' }
  } catch (e) {
    return { success: false, message: `El plugin "${p.name}" falló y no rompió nada: ${e.message}` }
  }
}

module.exports = { setSkillsDir, skillsDir, ensureExample, loadAll, match, runPlugin }
