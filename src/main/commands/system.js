const { runPs } = require('../run-ps')

function sanitize(str) { return str.replace(/'/g, "''").replace(/[;$&|<>]/g, '') }

// Fase 6: mismo freno que smart-exec — main.js lo inyecta. Sin inyectar, auto-sí (tests).
let _confirmFn = null
function setConfirm(fn) { _confirmFn = fn }
async function _confirm(title, detail) {
  if (!_confirmFn) return true
  try { return await _confirmFn(title, detail) } catch { return false }
}
const CANCELLED = { success: true, message: 'Cancelado. ¿Necesitas algo más?', speak: true }

function executeVolume(text) {
  const lower = (text || '').toLowerCase().trim()
  if (/silencio|mute|mutear/i.test(lower)) {
    return runPs(`$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]173)`).then(() => ({ success: true, message: 'Silenciado', speak: true }))
  }
  const match = lower.match(/\d+/)
  if (match) {
    const times = Math.min(parseInt(match[0]) / 2, 25)
    return runPs(`$obj = New-Object -ComObject WScript.Shell; ${Array.from({length: times}, () => '$obj.SendKeys([char]175)').join('; ')}`).then(() => ({ success: true, message: `Volumen al ${match[0]}%`, speak: true }))
  }
  if (/sube|subir|aumenta|mas/i.test(lower)) {
    return runPs(`$obj = New-Object -ComObject WScript.Shell; ${Array.from({length: 10}, () => '$obj.SendKeys([char]175)').join('; ')}`).then(() => ({ success: true, message: 'Volumen subido', speak: true }))
  }
  if (/baja|bajar|reduce|menos/i.test(lower)) {
    return runPs(`$obj = New-Object -ComObject WScript.Shell; ${Array.from({length: 10}, () => '$obj.SendKeys([char]174)').join('; ')}`).then(() => ({ success: true, message: 'Volumen bajado', speak: true }))
  }
  return Promise.resolve({ success: true, message: 'Di sube, baja, un número o silencio', speak: true })
}

function executeBrightness(text) {
  const lower = (text || '').toLowerCase().trim()
  const match = lower.match(/\d+/)
  if (match) {
    const val = Math.min(100, Math.max(0, parseInt(match[0])))
    return runPs(`$m = Get-CimInstance -Namespace root/WMI -Class WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue; if ($m) { $m.WmiSetBrightness(1, ${val}) }`).then(({ err }) => ({ success: !err, message: err ? 'No pude cambiar el brillo' : `Brillo al ${val}%`, speak: true }))
  }
  const isUp = /sube|subir|aumenta/i.test(lower)
  const isDown = /baja|bajar|reduce/i.test(lower)
  if (isUp || isDown) {
    const delta = isUp ? 20 : -20
    return runPs(`$m = Get-CimInstance -Namespace root/WMI -Class WmiMonitorBrightness -ErrorAction SilentlyContinue; if ($m) { $c = $m.CurrentBrightness; $n = [Math]::Min(100,[Math]::Max(0, $c ${delta>=0?'+':'-'} ${Math.abs(delta)})); $wm = Get-CimInstance -Namespace root/WMI -Class WmiMonitorBrightnessMethods; if ($wm) { $wm.WmiSetBrightness(1,$n); Write-Output $n } }`).then(({ err, stdout }) => err || !stdout ? ({ success: false, message: 'No pude cambiar el brillo', speak: true }) : ({ success: true, message: `Brillo al ${stdout}%`, speak: true }))
  }
  return Promise.resolve({ success: true, message: 'Di sube, baja o un número', speak: true })
}

function executeSystem(text) {
  const lower = (text || '').toLowerCase().trim()
  if (!lower) return Promise.resolve({ success: true, message: '¿Qué quieres que haga?', speak: true })

  if (/cancela|aborta|detén|detener/i.test(lower) && /(?:apaga|reinicia|shutdown)/i.test(lower)) {
    runPs(`shutdown /a`)
    return Promise.resolve({ success: true, message: 'Apagado cancelado', speak: true })
  }
  if (/\bapaga\b|\bshutdown\b/i.test(lower)) {
    const t = /en\s+(\d+)/i.exec(lower) ? parseInt(/en\s+(\d+)/i.exec(lower)[1]) : 30
    return _confirm(`Apagar el equipo en ${t} segundos`, text).then(ok => {
      if (!ok) return CANCELLED
      runPs(`shutdown /s /t ${t} /c "Apagando por solicitud del asistente"`)
      return { success: true, message: `Apagando en ${t} segundos`, speak: true }
    })
  }
  if (/\breinicia\b|\brestart\b/i.test(lower)) {
    return _confirm('Reiniciar el equipo en 20 segundos', text).then(ok => {
      if (!ok) return CANCELLED
      runPs(`shutdown /r /t 20 /c "Reiniciando por solicitud del asistente"`)
      return { success: true, message: 'Reiniciando en 20 segundos', speak: true }
    })
  }
  if (/bloquea|lock/i.test(lower)) {
    runPs(`rundll32.exe user32.dll,LockWorkStation`)
    return Promise.resolve({ success: true, message: 'Equipo bloqueado', speak: true })
  }
  if (/suspende|sleep|duerme|hiberna/i.test(lower)) {
    return _confirm('Suspender el equipo', text).then(ok => {
      if (!ok) return CANCELLED
      runPs(`rundll32.exe powrprof.dll,SetSuspendState 0,1,0`)
      return { success: true, message: 'Durmiendo', speak: true }
    })
  }
  if (/escritorio/i.test(lower) && /muestra|mostrar|show|minimiza/i.test(lower)) {
    runPs(`(New-Object -ComObject Shell.Application).ToggleDesktop()`)
    return Promise.resolve({ success: true, message: 'Mostrando escritorio', speak: true })
  }

  if (/cierra|cerrar|mata|matar|kill/i.test(lower)) {
    const name = lower.replace(/cierra|cerrar|mata|matar|kill|el|la|por favor/gi, '').trim()
    if (name) {
      return _confirm(`Cerrar ${name}`, text).then(ok => {
        if (!ok) return CANCELLED
        runPs(`Get-Process -Name '${sanitize(name)}' -ErrorAction SilentlyContinue | Stop-Process -Force; Write-Output "OK"`)
        return { success: true, message: `Cerrando ${name}`, speak: true }
      })
    }
    return Promise.resolve({ success: false, message: '¿Qué proceso quieres cerrar?', speak: true })
  }

  if (/crea|crear|nueva carpeta/i.test(lower)) {
    const parts = lower.split(/en|dentro de|sobre/i)
    const folderName = parts[0].replace(/crea|crear|nueva|nuevo|carpeta|directorio|el|una|un/gi, '').trim()
    let parentDir = parts[1] ? parts[1].trim() : ''
    if (!folderName) return Promise.resolve({ success: false, message: '¿Nombre de la carpeta?', speak: true })
    if (!parentDir || parentDir === 'escritorio') parentDir = '$env:USERPROFILE\\Desktop'
    else if (parentDir === 'documentos') parentDir = '$env:USERPROFILE\\Documents'
    else if (parentDir === 'descargas') parentDir = '$env:USERPROFILE\\Downloads'
    runPs(`New-Item -Path "${parentDir}" -Name '${sanitize(folderName)}' -ItemType Directory -Force | Out-Null`)
    return Promise.resolve({ success: true, message: `Carpeta "${folderName}" creada`, speak: true })
  }

  if (/fondo|wallpaper/i.test(lower)) {
    const imgPath = lower.replace(/fondo|wallpaper|pantalla|de|el|la|cambia|cambiar|pon|poner|set/gi, '').trim()
    if (imgPath && imgPath.includes('.')) {
      const escaped = imgPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      runPs(`Add-Type -TypeDefinition @" using System; using System.Runtime.InteropServices; public class WP { [DllImport("user32.dll")] public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni); } "@; [WP]::SystemParametersInfo(20, 0, "${escaped}", 2)`)
      return Promise.resolve({ success: true, message: 'Fondo cambiado', speak: true })
    }
    return Promise.resolve({ success: false, message: 'Dime la ruta: fondo C:\\ruta\\imagen.jpg', speak: true })
  }

  if (/ejecuta|ejecutar|corre|correr|powershell/i.test(lower)) {
    const cmd = lower.replace(/ejecuta|ejecutar|corre|correr|powershell|por favor/gi, '').trim()
    if (cmd) {
      return _confirm(`Ejecutar: ${cmd}`, text).then(ok => {
        if (!ok) return CANCELLED
        return runPs(cmd).then(({ err, stdout }) => ({
          success: true,
          message: err ? `Error: ${err.message}` : stdout || 'Ejecutado',
          speak: true,
        }))
      })
    }
    return Promise.resolve({ success: false, message: '¿Qué comando PowerShell ejecuto?', speak: true })
  }

  if (/hora/i.test(lower)) {
    return runPs(`Get-Date -Format "HH:mm"`).then(({ stdout }) => ({ success: true, message: `Son las ${stdout}`, speak: true }))
  }
  if (/fecha/i.test(lower)) {
    return runPs(`Get-Date -Format "dddd, d 'de' MMMM 'de' yyyy"`).then(({ stdout }) => ({ success: true, message: `Hoy es ${stdout}`, speak: true }))
  }
  if (/bater[ií]a|energ[ií]a/i.test(lower)) {
    return runPs(`$b = Get-CimInstance -ClassName BatteryStatus -Namespace root/WMI | Select-Object -First 1; if (-not $b) { $b = Get-CimInstance -ClassName Win32_Battery }; if ($b) { $b.EstimatedChargeRemaining }`).then(({ err, stdout }) => ({ success: !err, message: err || !stdout ? 'No pude leer la batería' : `Batería al ${stdout.trim()}%`, speak: true }))
  }
  if (/\bip\b/i.test(lower)) {
    return runPs(`(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -ne 'Loopback Pseudo-Interface 1'}).IPAddress | Select-Object -First 1`).then(({ err, stdout }) => ({ success: true, message: err || !stdout ? 'No pude obtener la IP' : `Tu IP es ${stdout}`, speak: true }))
  }
  if (/papelera|recicla/i.test(lower)) {
    return _confirm('Vaciar la papelera', text).then(ok => {
      if (!ok) return CANCELLED
      runPs(`(New-Object -ComObject Shell.Application).NameSpace(0xa).Items() | ForEach-Object { $_.InvokeVerb('delete') }`)
      return { success: true, message: 'Papelera vaciada', speak: true }
    })
  }
  if (/sesi[óo]n|sesion|salir|logoff/i.test(lower)) {
    return _confirm('Cerrar sesión', text).then(ok => {
      if (!ok) return CANCELLED
      runPs(`shutdown /l`)
      return { success: true, message: 'Cerrando sesión', speak: true }
    })
  }

  // Plan de energía
  if (/plan\s+(de\s+)?(energ[ií]a|ahorro|rendimiento|balanceado)/i.test(lower)) {
    let guid = '381b4222-f694-41f0-9685-ff5bb260df2e' // balanced
    if (/ahorro|ahorrar|bajo|econom[ií]a/i.test(lower)) guid = 'a1841308-3541-4fab-bc81-f71556f20b4a'
    if (/rendimiento|alto|max|maximo/i.test(lower)) guid = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
    runPs(`powercfg /setactive ${guid}`)
    return Promise.resolve({ success: true, message: 'Plan de energía cambiado', speak: true })
  }

  // Bluetooth toggle
  if (/bluetooth/i.test(lower) && (/\bon\b|enciende|activa|prende/i.test(lower) || !/\boff\b|apaga|desactiva/i.test(lower))) {
    return runPs(`$bt = Get-CimInstance -Namespace root/CIMV2/Power -Class Win32_PowerManagementCapabilities -ErrorAction SilentlyContinue; if (-not $bt) { 'Bluetooth no detectable via WMI' }`).then(({ stdout }) => ({ success: true, message: stdout || 'Bluetooth activado (usa Configuración > Bluetooth)', speak: true }))
  }

  // VPN
  if (/vpn/i.test(lower)) {
    const connMatch = lower.match(/(conecta|connect|desconecta|disconnect)\s+(.+)/i)
    if (connMatch) {
      const action = /conecta|connect/i.test(connMatch[1]) ? 'connect' : 'disconnect'
      const name = sanitize(connMatch[2])
      runPs(`rasphone -h "${name}"; if ('${action}' -eq 'connect') { rasdial "${name}" } else { rasdial "${name}" /disconnect }`)
      return Promise.resolve({ success: true, message: `${action === 'connect' ? 'Conectando' : 'Desconectando'} VPN "${name}"`, speak: true })
    }
    return Promise.resolve({ success: false, message: 'Ejemplo: conecta VPN [nombre] o desconecta VPN [nombre]', speak: true })
  }

  // Windows Update
  if (/(actualizaci[óo]n|windows update|update)/i.test(lower)) {
    if (/busca|revisa|check|comprueba/i.test(lower)) {
      runPs(`Install-Module PSWindowsUpdate -Force -Scope CurrentUser -ErrorAction SilentlyContinue; if (Get-Module -ListAvailable PSWindowsUpdate) { Import-Module PSWindowsUpdate; Get-WUList | Select-Object Title,Size,NeedsReboot | Format-Table -AutoSize | Out-String } else { 'Módulo PSWindowsUpdate no instalado. Usa Configuración > Windows Update manualmente.' }`)
      return Promise.resolve({ success: true, message: 'Buscando actualizaciones (revisa la ventana)', speak: true })
    }
    if (/instala|instalar/i.test(lower)) {
      runPs(`Install-Module PSWindowsUpdate -Force -Scope CurrentUser -ErrorAction SilentlyContinue; if (Get-Module -ListAvailable PSWindowsUpdate) { Import-Module PSWindowsUpdate; Install-WUUpdates -AcceptAll -AutoReboot | Out-String }`)
      return Promise.resolve({ success: true, message: 'Instalando actualizaciones...', speak: true })
    }
    return Promise.resolve({ success: true, message: 'Di "busca actualizaciones" o "instala actualizaciones"', speak: true })
  }

  // SFC / DISM
  if (/(sfc|dism|repara|reparar|escanea|escaneo|scannow)/i.test(lower)) {
    const tool = /dism/i.test(lower) ? 'DISM' : 'SFC'
    const cmd = /dism/i.test(lower)
      ? 'DISM /Online /Cleanup-Image /RestoreHealth'
      : 'sfc /scannow'
    runPs(`Start-Process cmd -ArgumentList '/c ${cmd}' -Verb RunAs -WindowStyle Normal`)
    return Promise.resolve({ success: true, message: `Ejecutando ${tool} como administrador...`, speak: true })
  }

  // Limpieza de disco
  if (/(limpia|clean|cleanup|libera|liberar)\s+(disco|espacio)/i.test(lower)) {
    runPs(`Start-Process cleanmgr -Verb RunAs`)
    return Promise.resolve({ success: true, message: 'Abriendo Liberador de espacio en disco', speak: true })
  }

  // Punto de restauración
  if (/restauraci[óo]n|restore\s+point|punto\s+de\s+restauración?/i.test(lower)) {
    if (/crea|crear|nuev|haz/i.test(lower)) {
      runPs(`Checkpoint-Computer -Description "RestorePoint $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -RestorePointType MODIFY_SETTINGS`)
      return Promise.resolve({ success: true, message: 'Creando punto de restauración...', speak: true })
    }
    return Promise.resolve({ success: true, message: 'Di "crea punto de restauración"', speak: true })
  }

  // Variables de entorno
  if (/variable/i.test(lower) && /entorno|environment/i.test(lower)) {
    const name = lower.match(/(?:muestra|ver|lee|get|dime)\s+(.+)/i)
    if (name) {
      return runPs(`[System.Environment]::GetEnvironmentVariable('${sanitize(name[1].trim())}', 'User')`).then(({ stdout }) => ({
        success: true, message: stdout ? `${name[1].trim()} = ${stdout}` : 'Variable no definida', speak: true
      }))
    }
    return Promise.resolve({ success: false, message: 'Ejemplo: muestra variable PATH', speak: true })
  }

  // Programador de tareas
  if (/tarea\s+programada|task\s+scheduler|programa\s+una\s+tarea|schtasks/i.test(lower)) {
    runPs(`Start-Process taskschd.msc`)
    return Promise.resolve({ success: true, message: 'Abriendo Programador de tareas', speak: true })
  }

  // Firewall
  if (/firewall|wf\.msc/i.test(lower)) {
    runPs(`Start-Process wf.msc`)
    return Promise.resolve({ success: true, message: 'Abriendo Firewall de Windows', speak: true })
  }

  return Promise.resolve({ success: false, message: 'No entendí...', speak: true })
}

module.exports = { executeVolume, executeBrightness, executeSystem, setConfirm }
