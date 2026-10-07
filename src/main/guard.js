// Red de seguridad: detecta PowerShell peligroso generado por voz o por la IA.
// Sin dependencias (no requiere electron) para poder probarse con `npm test`.
// ponytail: lista negra por regex = filtro barato, no defensa completa; el freno
// real es el diálogo de confirmación (main.js) + `confirm:` en smart-exec.
const DANGEROUS_PS = [
  /shutdown\b/i, /Restart-Computer\b/i, /Stop-Computer\b/i,
  /Format-Volume\b/i, /Format-Partition\b/i, /Clear-Disk\b/i, /Remove-Partition\b/i,
  /New-LocalUser\b/i, /Remove-LocalUser\b/i, /Add-LocalGroupMember\b/i, /Remove-LocalGroup\b/i,
  /Set-MpPreference\b/i, /Set-ExecutionPolicy\b/i,
  /bcdedit\b/i, /diskpart\b/i,
  /HKLM:/i, /HKEY_LOCAL_MACHINE/i,
  /Remove-Item\b.*-Recurse\b/is,
  /Set-Service\b.*-StartupType/is,
  /Stop-Process\b.*-Force/is,
  /Register-ScheduledTask\b/i,
  // Evasión / descarga / persistencia (típico en código generado)
  /\bIEX\b/i, /Invoke-Expression/i,
  /DownloadString\b/i, /DownloadFile\b/i, /Start-BitsTransfer\b/i,
  /-EncodedCommand\b/i, /EncodedCommand/i, /FromBase64String/i,
  /reg\s+(delete|add)\b/i,
  /vssadmin\s+delete/i, /wbadmin\s+delete/i, /cipher\s+\/w/i,
  /wevtutil\s+\w*\s*clear/i,
  /schtasks\s+\/create/i, /New-Service\b/i,
  /takeown\b/i, /icacls\b/i,
  /net\s+user\b/i,
]

function isDangerous(psCode) {
  if (!psCode) return false
  return DANGEROUS_PS.some(r => r.test(psCode))
}

module.exports = { isDangerous, DANGEROUS_PS }
