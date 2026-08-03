const { exec } = require('child_process')
const os = require('os')
const path = require('path')
const fs = require('fs')

function psStr(s) { return "'" + s.replace(/'/g, "''") + "'" }
function psScript() { return path.join(os.tmpdir(), `_ai_capture_${Date.now()}.ps1`) }

function execute() {
  const outPath = path.join(os.homedir(), 'Desktop', `captura_${Date.now()}.png`)
  const ps = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save(${psStr(outPath)})
$g.Dispose(); $bmp.Dispose()`

  const psFile = psScript()
  fs.writeFileSync(psFile, ps, 'utf8')
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { timeout: 10000 }, (err) => {
      try { fs.unlinkSync(psFile) } catch {}
      if (err) resolve({ success: false, message: 'Error al capturar pantalla', speak: true })
      else {
        exec(`start "${outPath}"`, () => {})
        resolve({ success: true, message: `Captura guardada en escritorio`, speak: true })
      }
    })
  })
}

module.exports = { execute }
