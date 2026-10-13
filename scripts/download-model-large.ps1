# Descarga el modelo grande Vosk español (~2.3 GB) para precisión.
# Vive en %APPDATA%\ai-desktop-assistant\models (fuera del instalador y del repo).
$ErrorActionPreference = 'Stop'
$ModelName = 'vosk-model-es-0.42'
$Dir = Join-Path $env:APPDATA 'ai-desktop-assistant\models'
$Target = Join-Path $Dir $ModelName

if (Test-Path (Join-Path $Target 'am\final.mdl')) { Write-Host "Modelo grande ya existe en $Target."; exit 0 }
New-Item -ItemType Directory -Path $Dir -Force | Out-Null
$Zip = Join-Path ([System.IO.Path]::GetTempPath()) "$ModelName.zip"
$Url = "https://alphacephei.com/vosk/models/$ModelName.zip"
Write-Host "Descargando $Url (2.3 GB, tarda varios minutos)..."
Invoke-WebRequest -Uri $Url -OutFile $Zip
Write-Host 'Extrayendo...'
Expand-Archive -Path $Zip -DestinationPath $Dir -Force
Remove-Item $Zip -Force
Write-Host "Listo: $Target"
