const { exec, execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function sanitize(str) { return str.replace(/[&|^<>";\r\n]/g, '') }

const USER = process.env['USERPROFILE'] || ''
const PF = process.env['ProgramFiles'] || 'C:\\Program Files'
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
const LOCAL = process.env['LOCALAPPDATA'] || ''
const START_MENU = path.join(process.env['APPDATA'] || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
const START_MENU_ALL = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'

const BROWSERS = ['brave', 'chrome', 'firefox', 'edge', 'msedge']

const APP_ALIASES = {
  chrome: 'chrome', 'google chrome': 'chrome',
  brave: 'brave',
  firefox: 'firefox', 'mozilla firefox': 'firefox',
  edge: 'msedge', 'microsoft edge': 'msedge',
  explorador: 'explorer',
  cmd: 'cmd', 'simbolo del sistema': 'cmd',
  terminal: 'wt', powershell: 'powershell',
  vscode: 'code', 'visual studio code': 'code',
  calculadora: 'calc',
  bloc: 'notepad', 'bloc de notas': 'notepad', notas: 'notepad',
  spotify: 'spotify',
  discord: 'discord',
  steam: 'steam',
  word: 'winword', excel: 'excel', powerpoint: 'powerpnt', outlook: 'outlook',
  paint: 'mspaint',
  capturas: 'snippingtool', recortes: 'snippingtool',
  configuracion: 'ms-settings:', ajustes: 'ms-settings:',
  musica: 'groovemusic', 'windows media player': 'wmplayer',
  fotos: 'ms-photos:', 'fotos de windows': 'ms-photos:',
  correo: 'outlook', mail: 'outlook',
  maps: 'bingmaps:', mapas: 'bingmaps:',
  youtube: 'https://youtube.com',
  github: 'https://github.com',
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  blender: 'blender',
  obs: 'obs64',
  epic: 'com.epicgames.launcher', 'epic games': 'com.epicgames.launcher',
  gimp: 'gimp-2.10',
  krita: 'krita',
  aseprite: 'aseprite',
  roblox: 'roblox',
  // Comunicación
  slack: 'slack', teams: 'teams', 'microsoft teams': 'teams',
  zoom: 'zoom', skype: 'skype',
  // Adobe / Creativos
  photoshop: 'photoshop', illustrator: 'illustrator', premiere: 'premiere',
  'after effects': 'afterfx', acrobat: 'acrobat', 'adobe reader': 'acrobat',
  figma: 'figma', inkscape: 'inkscape',
  // Multimedia
  vlc: 'vlc', netflix: 'netflix',
  // Productividad
  notion: 'notion', trello: 'trello', 'one note': 'onenote', onenote: 'onenote',
  evernote: 'evernote', 'todoist': 'todoist',
  // Dev tools
  postman: 'postman', docker: 'docker',
  'vs code': 'code', 'vscode insiders': 'code-insiders',
  sublime: 'sublime_text', 'sublime text': 'sublime_text',
  notepadplusplus: 'notepad++', 'notepad plus plus': 'notepad++',
  nodo: 'node', python: 'python',
  // System tools
  regedit: 'regedit', registro: 'regedit',
  servicios: 'services.msc', services: 'services.msc',
  'administrador de discos': 'diskmgmt.msc', discos: 'diskmgmt.msc',
  'administrador de dispositivos': 'devmgmt.msc', dispositivos: 'devmgmt.msc',
  firewall: 'wf.msc',
  'visor de sucesos': 'eventvwr.msc', eventos: 'eventvwr.msc',
  monitor: 'perfmon', 'monitor de rendimiento': 'perfmon',
  recursos: 'resmon', 'monitor de recursos': 'resmon',
  // Utilidades
  '7-zip': '7zFM', sevenzip: '7zFM',
  winrar: 'winrar',
  teamviewer: 'teamviewer', anydesk: 'anydesk',
  virtualbox: 'VirtualBox', vmware: 'vmware',
  androidstudio: 'studio64',
  // Social / Web
  twitter: 'https://twitter.com', x: 'https://x.com',
  facebook: 'https://facebook.com', instagram: 'https://instagram.com',
  linkedin: 'https://linkedin.com', reddit: 'https://reddit.com',
  twitch: 'https://twitch.com',
  amazon: 'https://amazon.com', 'google drive': 'https://drive.google.com',
  drive: 'https://drive.google.com', docs: 'https://docs.google.com',
  gmail: 'https://mail.google.com',
  // Juegos
  minecraft: 'minecraft', epicgames: 'com.epicgames.launcher',
  battle: 'battle.net', 'battle net': 'battle.net',
}

const BRAVE_PATHS = [
  path.join(PF, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  path.join(PF86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  path.join(LOCAL, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
]

const FOLDER_LOCATIONS = {
  documentos: path.join(USER, 'Documents'),
  'mis documentos': path.join(USER, 'Documents'),
  escritorio: path.join(USER, 'Desktop'),
  descargas: path.join(USER, 'Downloads'),
}

function walkDir(dir, maxDepth, _depth = 0) {
  if (_depth > maxDepth) return []
  try {
    const results = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) results.push(...walkDir(full, maxDepth, _depth + 1))
      else if (entry.isFile()) results.push(full)
    }
    return results
  } catch { return [] }
}

function searchFileSystem(name) {
  const lower = name.toLowerCase()

  for (const p of BRAVE_PATHS) if (lower.includes('brave') && fs.existsSync(p)) return p

  try {
    const out = execFileSync('where', [name], { timeout: 2000, encoding: 'utf8' })
    const line = out?.split('\n').map(l => l.trim()).find(l => l && !l.includes('could not'))
    if (line && fs.existsSync(line)) return line
  } catch {}

  for (const startDir of [START_MENU, START_MENU_ALL]) {
    if (!fs.existsSync(startDir)) continue
    try {
      const match = walkDir(startDir, 4).find(f => {
        const base = path.basename(f, path.extname(f)).toLowerCase()
        return base.includes(lower) && (f.endsWith('.lnk') || f.endsWith('.exe'))
      })
      if (match) return match
    } catch {}
  }

  const OFFICE_DIRS = ['Microsoft Office\\root\\Office16', 'Microsoft Office\\Office16', 'Microsoft Office\\root\\Office15', 'Microsoft Office\\Office15']
  const searchDirs = [PF, PF86, LOCAL, path.join(LOCAL, 'Programs'), path.join(PF, 'WindowsApps'),
    ...OFFICE_DIRS.map(d => path.join(PF, d)), ...OFFICE_DIRS.map(d => path.join(PF86, d))]
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue
    try {
      const match = walkDir(dir, 4).find(f => {
        if (!f.endsWith('.exe')) return false
        const base = path.basename(f, '.exe').toLowerCase()
        return base.includes(lower) || lower.includes(base)
      })
      if (match) return match
    } catch {}
  }

  return null
}

function resolveFolderPath(text) {
  let folderName = text.toLowerCase().replace(/^(abre |abrir |el |la |lo |un |una )/, '').trim()
  let basePath = path.join(USER, 'Documents')

  for (const [key, dir] of Object.entries(FOLDER_LOCATIONS)) {
    if (folderName.includes(key)) {
      basePath = dir
      folderName = folderName.replace(key, '').trim()
      break
    }
  }

  const skip = ['carpeta', 'carpetas', 'directorio', 'en', 'del', 'la', 'el', 'las', 'los', 'de']
  folderName = folderName.split(/\s+/).filter(w => !skip.includes(w)).join(' ')
  return path.join(basePath, folderName)
}

function resolveAlias(name) {
  const lower = name.toLowerCase().trim()
  if (APP_ALIASES[lower]) return APP_ALIASES[lower]
  const words = lower.split(/\s+/)
  for (let i = words.length; i > 0; i--) {
    if (APP_ALIASES[words.slice(0, i).join(' ')]) return APP_ALIASES[words.slice(0, i).join(' ')]
  }
  return lower
}

function isBrowser(name) {
  return BROWSERS.includes(name.toLowerCase())
}

const SITES = {
  youtube: 'https://youtube.com', reddit: 'https://reddit.com',
  twitter: 'https://twitter.com', x: 'https://x.com',
  facebook: 'https://facebook.com', instagram: 'https://instagram.com',
  linkedin: 'https://linkedin.com', twitch: 'https://twitch.tv',
  gmail: 'https://mail.google.com', drive: 'https://drive.google.com',
  docs: 'https://docs.google.com', github: 'https://github.com',
  stackoverflow: 'https://stackoverflow.com', amazon: 'https://amazon.com',
  whatsapp: 'https://web.whatsapp.com', netflix: 'https://netflix.com',
  spotify: 'https://open.spotify.com', tiktok: 'https://tiktok.com',
  wikipedia: 'https://es.wikipedia.org', mercadolibre: 'https://mercadolibre.com',
  google: 'https://www.google.com', maps: 'https://maps.google.com',
  noticias: 'https://news.google.com',
}

function extractSiteUrl(remaining) {
  const t = (remaining || '').trim()
  if (!t) return null
  const verbs = /(abreme|abrir|poner|abre|pon|dime|mete)/gi
  let last = null
  let m
  while ((m = verbs.exec(t))) last = m
  let site = last ? t.slice(last.index + last[0].length).trim() : t
  site = site.replace(/^(el|la|los|las|un|una|en|a)\s+/i, '').trim()
  if (!site) return null
  if (looksLikeUrl(site)) return sanitize(site.match(/^https?:\/\//i) ? site : `https://${site}`)
  const key = site.toLowerCase().replace(/\.com$/, '')
  if (SITES[key]) return SITES[key]
  if (/^\S+$/.test(site)) return `https://${site.toLowerCase()}.com`
  return null
}

function openInBrowser(target, url) {
  return new Promise(resolve => {
    const found = searchFileSystem(target)
    const cmd = found ? `"${found}" "${url}"` : `${target} "${url}"`
    exec(cmd, { timeout: 3000, windowsHide: true }, err => {
      if (err) {
        exec(`start "" "${url}"`, { windowsHide: true }, e2 => {
          resolve({ success: !e2, message: e2 ? `No pude abrir ${url}` : `Abriendo ${url}` })
        })
      } else {
        resolve({ success: true, message: `Abriendo ${url} en ${target}` })
      }
    })
  })
}

function looksLikeUrl(str) {
  return /^https?:\/\//i.test(str) || /^[\w-]+\.[a-z]{2,}(\/|$)/i.test(str)
}

function execute(text) {
  const raw = text.toLowerCase().trim()
  if (raw.startsWith('carpeta') || (raw.includes('carpeta') && Object.keys(FOLDER_LOCATIONS).some(k => raw.includes(k))) || Object.keys(FOLDER_LOCATIONS).includes(raw)) {
    const folderPath = sanitize(resolveFolderPath(raw))
    return new Promise((resolve) => {
      exec(`start "" "${folderPath}"`, { windowsHide: true }, (err) => {
        resolve({ success: !err, message: err ? `No pude abrir "${folderPath}"` : `Abriendo carpeta` })
      })
    })
  }

  let appName = sanitize(raw.replace(/^(el |la |lo |un |una |unos |unas )/, ''))
  const words = appName.split(/\s+/)
  let target, matchedLen = words.length
  if (APP_ALIASES[appName]) {
    target = APP_ALIASES[appName]
  } else {
    for (let i = words.length; i > 0; i--) {
      const candidate = words.slice(0, i).join(' ')
      if (APP_ALIASES[candidate]) { target = APP_ALIASES[candidate]; matchedLen = i; break }
    }
    if (!target) { target = sanitize(appName); matchedLen = 1 }
  }

  if (isBrowser(target)) {
    const remaining = words.slice(matchedLen).join(' ')
    const url = extractSiteUrl(remaining)
    if (url) return openInBrowser(target, url)
  }

  return new Promise((resolve) => {
    if (target.startsWith('ms-')) {
      exec(`start ${target}`, { windowsHide: true }, (err) => {
        resolve({ success: !err, message: err ? `No pude abrir "${appName}"` : `Abriendo ${appName}` })
      })
      return
    }

    if (looksLikeUrl(target)) {
      exec(`start "" "${target}"`, { windowsHide: true }, (err) => {
        resolve({ success: !err, message: err ? `No pude abrir "${target}"` : `Abriendo ${target.split('/')[0]}` })
      })
      return
    }

    exec(`"${target}"`, { timeout: 3000, windowsHide: true }, (err) => {
      if (err) {
        exec(`start "" "${target}"`, { timeout: 3000, shell: true, windowsHide: true }, (e2) => {
          if (e2) {
            const found = target.endsWith('.lnk') ? target : searchFileSystem(target)
            if (found) {
              const cmd = found.endsWith('.lnk') ? `start "" "${found}"` : `"${found}"`
              exec(cmd, { windowsHide: true }, (e3) => {
                resolve({ success: !e3, message: e3 ? `No pude abrir "${appName}"` : `Abriendo ${appName}` })
              })
            } else {
              resolve({ success: false, message: `No pude abrir "${appName}"` })
            }
          } else {
            resolve({ success: true, message: `Abriendo ${appName}` })
          }
        })
      } else {
        resolve({ success: true, message: `Abriendo ${appName}` })
      }
    })
  })
}

module.exports = { execute, resolveAlias, isBrowser, looksLikeUrl }
