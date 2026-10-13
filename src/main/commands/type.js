const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

function typeTemp(name) { return path.join(os.tmpdir(), `${name}_${Date.now()}.tmp`) }

// Trocea para no saturar SendKeys (400 chars + pausa).
function chunkText(text, n = 400) {
  const t = String(text || '')
  const out = []
  for (let i = 0; i < t.length; i += n) out.push(t.slice(i, i + n))
  return out.filter(Boolean)
}

function execute(text) {
  if (!text || !text.trim()) return Promise.resolve({ success: false, message: '¿Qué texto quieres que escriba?' })

  const txtFile = typeTemp('_ai_type_text')
  const psFile = typeTemp('_ai_type_ps')
  const chunks = chunkText(text.trim())
  fs.writeFileSync(txtFile, JSON.stringify(chunks), 'utf8')

  const ps = `
$chunks = Get-Content "${txtFile}" -Raw | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
foreach ($c in $chunks) {
  $escaped = [regex]::Replace($c, '([+^%~(){}\[\]]|""|~)', { param($m) "{$($m.Groups[1].Value)}" })
  [System.Windows.Forms.SendKeys]::SendWait($escaped)
  Start-Sleep -Milliseconds 250
}
Remove-Item "${txtFile}" -Force -ErrorAction SilentlyContinue
`

  fs.writeFileSync(psFile, ps, 'utf8')

  return new Promise((resolve) => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { timeout: 15000 + chunks.length * 5000 }, (err) => {
      try { fs.unlinkSync(psFile) } catch {}
      try { fs.unlinkSync(txtFile) } catch {}
      if (err) resolve({ success: false, message: 'Error al escribir' })
      else resolve({ success: true, message: `Escribiendo texto...`, speak: true })
    })
  })
}

module.exports = { execute, chunkText }
