# Descarga Piper (TTS neuronal, MIT) + voces es_MX y es_ES a vendor/ (ignorado por git).
# El instalador las empaqueta; el repo solo guarda este script.
$ErrorActionPreference = 'Stop'
$Root = Join-Path $PSScriptRoot '..'
$Vendor = Join-Path $Root 'vendor'
$PiperDir = Join-Path $Vendor 'piper'
$VoicesDir = Join-Path $Vendor 'voices'
New-Item -ItemType Directory -Path $PiperDir, $VoicesDir -Force | Out-Null

if (!(Test-Path (Join-Path $PiperDir 'piper.exe'))) {
  Write-Host 'Descargando Piper (~22 MB)...'
  $Zip = Join-Path ([System.IO.Path]::GetTempPath()) 'piper_win.zip'
  Invoke-WebRequest -Uri 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip' -OutFile $Zip
  Expand-Archive -Path $Zip -DestinationPath ([System.IO.Path]::GetTempPath() + 'piper_x') -Force
  Copy-Item (([System.IO.Path]::GetTempPath()) + 'piper_x\piper\*') $PiperDir -Recurse -Force
  Remove-Item $Zip -Force
  Remove-Item (([System.IO.Path]::GetTempPath()) + 'piper_x') -Recurse -Force
} else { Write-Host 'Piper ya existe.' }

$Base = 'https://huggingface.co/rhasspy/piper-voices/resolve/main'
$Files = @(
  @('es/es_MX/claude/high/es_MX-claude-high.onnx', 'es_MX-claude-high.onnx'),
  @('es/es_MX/claude/high/es_MX-claude-high.onnx.json', 'es_MX-claude-high.onnx.json'),
  @('es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx', 'es_ES-sharvard-medium.onnx'),
  @('es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx.json', 'es_ES-sharvard-medium.onnx.json'),
  @('es/es_AR/daniela/high/es_AR-daniela-high.onnx', 'es_AR-daniela-high.onnx'),
  @('es/es_AR/daniela/high/es_AR-daniela-high.onnx.json', 'es_AR-daniela-high.onnx.json')
)
# Voces viejas fuera del pack (2, 3 y 4 son las elegidas).
foreach ($old in @('es_MX-ald-medium.onnx', 'es_MX-ald-medium.onnx.json', 'es_ES-davefx-medium.onnx', 'es_ES-davefx-medium.onnx.json')) {
  $p = Join-Path $VoicesDir $old
  if (Test-Path $p) { Remove-Item $p -Force; Write-Host "Fuera: $old" }
}
foreach ($f in $Files) {
  $Dest = Join-Path $VoicesDir $f[1]
  if (!(Test-Path $Dest)) {
    Write-Host "Descargando $($f[1])..."
    Invoke-WebRequest -Uri ($Base + '/' + $f[0]) -OutFile $Dest
  } else { Write-Host "$($f[1]) ya existe." }
}
Write-Host "Listo en $Vendor"
