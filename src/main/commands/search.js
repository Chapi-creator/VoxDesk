const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

function psScript() { return path.join(os.tmpdir(), `_ai_search_${Date.now()}.ps1`) }

const LOCATIONS = {
  documentos: '$env:USERPROFILE\\Documents',
  escritorio: '$env:USERPROFILE\\Desktop',
  descargas: '$env:USERPROFILE\\Downloads',
}

function execute(text) {
  let term = text.trim()
  if (!term) return Promise.resolve({ success: false, message: '¿Qué archivo buscas?' })

  let dirs = Object.values(LOCATIONS)
  const skip = ['en', 'del', 'la', 'el', 'las', 'los', 'carpeta', 'carpetas', 'directorio', 'archivo', 'archivos', 'una', 'un']
  const words = term.split(/\s+/)

  for (let i = 0; i < words.length; i++) {
    if (LOCATIONS[words[i]]) {
      dirs = [LOCATIONS[words[i]]]
      term = words.slice(i + 1).filter(w => !skip.includes(w)).join(' ')
      break
    }
  }

  if (!term) return Promise.resolve({ success: false, message: '¿Qué archivo buscas?' })

  const sanitized = term.replace(/'/g, "''").replace(/[;$&|<>]/g, '')
  const ps = `$dirs = @(${dirs.join(', ')})
$results = @()
foreach ($dir in $dirs) {
  if (Test-Path $dir) {
    $results += Get-ChildItem -Path $dir -Filter "*${sanitized}*" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 10 -ExpandProperty FullName
  }
}
if ($results.Count -eq 0) { Write-Output "__NOT_FOUND__" }
else { Write-Output ($results -join "|") }`

  const psFile = psScript()
  fs.writeFileSync(psFile, ps, 'utf8')

  return new Promise((resolve) => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { timeout: 10000 }, (err, stdout) => {
      try { fs.unlinkSync(psFile) } catch {}
      if (err) { resolve({ success: false, message: 'Error al buscar' }); return }
      const output = stdout.trim()
      if (output === '__NOT_FOUND__') {
        resolve({ success: false, message: `No encontré "${term}"` })
      } else {
        const files = output.split('|').filter(Boolean)
        const names = files.map(f => path.basename(f)).join(', ')
        resolve({ success: true, message: `Encontré ${files.length}: ${names}` })
      }
    })
  })
}

module.exports = { execute }
