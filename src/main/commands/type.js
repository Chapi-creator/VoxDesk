const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

function typeTemp(name) { return path.join(os.tmpdir(), `${name}_${Date.now()}.tmp`) }

function execute(text) {
  if (!text || !text.trim()) return Promise.resolve({ success: false, message: '¿Qué texto quieres que escriba?' })

  const txtFile = typeTemp('_ai_type_text')
  const psFile = typeTemp('_ai_type_ps')
  fs.writeFileSync(txtFile, text, 'utf8')

  const ps = `
$raw = Get-Content "${txtFile}" -Raw
$escaped = [regex]::Replace($raw, '([+^%~(){}\[\]]|""|~)', { param($m) "{$($m.Groups[1].Value)}" })
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait($escaped)
Remove-Item "${txtFile}" -Force -ErrorAction SilentlyContinue
`

  fs.writeFileSync(psFile, ps, 'utf8')

  return new Promise((resolve) => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { timeout: 5000 }, (err) => {
      try { fs.unlinkSync(psFile) } catch {}
      try { fs.unlinkSync(txtFile) } catch {}
      if (err) resolve({ success: false, message: 'Error al escribir' })
      else resolve({ success: true, message: `Escribiendo texto...`, speak: true })
    })
  })
}

module.exports = { execute }
