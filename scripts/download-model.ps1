# Descarga el modelo de voz Vosk (español) necesario para `npm start` (vía wake.py)
# y para compilar wake.exe (`npm run build:wake`). Solo se descarga una vez.
# ponytail: un .ps1 porque el repo es solo-Windows y Expand-Archive ya viene con el SO.
$ErrorActionPreference = 'Stop'
$ModelName = 'vosk-model-small-es-0.42'
$ModelDir = Join-Path $PSScriptRoot '..' 'src' 'main' 'vosk-model'
$Target = Join-Path $ModelDir $ModelName

if (Test-Path $Target) { Write-Host "Modelo ya existe en $Target, nada que hacer."; exit 0 }

$Zip = Join-Path ([System.IO.Path]::GetTempPath()) "$ModelName.zip"
$Url = "https://alphacephei.com/vosk/models/$ModelName.zip"
Write-Host "Descargando $Url ..."
Invoke-WebRequest -Uri $Url -OutFile $Zip
Write-Host 'Extrayendo...'
if (!(Test-Path $ModelDir)) { New-Item -ItemType Directory -Path $ModelDir | Out-Null }
Expand-Archive -Path $Zip -DestinationPath $ModelDir -Force
Remove-Item $Zip -Force
Write-Host "Listo: $Target"
