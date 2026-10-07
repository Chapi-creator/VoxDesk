const { exec } = require('child_process')
const path = require('path')
const os = require('os')
const http = require('http')
const tts = require('./tts')
const memory = require('./memory')
const logger = require('./logger')
const email = require('./email')
const { runPs } = require('./run-ps')
const fun = require('./fun')
const mood = require('./mood')


// Fase 3: main.js inyecta el diálogo real con setConfirm. Sin inyectar, auto-sí (tests).
let _confirmFn = null
function setConfirm(fn) { _confirmFn = fn }
async function _confirm(title, detail) {
  if (!_confirmFn) return true
  try { return await _confirmFn(title, detail) } catch { return false }
}

const SEP = /(?:\s+y\s+|\s+y\s+luego\s+|\s+luego\s+|\s+despu[ée]s\s+)/i
const PS_MOUSE = `Add-Type -AssemblyName System.Windows.Forms
Add-Type -ErrorAction SilentlyContinue @"
using System;
using System.Runtime.InteropServices;
public class MouseAPI {
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
  public const uint LEFTDOWN = 0x0002; public const uint LEFTUP = 0x0004;
  public const uint RIGHTDOWN = 0x0008; public const uint RIGHTUP = 0x0010;
  public const uint DOUBLECLICK = 0x0002 | 0x0004;
}
"@
$p = [System.Windows.Forms.Cursor]::Position
[MouseAPI]::mouse_event([MouseAPI]::LEFTDOWN, $p.X, $p.Y, 0, 0); Start-Sleep -Milliseconds 50
[MouseAPI]::mouse_event([MouseAPI]::LEFTUP, $p.X, $p.Y, 0, 0)`

const PATTERNS = [
  // --- WINDOW SNAPPING (Win+Arrow) ---
  { match: /(a\s+la\s+)?izquierda|divide\s+pantalla/i,
    run: () => winSnap(['0x25']),
    msg: 'A la izquierda' },
  { match: /(a\s+la\s+)?derecha/i,
    run: () => winSnap(['0x27']),
    msg: 'A la derecha' },
  { match: /maximiza\s+ventana|pantalla\s+completa|llena\s+(la\s+)?pantalla/i,
    run: () => winSnap(['0x26']),
    msg: 'Pantalla completa' },
  { match: /minimiza\s+ventana|restaura\s+ventana/i,
    run: () => winSnap(['0x28']),
    msg: 'Minimizando ventana' },
  { match: /esquina\s+(superior|superior\s+izquierda|sup\s*izq|top\s+left)/i,
    run: () => winSnap(['0x25']) + '\n' + winSnap(['0x26']),
    msg: 'Esquina superior izquierda' },
  { match: /esquina\s+(superior\s+derecha|sup\s*der|top\s+right)/i,
    run: () => winSnap(['0x27']) + '\n' + winSnap(['0x26']),
    msg: 'Esquina superior derecha' },
  { match: /esquina\s+(inferior\s+izquierda|inf\s*izq|bottom\s+left)/i,
    run: () => winSnap(['0x25']) + '\n' + winSnap(['0x28']),
    msg: 'Esquina inferior izquierda' },
  { match: /esquina\s+(inferior\s+derecha|inf\s*der|bottom\s+right)/i,
    run: () => winSnap(['0x27']) + '\n' + winSnap(['0x28']),
    msg: 'Esquina inferior derecha' },

  // --- WINDOW MANAGEMENT ---
  { match: /minimiza\s+(todo|ventanas|todas)\s*/i,
    run: `(New-Object -ComObject Shell.Application).ToggleDesktop()`,
    msg: 'Minimizando todo' },
  { match: /muestra\s+(el\s+)?escritorio/i,
    run: `(New-Object -ComObject Shell.Application).ToggleDesktop()`,
    msg: 'Mostrando escritorio' },
  { match: /(maximiza|maximizar|agranda)\s+(.+)/i,
    run: (m) => windowCmd(m[2], '最大化'),
    msg: (m) => `Maximizando ${m[2]}` },
  { match: /(minimiza|minimizar)\s+(.+)/i,
    run: (m) => windowCmd(m[2], '最小化'),
    msg: (m) => `Minimizando ${m[2]}` },
  { match: /restaura?\s+(.+)/i,
    run: (m) => windowCmd(m[2], '还原'),
    msg: (m) => `Restaurando ${m[2]}` },
  { match: /(?:a|pon|poner)\s+(.+)\s+(?:en\s+)?(primer plano|foco|frente|adelante)/i,
    run: (m) => windowCmd(m[1], ''),
    msg: (m) => `Trayendo ${m[1]} al frente` },
  { match: /cierra\s+(la\s+)?sesi[óo]n|logoff|salir/i,
    run: `shutdown /l`,
    confirm: 'Cerrar sesión',
    msg: 'Cerrando sesión' },
  { match: /cierra\s+(.+)/i,
    run: (m) => stopProcess(m[1]),
    confirm: (m) => `Cerrar ${m[1]}`,
    msg: (m) => `Cerrando ${m[1]}` },
  { match: /cierra\s+todo|mata\s+todo|cerrar\s+todo/i,
    run: `Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Where-Object { $_.ProcessName -notin @('explorer','taskmgr','ApplicationFrameHost') } | Stop-Process -Force`,
    confirm: 'Cerrar todas las ventanas',
    priority: 10,
    msg: 'Cerrando todo' },

  // --- MOUSE CONTROL ---
  { match: /mouse\s+(a|al?|en|posicion)\s+(\d+)[\s,;]+\s*(\d+)/i,
    run: (m) => `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${m[2]}, ${m[3]})`,
    msg: (m) => `Mouse en ${m[2]}, ${m[3]}` },
  { match: /clic(k|a)?\s*(izquierdo)?\s*$/i,
    run: PS_MOUSE,
    msg: 'Click izquierdo' },
  { match: /clic(k|a)?\s+derecho/i,
    run: PS_MOUSE.replace(/LEFTDOWN/g, 'RIGHTDOWN').replace(/LEFTUP/g, 'RIGHTUP'),
    msg: 'Click derecho' },
  { match: /doble\s*clic(k|a)?/i,
    run: PS_MOUSE.replace(/Start-Sleep -Milliseconds 50/, 'Start-Sleep -Milliseconds 50; Start-Sleep -Milliseconds 100').replace(/(LEFTDOWN.*?LEFTUP)/, '$1; Start-Sleep -Milliseconds 100; $1'),
    msg: 'Doble click' },

  // --- BROWSER ---
  { match: /(chrome|firefox|edge|brave)\s+(en\s+)?(modo\s+)?incognito/i,
    run: (m) => browserIncognito(m[1]),
    msg: (m) => `Abriendo ${m[1]} en modo incógnito` },
  { match: /(chrome|firefox|edge|brave)\s+(nueva\s+)?(ventana|pestana?|página)\s+(.+)/i,
    run: (m) => `start ${m[1]} "${m[4]}"`,
    msg: (m) => `Abriendo ${m[4]} en ${m[1]}` },

  // --- CHROME CDP (DevTools Protocol via HTTP) ---
  { match: /lista\s+(pestañas|tabs|pestañas\s+de\s+chrome)/i,
    run: chromeListTabs,
    capture: true,
    msg: 'Listando pestañas' },
  { match: /cierra\s+(pestaña|tab)\s+(\d+)/i,
    run: (m) => chromeCloseTab(parseInt(m[2]) - 1),
    msg: (m) => `Cerrando pestaña ${m[2]}` },
  { match: /nueva\s+pestaña\s+(.+)/i,
    run: (m) => chromeNewTab(m[1]),
    msg: (m) => `Abriendo nueva pestaña: ${m[1]}` },

  // --- EMAIL / WHATSAPP ---
  { match: /envía\s+(un\s+)?(email|correo|mail)\s+a\s+(.+?)\s+(?:asunto\s+(.+?)\s+)?diciendo\s+(.+)/i,
    handler: async (m) => { const result = await email.send(m[3].trim(), m[4]?.trim() || '', m[5].trim()); return result },
    confirm: (m) => `Enviar email a ${m[3]}`,
    msg: (m) => `Enviando email a ${m[3]}...` },
  { match: /(?:redacta|crea|nuev[oa]|prepara|escribe)\s+(?:un\s+)?(?:correo|email|mail)\b\s*(.*)/i,
    handler: async (m) => {
      const rest = m[1]?.trim().replace(/^con\s+/i, '') || ''
      let subject = '', body = ''
      const withAsunto = rest.match(/^(?:con\s+)?asunto\s+(.+)/i)
      if (withAsunto) {
        const afterAsunto = withAsunto[1].trim()
        const parts = afterAsunto.match(/^(.+?)\s+diciendo\s+(.+)/i)
        if (parts) { subject = parts[1].trim(); body = parts[2].trim() }
        else subject = afterAsunto
      } else {
        const parts = rest.match(/^(?:diciendo|contenido|texto)\s+(.+)/i)
        if (parts) body = parts[1].trim()
        else if (rest) body = rest
      }
      return email.compose(subject, body)
    },
    msg: 'Abriendo redacción de correo...' },
  { match: /envía\s+(un\s+)?whatsapp\s+a\s+(.+?)\s+diciendo\s+(.+)/i,
    run: (m) => `start https://wa.me/?text=${encodeURIComponent(m[3].trim())}`,
    msg: (m) => `Abriendo WhatsApp para enviar mensaje` },

  // --- FILE OPERATIONS ---
  { match: /lee\s+(el\s+)?archivo\s+(.+)|muestra\s+el\s+contenido\s+de\s+(.+)/i,
    run: (m) => `Get-Content ${psStr(m[2] || m[3])} -Encoding UTF8 -ErrorAction SilentlyContinue | Out-String`,
    capture: true,
    msg: (m) => `Leyendo archivo` },
  { match: /crea\s+(un\s+)?archivo\s+(.+?)\s+(?:con\s+)?(?:el\s+)?(?:contenido|texto|diciendo)\s+(.+)/i,
    run: (m) => `Set-Content -Path ${psStr(m[2].trim())} -Value ${psStr(m[3])} -Encoding UTF8 -Force`,
    msg: (m) => `Archivo "${m[2]}" creado` },
  { match: /busca\s+archivos?\s+(?:por\s+)?(?:nombre|llamados?)\s+(.+)/i,
    run: (m) => `Get-ChildItem -Recurse -Filter "*${m[1]}*" -ErrorAction SilentlyContinue | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize | Out-String`,
    capture: true,
    msg: (m) => `Buscando archivos "${m[1]}"` },
  { match: /list(a|e(a)?)\s+(el\s+)?(directorio|contenido|carpeta|archivos)\s+(.+)|muestra\s+(los\s+)?archivos\s+(.+)/i,
    run: (m) => `Get-ChildItem "${m[4] || m[6]}" -ErrorAction SilentlyContinue | Select-Object Mode, Length, LastWriteTime, Name | Format-Table -AutoSize | Out-String`,
    capture: true,
    msg: (m) => `Listando ${m[4] || m[6]}` },
  { match: /renombra\s+(.+?)\s+(?:a|como)\s+(.+)/i,
    run: (m) => `Rename-Item -Path "${m[1].trim()}" -NewName "${m[2].trim()}" -ErrorAction SilentlyContinue`,
    msg: (m) => `Renombrado a ${m[2]}` },
  { match: /(atributo|cambia\s+atributo)\s+(.+?)\s+(?:a\s+)?(solo\s+lectura|oculto|read.?only|hidden|normal)/i,
    run: (m) => {
      const attr = /solo\s+lectura|read.?only/i.test(m[3]) ? 'ReadOnly' : /oculto|hidden/i.test(m[3]) ? 'Hidden' : 'Normal'
      return `Set-ItemProperty -Path "${m[2].trim()}" -Name Attributes -Value ([System.IO.FileAttributes]::${attr}) -ErrorAction SilentlyContinue`
    },
    msg: (m) => `Atributo cambiado a ${m[3]}` },
  { match: /monta\s+(la\s+)?imagen\s+(.+?)(?:\s+en\s+(.+))?/i,
    run: (m) => {
      const iso = m[2].trim()
      return `Mount-DiskImage -ImagePath ${psStr(iso)} -ErrorAction SilentlyContinue; if ($?) { (Get-Volume -DiskImage (Get-DiskImage ${psStr(iso)})).DriveLetter }`
    },
    msg: (m) => `Montando imagen ${m[2]}` },
  { match: /desmonta|expulsa\s+(la\s+)?imagen\s+(.+)|desmonta\s+(.+)/i,
    run: (m) => `Dismount-DiskImage -ImagePath ${psStr((m[2] || m[3]).trim())} -ErrorAction SilentlyContinue`,
    msg: 'Imagen desmontada' },
  { match: /crea\s+(un\s+)?accesos?\s+directo\s+(.+?)(?:\s+(?:en|para)\s+(.+))?/i,
    run: (m) => {
      const name = m[2].trim().replace(/\s+/g, '')
      const target = m[3]?.trim() || name
      return `$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut("$env:USERPROFILE\\Desktop\\${name}.lnk"); $sc.TargetPath = "${target}"; $sc.Save()`
    },
    msg: (m) => `Acceso directo "${m[2]}" creado en el escritorio` },

  // --- CALCULATOR / MATH ---
  { match: /(calcula|cu[aá]nto\s+es|opera|resuelve)\s+(.+)/i,
    run: (m) => {
      try {
        const expr = m[2].replace(/x/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/[^0-9+\-*/.() ]/g, '')
        const result = Function('"use strict"; return (' + expr + ')')()
        return `echo ${result}`
      } catch {
        return `echo No pude calcular la expresión`
      }
    },
    capture: true,
    msg: (m) => `Calculando ${m[2]}` },

  // --- TIMER / STOPWATCH ---
  { match: /temporizador|cronometro|cuenta\s+(atr[aá]s|regresiva)\s+(\d+)\s*(minutos?|segundos?|horas?)?/i,
    run: (m) => {
      const num = parseInt(m[2])
      const unit = m[3]?.toLowerCase() || 'segundos'
      const ms = unit.includes('hora') ? num * 3600 : unit.includes('minuto') ? num * 60 : num
      return `Start-Sleep -Seconds ${ms}; [System.Media.SystemSounds]::Asterisk.Play(); Write-Output "⏰ Tiempo cumplido: ${num} ${unit}"`
    },
    capture: true,
    msg: (m) => `Temporizador de ${m[2]} ${m[3] || 'segundos'} iniciado` },

  // --- NEWS ---
  { match: /noticias\s*(?:de\s+actualidad|del\s+d[ií]a)?|qu[eé]\s+(pasó|pasa)\s+en\s+el\s+mundo|dame\s+las\s+noticias/i,
    run: (m) => `$r = Invoke-WebRequest -Uri "https://newsapi.org/v2/top-headlines?country=us&pageSize=5&apiKey=demo" -UseBasicParsing -ErrorAction SilentlyContinue; if ($r) { ($r.Content | ConvertFrom-Json).articles | ForEach-Object { Write-Output "$($_.title) - $($_.source.name)" } } else { Write-Output "No pude obtener noticias. Configura una API key en newsapi.org" }`,
    capture: true,
    msg: 'Obteniendo noticias' },

  // --- WEB SEARCH (quick URLs) ---
  { match: /abre\s+(reddit|twitter|facebook|instagram|linkedin|youtube|twitch|gmail|drive|docs|amazon|github|noticias)/i,
    run: (m) => {
      const sites = {
        reddit: 'https://reddit.com', twitter: 'https://twitter.com',
        facebook: 'https://facebook.com', instagram: 'https://instagram.com',
        linkedin: 'https://linkedin.com', youtube: 'https://youtube.com',
        twitch: 'https://twitch.tv', gmail: 'https://mail.google.com',
        drive: 'https://drive.google.com', docs: 'https://docs.google.com',
        amazon: 'https://amazon.com', github: 'https://github.com',
        noticias: 'https://news.google.com',
      }
      return `start ${sites[m[1].toLowerCase()] || 'https://' + m[1] + '.com'}`
    },
    msg: (m) => `Abriendo ${m[1]}` },

  // --- VIRTUAL DESKTOP ---
  { match: /(nuevo\s+)?escritorio\s+virtual|crea\s+(un\s+)?escritorio/i,
    run: () => `$v = [System.Windows.Input.InputManager]::Current; $v.PostMessage(0x31, 0, 0) 2>$null; if (-not $?) { Write-Output 'Usa Win+Ctrl+D para crear escritorio virtual' }`,
    msg: 'Creando escritorio virtual' },
  { match: /cambia\s+(al?\s+)?escritorio\s+(\d+)|siguiente\s+escritorio|anterior\s+escritorio/i,
    run: (m) => {
      if (/siguiente/i.test(m[0])) return `[System.Windows.Input.InputManager]::Current; $v.PostMessage(0x31, 0, 0) 2>$null; Write-Output 'Usa Win+Ctrl+Right para siguiente escritorio'`
      if (/anterior/i.test(m[0])) return `Write-Output 'Usa Win+Ctrl+Left para anterior escritorio'`
      return `Write-Output 'Usa Win+Ctrl+D para crear, Win+Ctrl+F4 para cerrar escritorio virtual'`
    },
    msg: (m) => m[0] },

  // --- QR CODE ---
  { match: /genera\s+(un\s+)?c[oó]digo\s+qr\s+(?:con\s+)?(?:el\s+)?(?:texto\s+)?(.+)/i,
    run: (m) => `Add-Type -AssemblyName System.Drawing; $data = '${m[2].trim().replace(/'/g, "''")}'; $qr = New-Object -ComObject "QRCodeMaker.XQRCode" -ErrorAction SilentlyContinue; if (-not $qr) { $wc = New-Object Net.WebClient; $url = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + [Net.WebUtility]::UrlEncode('${m[2].trim().replace(/'/g, "''")}'); $img = [System.Drawing.Image]::FromStream($wc.OpenRead($url)); $img.Save("$env:TEMP\\qr_$(Get-Random).png"); Start-Process "$env:TEMP\\qr_*.png" }`,
    msg: (m) => `Generando QR: ${m[2].trim()}` },

  // --- SPEEDTEST ---
  { match: /speedtest|velocidad\s+de\s+internet|prueba\s+de\s+velocidad|test\s+de\s+internet/i,
    run: `try { curl -s 'https://raw.githubusercontent.com/sivel/speedtest-cli/master/speedtest.py' | python - 2>&1 | Select-String 'Download|Upload|Ping' | Out-String } catch { Write-Output 'Speedtest requiere Python. Instálalo o visita speedtest.net' }`,
    capture: true,
    msg: 'Midiendo velocidad de internet...' },

  // --- DICTATION / TYPE FROM VOICE ---
  { match: /dicta\s+(.+)/i,
    run: (m) => {
      const text = m[1].trim()
      const escaped = text.replace(/"/g, '\\"')
      return `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("${escaped}")`
    },
    msg: (m) => `Escribiendo: ${m[1].trim()}` },

  // --- WEBCAM / PHOTO ---
  { match: /(saca|toma|haz)\s+(una\s+)?(foto|fotograf[ií]a|selfie)(?:\s+con\s+la\s+(webcam|c[aá]mara))?/i,
    run: `Add-Type -AssemblyName System.Windows.Forms; $ps = Start-Process ms-screenclip: -PassThru; Start-Sleep 2; if ($ps) { $ps.Kill() }; Write-Output 'Usa Win+Shift+S para recorte de pantalla o abre la app Cámara'`,
    msg: 'Intentando abrir cámara...' },

  // --- GEO IP / LOCATION ---
  { match: /d[oó]nde\s+estoy|mi\s+(ubicaci[óo]n|ip|localizaci[óo]n)|geo\s*ip|qu[eé]\s+es\s+mi\s+ip/i,
    run: `try { $r = Invoke-WebRequest -Uri "https://ipapi.co/json/" -UseBasicParsing -ErrorAction Stop; $d = $r.Content | ConvertFrom-Json; "IP: $($d.ip) | Ciudad: $($d.city) ($($d.region)) | País: $($d.country_name) | ISP: $($d.org)" } catch { try { $r = Invoke-WebRequest -Uri "https://ipinfo.io/json" -UseBasicParsing; $d = $r.Content | ConvertFrom-Json; "IP: $($d.ip) | Ciudad: $($d.city) ($($d.region)) | País: $($d.country)" } catch { "No pude obtener ubicación" } }`,
    capture: true,
    msg: 'Obteniendo ubicación...' },

  // --- CALENDAR / DATE ---
  { match: /qu[eé]\s+d[ií]a\s+es\s+hoy|qu[eé]\s+fecha\s+es\s+hoy|fecha\s+de\s+hoy|hoy\s+es/i,
    run: `Get-Date -Format "dddd, d 'de' MMMM 'de' yyyy"`,
    msg: 'Consultando fecha' },
  { match: /qu[eé]\s+hora\s+es|hora\s+actual|qu[eé]\s+hora\s+tengo/i,
    run: `Get-Date -Format "HH:mm:ss"`,
    msg: 'Consultando hora' },

  // --- REMINDER (via scheduled task) ---
  { match: /recu[eé]rdame\s+(.+?)\s+(?:en\s+|dentro\s+de\s+)(\d+)\s*(minutos?|segundos?|horas?|min|seg|h)/i,
    run: (m) => {
      const text = m[1].trim().replace(/'/g, "''")
      const num = parseInt(m[2])
      const unit = m[3]?.toLowerCase() || 'minutos'
      let seconds = unit.startsWith('h') ? num * 3600 : unit.startsWith('m') ? num * 60 : num
      const taskName = "AI_Reminder_" + Date.now()
      return `$action = New-ScheduledTaskAction -Execute "powershell" -Argument "-NoProfile -Command \`"\`$host.UI.RawUI.WindowTitle = 'Recordatorio'; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${text}','Recordatorio AI','OK','Information'); [System.Media.SystemSounds]::Asterisk.Play()\`""; $trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddSeconds(${seconds})); Register-ScheduledTask -TaskName "${taskName}" -Action $action -Trigger $trigger -Force | Out-Null; Write-Output "Recordatorio programado para dentro de ${num} ${unit}"`
    },
    capture: true,
    msg: (m) => `Recordatorio en ${m[2]} ${m[3] || 'minutos'}: ${m[1]}` },

  // --- PRINT ---
  { match: /imprime\s+(.+?)(?:\s+(?:en|por)\s+(.+))?/i,
    run: (m) => {
      const file = m[1].trim()
      return `Start-Process -FilePath ${psStr(file)} -Verb Print -ErrorAction SilentlyContinue; if (-not $?) { Write-Output 'No pude imprimir. Asegúrate de que la ruta existe.' }`
    },
    msg: (m) => `Imprimiendo ${m[1]}` },

  // --- CALENDAR INTEGRATION (reminder events) ---
  { match: /qu[eé]\s+eventos?\s+tengo|mis\s+recordatorios|pr[oó]ximos?\s+eventos/i,
    run: `$tasks = Get-ScheduledTask -TaskName "AI_Reminder_*" -ErrorAction SilentlyContinue | Select-Object @{N='Recordatorio';E={$_.TaskName -replace '^AI_Reminder_',''}}, NextRunTime; if ($tasks) { $tasks | Format-Table -AutoSize | Out-String } else { Write-Output 'No hay recordatorios programados' }`,
    capture: true,
    msg: 'Consultando recordatorios' },

  // --- CLIPBOARD ---
  { match: /copia\s+(.+?)\s+(?:al?\s+)?portapapeles|clipboard\s+(.+)/i,
    run: (m) => {
      const text = (m[1] || m[2]).trim().replace(/"/g, '\\"')
      return `Set-Clipboard -Value "${text}"; Write-Output "Copiado al portapapeles"`
    },
    msg: (m) => `Copiado: ${m[1] || m[2]}` },
  { match: /pega\s+(?:del\s+)?portapapeles|paste\s+clipboard/i,
    run: `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()`,
    capture: true,
    msg: 'Obteniendo contenido del portapapeles' },

  // --- SEARCH / WEB ---
  { match: /busca\s+(en\s+)?google\s+(.+)/i,
    run: (m) => `start chrome "https://www.google.com/search?q=${encodeURIComponent(m[2])}"`,
    msg: (m) => `Buscando "${m[2]}" en Google` },
  { match: /busca\s+(en\s+)?youtube\s+(.+)/i,
    run: (m) => `start chrome "https://www.youtube.com/results?search_query=${encodeURIComponent(m[2])}"`,
    msg: (m) => `Buscando "${m[2]}" en YouTube` },
  { match: /traduce?\s+(.+?)\s+(?:a|al)\s+(.+)/i,
    run: (m) => `start chrome "https://translate.google.com/?sl=auto&tl=${encodeURIComponent(m[2])}&text=${encodeURIComponent(m[1])}"`,
    msg: (m) => `Traduciendo "${m[1]}" a ${m[2]}` },

  // --- DOWNLOAD ---
  { match: /descarga\s+(https?:\/\/\S+)(?:\s+(?:a|en|para|como)\s+(.+))?/i,
    run: (m) => `Invoke-WebRequest -Uri "${m[1]}" -OutFile "${m[2] || path.basename(m[1]) || 'download'}" -UseBasicParsing`,
    msg: (m) => `Descargando ${path.basename(m[1])}` },

  // --- DISPLAY ---
  { match: /(brillo)\s+(sube|subir|aumenta|baja|bajar|reduce)\s*(\d+)?/i,
    run: (m) => brightnessChange(m[2], m[3]),
    msg: (m) => `Brillo ${m[2] === 'sube' || m[2] === 'subir' || m[2] === 'aumenta' ? 'subido' : 'bajado'}${m[3] ? ` ${m[3]}%` : ''}` },
  { match: /brillo\s+(a|al?)\s+(\d+)/i,
    run: (m) => brightnessChange('', m[2]),
    msg: (m) => `Brillo al ${m[2]}%` },
  // --- NETWORK ---
  { match: /wifi\s+(on|off|enciende|apaga|activa|desactiva)/i,
    run: (m) => `netsh interface set interface "${getWifiAdapter()}" ${m[1] === 'on' || m[1] === 'enciende' || m[1] === 'activa' ? 'enabled' : 'disabled'}`,
    msg: (m) => `WiFi ${m[1] === 'on' || m[1] === 'enciende' || m[1] === 'activa' ? 'activado' : 'desactivado'}` },

  // --- SETTINGS ---
  { match: /abre\s+(configuraci[óo]n|ajustes|settings)(\s+de\s+(.+))?/i,
    run: (m) => openSettings(m[3]),
    msg: (m) => `Abriendo configuración${m[3] ? ` de ${m[3]}` : ''}` },
  { match: /abre\s+(panel\s+de\s+control|control|panel)/i,
    run: `control`,
    msg: 'Abriendo panel de control' },
  { match: /abre\s+(administrador\s+de\s+)?tareas|task\s*manager/i,
    run: `taskmgr`,
    msg: 'Abriendo administrador de tareas' },
  { match: /abre\s+(el\s+)?(explorador|explorer|archivos|este\s+equipo|mi\s+pc)/i,
    run: `explorer`,
    msg: 'Abriendo explorador' },
  { match: /abre\s+descargas|abre\s+downloads|abre\s+las\s+descargas/i,
    run: `explorer "$env:USERPROFILE\\Downloads"`,
    msg: 'Abriendo descargas' },
  { match: /abre\s+documentos|abre\s+mis\s+documentos|abre\s+los\s+documentos/i,
    run: `explorer "$env:USERPROFILE\\Documents"`,
    msg: 'Abriendo documentos' },
  { match: /abre\s+(im[áa]genes|fotos|imagenes|mis\s+imagenes)/i,
    run: `explorer "$env:USERPROFILE\\Pictures"`,
    msg: 'Abriendo imágenes' },

  // --- POWER ---
  { match: /hiberna|hibernar/i,
    run: `shutdown /h`,
    confirm: 'Hibernar el equipo',
    msg: 'Hibernando' },
  // --- THEME ---
  { match: /tema\s+(oscuro|claro|obscuro)/i,
    run: (m) => `New-ItemProperty -Path HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize -Name AppsUseLightTheme -Value ${m[1] === 'oscuro' || m[1] === 'obscuro' ? 0 : 1} -Type DWord -Force; New-ItemProperty -Path HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize -Name SystemUsesLightTheme -Value ${m[1] === 'oscuro' || m[1] === 'obscuro' ? 0 : 1} -Type DWord -Force`,
    msg: (m) => `Tema ${m[1] === 'oscuro' || m[1] === 'obscuro' ? 'oscuro' : 'claro'} activado` },

  // --- FILES ---
  { match: /crea\s+(una\s+)?carpeta\s+(.+?)(?:\s+(?:en|dentro\s+de)\s+(.+))?$/i,
    run: (m) => createFolder(m[2], m[3]),
    msg: (m) => `Carpeta "${m[2]}" creada` },
  { match: /borra\s+(el\s+)?(archivo|fichero)\s+(.+)/i,
    run: (m) => `Remove-Item -Path ${psStr(m[3])} -Force -ErrorAction SilentlyContinue`,
    confirm: (m) => `Borrar el archivo ${m[3]}`,
    msg: (m) => `Borrado ${m[3]}` },
  { match: /renombra\s+(.+?)\s+(?:a|como)\s+(.+)/i,
    run: (m) => `Rename-Item -Path ${psStr(m[1])} -NewName ${psStr(m[2])} -ErrorAction SilentlyContinue`,
    msg: (m) => `Renombrado a ${m[2]}` },
  { match: /comprime\s+(.+?)(?:\s+(?:a|en|como)\s+(.+))?/i,
    run: (m) => `Compress-Archive -Path ${psStr(m[1])} -DestinationPath ${psStr(m[2] || (m[1] + '.zip'))} -Force`,
    msg: (m) => `Comprimiendo ${m[1]}` },
  { match: /extrae|descomprime|unzip\s+(.+?)(?:\s+(?:a|en)\s+(.+))?/i,
    run: (m) => `Expand-Archive -Path "${m[1]}" -DestinationPath "${m[2] || path.dirname(m[1])}" -Force`,
    msg: (m) => `Extrayendo ${m[1]}` },

  // --- FILE COPY / MOVE ---
  { match: /copia\s+(.+?)\s+a\s+(.+)/i,
    run: (m) => `Copy-Item -Path '${escapePs(m[1])}' -Destination '${escapePs(m[2])}' -Recurse -Force -ErrorAction SilentlyContinue`,
    msg: (m) => `Copiado ${m[1]} a ${m[2]}` },
  { match: /mueve|mover\s+(.+?)\s+a\s+(.+)/i,
    run: (m) => `Move-Item -Path '${escapePs(m[1])}' -Destination '${escapePs(m[2])}' -Force -ErrorAction SilentlyContinue`,
    msg: (m) => `Movido ${m[1]} a ${m[2]}` },
  { match: /busca\s+archivos?\s+que\s+(contengan|digan|tengan|incluyan)\s+(.+)/i,
    run: (m) => ps_grep(m[2]),
    capture: true,
    msg: 'Buscando archivos' },
  { match: /abre\s+(el\s+)?(excel|word|pdf|documento|archivo|ppt|powerpoint)\s+de\s+(.+)/i,
    run: (m) => smartOpen(m[2], m[3]),
    msg: (m) => `Buscando ${m[2]} de ${m[3]}` },

  // --- USB / DEVICES ---
  { match: /expulsa|saca|eyecta\s+(.+)/i,
    run: (m) => `(New-Object -ComObject Shell.Application).NameSpace(17).ParseName('${escapePs(m[1])}').InvokeVerb('Eject')`,
    msg: (m) => `Expulsando ${m[1]}` },

  // --- NIGHT LIGHT ---
  { match: /(luz\s+)?nocturna\s*(on|off|enciende|apaga)?|modo\s+noche|blue\s+light|night\s+light/i,
    run: `Start-Process ms-settings:nightlight`,
    msg: 'Abriendo luz nocturna' },

  // --- SYSTEM DIAGNOSTIC ---
  { match: /diagn[óo]stico|salud\s+(del\s+)?(sistema|pc|equipo)|health/i,
    run: ps_diagnostic,
    capture: true,
    msg: 'Ejecutando diagnóstico' },

  // --- MACRO CONTROL ---
  { match: /graba\s+(macro|una\s+macro)/i,
    handler: () => { memory.startRecording(); return 'Grabando macro. Di comandos y luego "guarda macro como [nombre]"' },
    msg: 'Grabando macro' },
  { match: /ejecuta\s+macro\s+(.+)/i,
    handler: (m) => { const cmds = memory.loadMacro(m[1]); if (!cmds) return `No encontré la macro "${m[1]}"`; return { message: 'Ejecutando macro', _macro: cmds } },
    msg: (m) => `Ejecutando macro ${m[1]}` },

  // --- WINDOW CAPTURE ---
  { match: /captura\s+(la\s+)?(pantalla|imagen|pantallazo)/i,
    run: screenshot,
    msg: 'Captura guardada en escritorio' },

  // --- CLIPBOARD ---
  { match: /copia\s+(.+)/i,
    run: (m) => `Set-Clipboard -Value '${escapePs(m[1])}'`,
    msg: (m) => `Copiado: "${m[1]}"` },
  { match: /pega|pegar|paste/i,
    run: `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')`,
    msg: 'Pegando' },
  { match: /cortar/i,
    run: `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^x')`,
    msg: 'Cortado' },

  // --- SYSTEM ---
  { match: /vac(i|í)a\s+(la\s+)?papelera/i,
    run: `(New-Object -ComObject Shell.Application).NameSpace(0xa).Items() | ForEach-Object { $_.InvokeVerb('delete') }`,
    confirm: 'Vaciar la papelera',
    msg: 'Papelera vaciada' },
  { match: /bloquea\s+(el\s+)?(equipo|pc|sesi[óo]n)?/i,
    run: `rundll32.exe user32.dll,LockWorkStation`,
    msg: 'Equipo bloqueado' },
  { match: /suspende|duerme|sleep/i,
    run: `rundll32.exe powrprof.dll,SetSuspendState 0,1,0`,
    confirm: 'Suspender el equipo',
    msg: 'Durmiendo' },
  { match: /apaga(?!do\b)\s*(el\s+)?(equipo|pc)?(\s+en\s+(\d+))?/i,
    run: (m) => `shutdown /s /t ${(m[4] || 30)} /c "Apagando por solicitud del asistente"`,
    confirm: (m) => `Apagar el equipo en ${m[4] || 30} segundos`,
    msg: (m) => `Apagando en ${m[4] || 30} segundos` },
  { match: /reinicia(?!\s+(el\s+)?servicio)\s*(el\s+)?(equipo|pc)?/i,
    run: `shutdown /r /t 20 /c "Reiniciando por solicitud del asistente"`,
    confirm: 'Reiniciar el equipo en 20 segundos',
    msg: 'Reiniciando en 20 segundos' },
  { match: /cancela\s+(el\s+)?(apagado|reinicio)/i,
    run: `shutdown /a`,
    priority: 10,
    msg: 'Apagado cancelado' },

  // --- SYSTEM INFO (capture patterns — return PS output) ---
  { match: /info\s+(sistema|del\s+sistema|del\s+pc|del\s+equipo)/i,
    run: ps_systemInfo,
    capture: true,
    msg: 'Obteniendo info del sistema' },
  { match: /\bsistemas\b|estado de (los )?sistemas|reporte del sistema/i,
    handler: async () => {
      const vitals = require('./vitals')
      const s = await vitals.snapshot()
      return vitals.reportText(s)
    },
    priority: 10,
    msg: 'Reportando sistemas' },
  { match: /espacio\s+(en\s+)?([a-z]):?/i,
    run: (m) => ps_diskSpace(m[2]),
    capture: true,
    msg: 'Consultando espacio en disco' },
  { match: /temperatura/i,
    run: ps_temperature,
    capture: true,
    msg: 'Leyendo temperatura' },
  { match: /(?:eventos|log)\s+(del\s+)?sistema\s*(.*)/i,
    run: (m) => ps_events(m[2]),
    capture: true,
    msg: 'Consultando eventos del sistema' },

  // --- SERVICE MANAGEMENT ---
  { match: /(lista|muestra)\s+(servicios|servicios\s+activos)/i,
    run: `Get-Service | Where Status -eq Running | Select -First 30 Name,DisplayName,Status | Format-Table -AutoSize -Wrap | Out-String -Width 4096`,
    capture: true,
    msg: 'Listando servicios' },
  { match: /inicia\s+(el\s+)?servicio\s+(.+)/i,
    run: (m) => `Start-Service '${escapePs(m[2])}' -ErrorAction SilentlyContinue; if ($?) { 'Iniciado' } else { 'Error al iniciar' }`,
    confirm: (m) => `Iniciar el servicio ${m[2]}`,
    priority: 10,
    msg: (m) => `Iniciando servicio ${m[2]}` },
  { match: /(det[eé]n|detiene|para|apaga)\s+(el\s+)?servicio\s+(.+)/i,
    run: (m) => `Stop-Service '${escapePs(m[3])}' -Force -ErrorAction SilentlyContinue; if ($?) { 'Detenido' } else { 'Error al detener' }`,
    confirm: (m) => `Detener el servicio ${m[3]}`,
    priority: 10,
    msg: (m) => `Deteniendo servicio ${m[3]}` },
  { match: /reinicia\s+(el\s+)?servicio\s+(.+)/i,
    run: (m) => `Restart-Service '${escapePs(m[2])}' -Force -ErrorAction SilentlyContinue; if ($?) { 'Reiniciado' } else { 'Error al reiniciar' }`,
    confirm: (m) => `Reiniciar el servicio ${m[2]}`,
    priority: 10,
    msg: (m) => `Reiniciando servicio ${m[2]}` },

  // --- MEMORY ---
  { match: /me llamo\s+(.+)/i,
    handler: (m) => { const n = m[1].trim().replace(/[.!,]+$/, ''); mood.setName(n); return `¡Hola ${n}! Ya te recuerdo.` },
    msg: 'Aprendiendo tu nombre' },
  { match: /cu[eé]ntame un chiste|dime un chiste|\bchiste\b/i,
    handler: () => fun.joke(),
    msg: 'Contando chiste' },
  { match: /cu[eé]ntame un dato|dime un dato|dato curioso|curiosidad/i,
    handler: () => fun.fact(),
    msg: 'Contando dato' },  { match: /recuerda\s+que\s+(.+?)\s+es\s+(.+)/i,
    handler: (m) => { memory.set(m[1].trim().toLowerCase(), m[2].trim()); return `Recordado: ${m[1]} es ${m[2]}` },
    msg: (m) => `Recordando ${m[1]}` },
  { match: /qu[eé]\s+recuerdas(\s+de\s+m[ií])?/i,
    handler: () => memory.list(),
    msg: 'Revisando memoria' },
  { match: /olvida\s+(.+)/i,
    handler: (m) => { memory.del(m[1].trim().toLowerCase()); return `Olvidado: ${m[1]}` },
    msg: (m) => `Olvidando ${m[1]}` },
  { match: /aprende\s+(.+?)\s+para\s+(.+)/i,
    handler: (m) => { memory.addCommand(m[1], m[2]); return `Aprendido: "${m[1]}" -> ${m[2]}` },
    msg: (m) => `Aprendiendo ${m[1]}` },
  { match: /olvida\s+comando\s+(.+)/i,
    handler: (m) => { const ok = memory.removeCommand(m[1]); return ok ? `Comando "${m[1]}" olvidado` : `No encontré "${m[1]}"` },
    msg: (m) => `Olvidando comando ${m[1]}` },
  { match: /muestra\s+comandos\s+(aprendidos|personalizados)/i,
    handler: () => { const d = require('./memory').load(); return d.custom_commands.length ? d.custom_commands.map((c,i) => `${i+1}. "${c.trigger}" -> ${c.reply || c.action}`).join('\n') : 'No hay comandos aprendidos' },
    msg: 'Mostrando comandos' },

  // --- OCR ---
  { match: /lee\s+(la\s+)?(pantalla|imagen|esto|lo\s+que\s+hay)/i,
    run: ps_ocr,
    capture: true,
    msg: 'Leyendo pantalla' },

  // --- MEDIA KEYS (send virtual keycodes for any media player) ---
  { match: /(siguiente\s+(canción|cancion|pista|tema)|pasa\s+(a\s+)?la\s+(siguiente|otra)|adelanta|skip|next)/i,
    run: `Add-Type -ErrorAction SilentlyContinue @"
using System;
using System.Runtime.InteropServices;
public class MK {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@; [MK]::keybd_event(0xB3,0,0,0); [MK]::keybd_event(0xB3,0,2,0)`,
    msg: 'Siguiente canción' },
  { match: /((canción|cancion|pista)\s+)?anterior|(regresa|volver|devuelve|prev|previous)/i,
    run: `Add-Type -ErrorAction SilentlyContinue @"
using System;
using System.Runtime.InteropServices;
public class MK {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@; [MK]::keybd_event(0xB2,0,0,0); [MK]::keybd_event(0xB2,0,2,0)`,
    msg: 'Canción anterior' },
  { match: /(pausa|para|det[eé]n|sigue|reproduce|contin[uú]a|play|resume)\s+(la\s+)?(m[uú]sica|canción|cancion|pista|audio|reproducción|reproduccion)/i,
    run: `Add-Type -ErrorAction SilentlyContinue @"
using System;
using System.Runtime.InteropServices;
public class MK {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@; [MK]::keybd_event(0xB0,0,0,0); [MK]::keybd_event(0xB0,0,2,0)`,
    msg: 'Play/Pause' },
  { match: /sube\s+(el\s+)?(volumen|sonido)|m[aá]s\s+(alto|fuerte|volumen)|volumen\s+(sube|arriba|\+)/i,
    run: `Add-Type -ErrorAction SilentlyContinue @"
using System;
using System.Runtime.InteropServices;
public class MK {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@; for($i=0;$i<5;$i++){[MK]::keybd_event(0xAF,0,0,0);[MK]::keybd_event(0xAF,0,2,0)}`,
    msg: 'Volumen +' },
  { match: /baja\s+(el\s+)?(volumen|sonido)|m[eé]nos\s+(alto|fuerte|volumen)|volumen\s+(baja|abajo|\-)/i,
    run: `Add-Type -ErrorAction SilentlyContinue @"
using System;
using System.Runtime.InteropServices;
public class MK {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@; for($i=0;$i<5;$i++){[MK]::keybd_event(0xAE,0,0,0);[MK]::keybd_event(0xAE,0,2,0)}`,
    msg: 'Volumen -' },
  { match: /(silencia|mut[eé]a|silencio|mute)\s*(el\s+)?(volumen|sonido|audio|m[uú]sica)?/i,
    run: `Add-Type -ErrorAction SilentlyContinue @"
using System;
using System.Runtime.InteropServices;
public class MK {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@; [MK]::keybd_event(0xAD,0,0,0); [MK]::keybd_event(0xAD,0,2,0)`,
    msg: 'Silenciar' },

  // --- PROCESS (upgraded) ---
  { match: /(lista|muestra|qu[eé])\s+(procesos|ejecut|programas)/i,
    run: `Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Name, Id, @{N='Mem(MB)';E={[math]::Round($_.WS/1MB,1)}}, @{N='CPU(s)';E={[math]::Round($_.TotalProcessorTime.TotalSeconds,1)}} | Sort-Object 'Mem(MB)' -Desc | Format-Table -AutoSize | Out-String -Width 4096`,
    capture: true,
    msg: 'Listando procesos' },
  { match: /mata\s+(proceso\s+)?(\d+)/i,
    run: (m) => `Stop-Process -Id ${m[2]} -Force -ErrorAction SilentlyContinue; if ($?) { 'Matado' } else { 'No se pudo matar' }`,
    confirm: (m) => `Matar el proceso ${m[2]}`,
    msg: (m) => `Matando proceso ${m[2]}` },
  { match: /prioridad\s+(alta|normal|baja|idle|above\s+normal|below\s+normal)\s+(?:a\s+)?(?:proceso\s+)?(\d+)/i,
    run: (m) => { const map = { alta:'High',normal:'Normal',baja:'Idle',idle:'Idle','above normal':'AboveNormal','below normal':'BelowNormal' }; return `(Get-Process -Id ${m[2]} -ErrorAction SilentlyContinue).PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${map[m[1].toLowerCase()] || 'Normal'}` },
    msg: (m) => `Prioridad ${m[1]} para proceso ${m[2]}` },

  // --- APPEND TO FILE ---
  { match: /a[ñn]ade\s+(?:texto|contenido|l[ií]nea)?\s+(.+?)\s+(?:al?\s+)?archivo\s+(.+)|escribe\s+en\s+el\s+archivo\s+(.+?)\s+(.+)/i,
    run: (m) => `Add-Content -Path ${psStr(m[2] || m[3])} -Value ${psStr(m[1] || m[4])} -Encoding UTF8`,
    msg: (m) => `Contenido añadido al archivo` },

  // --- FIND LARGE FILES ---
  { match: /archivos?\s+(grandes|pesados|mas\s+grandes|m[aá]s\s+pesados?)\s*(?:de\s+(.+))?|busca\s+archivos?\s+grandes\s*(?:en\s+(.+))?/i,
    run: (m) => `Get-ChildItem -Path ${psStr(m[2] || m[3] || '.')} -Recurse -File -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 10 | Select-Object @{N='Tamaño(MB)';E={'{0:N2}' -f ($_.Length/1MB)}}, Name, FullName | Format-Table -AutoSize | Out-String`,
    capture: true,
    msg: 'Buscando archivos grandes...' },

  // --- DELETE FOLDER ---
  { match: /borra\s+(la\s+)?carpeta\s+(.+)|elimina\s+(la\s+)?carpeta\s+(.+)/i,
    run: (m) => `Remove-Item -Path ${psStr(m[2] || m[4])} -Recurse -Force -ErrorAction SilentlyContinue`,
    confirm: (m) => `Borrar la carpeta ${m[2] || m[4]}`,
    msg: (m) => `Carpeta ${m[2] || m[4]} borrada` },

  // --- FILE PROPERTIES / INFO ---
  { match: /(propiedades|informaci[óo]n|detalles|info)\s+(del\s+)?(archivo|fichero)\s+(.+)/i,
    run: (m) => `Get-Item -Path ${psStr(m[4])} -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime, CreationTime, Attributes, Extension, FullName | Format-List | Out-String`,
    capture: true,
    msg: (m) => `Mostrando propiedades de ${m[4]}` },

  // --- COMPARE FILES ---
  { match: /compara\s+(.+?)\s+(?:con|y)\s+(.+)/i,
    run: (m) => {
      const f1 = m[1].trim().replace(/'/g, "''")
      const f2 = m[2].trim().replace(/'/g, "''")
      return `Compare-Object (Get-Content '${f1}') (Get-Content '${f2}') | Select-Object InputObject, SideIndicator | Format-Table -AutoSize | Out-String`
    },
    capture: true,
    msg: (m) => `Comparando archivos...` },

  // --- DUPLICATE FILES ---
  { match: /archivos?\s+duplicados?\s*(?:en\s+(.+))?|busca\s+duplicados?\s*(?:en\s+(.+))?/i,
    run: (m) => `$dir = '${(m[1] || m[2] || '.').replace(/'/g, "''")}'; Get-ChildItem $dir -Recurse -File -ErrorAction SilentlyContinue | Group-Object Length | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Group | Select-Object Name, FullName, @{N='Size';E={$_.Length}} } | Format-Table -AutoSize | Out-String`,
    capture: true,
    msg: 'Buscando archivos duplicados...' },

  // --- SPLIT SCREEN ---
  { match: /((?:chrome|edge|firefox|brave|explorer)\s+)?a\s+(la\s+)?izquierda\s+(?:y\s+)?((?:code|vs\s+code|terminal|explorer|notepad|slack|spotify|word|excel|outlook)\s+)?a\s+(la\s+)?derecha|pone?\s+(.+?)\s+(izquierda|derecha)/i,
    handler: async (m) => {
      const leftApp = m[1] || m[5] || 'chrome'
      const rightApp = m[3] || ''
      const side = (m[2] || m[6] || '').toLowerCase().includes('izq') ? 'left' : 'right'
      const winKey = side === 'left' ? 'left' : 'right'
      const ps = rightApp
        ? `Start-Process "${leftApp}"; Start-Sleep 1; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^{${winKey}}"); Start-Process "${rightApp}"; Start-Sleep 1; [System.Windows.Forms.SendKeys]::SendWait("^{${winKey}}")`
        : `Start-Process "${leftApp}"; Start-Sleep 1; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^{${winKey}}")`
      const { exec } = require('child_process')
      exec(ps, { shell: 'powershell', timeout: 10000 })
      return { success: true, message: `Colocando ${leftApp} a la ${side === 'left' ? 'izquierda' : 'derecha'}${rightApp ? ' y ' + rightApp + ' a la ' + (side === 'left' ? 'derecha' : 'izquierda') : ''}` }
    },
    msg: 'Dividiendo pantalla...' },

  // --- MICROPHONE TOGGLE ---
  { match: /(silenicia|activa|desactiva|silencia|enciende|apaga)\s+(el\s+)?micr[óo]fono|mute\s+mic|mic\s+(on|off|mute)/i,
    run: (m) => {
      const isOff = /silencio|desactiva|apaga|off|mute/i.test(m[0])
      return isOff
        ? `$d = Get-CimInstance -Namespace root/CIMV2 -ClassName Win32_SoundDevice | Select-Object -First 1; if ($d) { Invoke-CimMethod -InputObject $d -MethodName SetDeviceState -Arguments @{State = 0}; Write-Output 'Micrófono desactivado' } else { Write-Output 'No se pudo desactivar el micrófono' }`
        : `$d = Get-CimInstance -Namespace root/CIMV2 -ClassName Win32_SoundDevice | Select-Object -First 1; if ($d) { Invoke-CimMethod -InputObject $d -MethodName SetDeviceState -Arguments @{State = 1}; Write-Output 'Micrófono activado' } else { Write-Output 'No se pudo activar el micrófono' }`
    },
    capture: true,
    msg: (m) => `${/silencio|desactiva|apaga|off|mute/i.test(m[0]) ? 'Desactivando' : 'Activando'} micrófono` },

  // --- SCHEDULED SHUTDOWN ---
  { match: /ap[aá]gate\s+(?:en\s+)?(\d+)\s*(minutos?|min|segundos?|seg|horas?|h)?|apaga\s+(?:el\s+)?(?:pc|equipo|computadora?)\s+(?:en\s+)?(\d+)\s*(minutos?|min|segundos?|seg|horas?|h)?/i,
    run: (m) => {
      const num = parseInt(m[1] || m[3])
      const unit = (m[2] || m[4] || '').toLowerCase()
      let secs = unit.startsWith('h') ? num * 3600 : unit.startsWith('m') || unit.startsWith('min') ? num * 60 : num
      return `shutdown /s /t ${secs} /c "Apagado programado por asistente de voz"; Write-Output "Apagando en ${num} ${unit || 'segundos'}"`
    },
    capture: true,
    confirm: (m) => `Apagar el equipo en ${m[1] || m[3]} ${(m[2] || m[4] || 'segundos')}`,
    priority: 10,
    msg: (m) => `Apagando en ${m[1] || m[3]} ${(m[2] || m[4] || 'segundos')}` },
  { match: /cancela\s+(el\s+)?apagado|cancela\s+(el\s+)?reinicio|aborta\s+(el\s+)?shutdown/i,
    run: `shutdown /a; Write-Output 'Apagado cancelado'`,
    capture: true,
    msg: 'Cancelando apagado programado' },

  // --- FOCUS ASSIST / DO NOT DISTURB ---
  { match: /(no\s+)?molestar|focus\s+assist|no\s+disturb|silencio\s+total/i,
    run: (m) => {
      const on = !/apaga|off|desactiva|quita/i.test(m[0])
      return on
        ? `Set-ItemProperty -Path "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" -Name "NOC_GLOBAL_SETTING_TOASTS_ENABLED" -Value 0 -Type DWord -Force; Write-Output 'No molestar activado'`
        : `Set-ItemProperty -Path "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" -Name "NOC_GLOBAL_SETTING_TOASTS_ENABLED" -Value 1 -Type DWord -Force; Write-Output 'No molestar desactivado'`
    },
    capture: true,
    msg: (m) => `${!/apaga|off|desactiva|quita/i.test(m[0]) ? 'Activando' : 'Desactivando'} modo no molestar` },

  // --- SEARCH SHORTCUTS ---
  { match: /busca\s+(en\s+)?(wikipedia|amazon|mercadolibre|ebay|aliexpress|walmart|bestbuy)\s+(.+)/i,
    run: (m) => {
      const sites = {
        wikipedia: 'https://es.wikipedia.org/wiki/',
        amazon: 'https://www.amazon.com/s?k=',
        mercadolibre: 'https://listado.mercadolibre.com/',
        ebay: 'https://www.ebay.com/sch/i.html?_nkw=',
        aliexpress: 'https://www.aliexpress.com/wholesale?SearchText=',
        walmart: 'https://www.walmart.com/search?q=',
        bestbuy: 'https://www.bestbuy.com/site/searchpage.jsp?st=',
      }
      const site = m[2].toLowerCase()
      const query = encodeURIComponent(m[3].trim())
      return site === 'wikipedia'
        ? `start "${sites[site]}${query.replace(/%20/g, '_')}"`
        : `start "${sites[site]}${query}"`
    },
    msg: (m) => `Buscando "${m[3]}" en ${m[2]}` },

  // --- OPEN COMMON SITES ---
  { match: /abre\s+(mercadolibre|ebay|aliexpress|walmart|bestbuy|amazon|wikipedia|reddit|twitter|facebook|instagram|linkedin|youtube|twitch|gmail|drive|docs|github|stackoverflow|whatsapp)/i,
    run: (m) => {
      const sites = {
        mercadolibre: 'https://mercadolibre.com',
        ebay: 'https://ebay.com',
        aliexpress: 'https://aliexpress.com',
        walmart: 'https://walmart.com',
        bestbuy: 'https://bestbuy.com',
        amazon: 'https://amazon.com',
        wikipedia: 'https://es.wikipedia.org',
        reddit: 'https://reddit.com',
        twitter: 'https://twitter.com',
        facebook: 'https://facebook.com',
        instagram: 'https://instagram.com',
        linkedin: 'https://linkedin.com',
        youtube: 'https://youtube.com',
        twitch: 'https://twitch.tv',
        gmail: 'https://mail.google.com',
        drive: 'https://drive.google.com',
        docs: 'https://docs.google.com',
        github: 'https://github.com',
        stackoverflow: 'https://stackoverflow.com',
        whatsapp: 'https://web.whatsapp.com',
      }
      return `start "${sites[m[1].toLowerCase()]}"`
    },
    msg: (m) => `Abriendo ${m[1]}` },

  // --- WEATHER EXTENDED ---
  { match: /va\s+a\s+(llover|nevar|granizar)|pron[oó]stico\s+(?:del\s+)?(?:tiempo|clima)\s*(.+)?|c[oó]mo\s+estar[aá]\s+el\s+(clima|tiempo)\s+(.+)?|qu[eé]\s+(temperatura|clima)\s+(har[aá]|va\s+a\s+hacer)\s+(.+)?/i,
    run: (m) => {
      const city = (m[2] || m[4] || m[6] || '').trim() || 'Ciudad de México'
      const enc = encodeURIComponent(city)
      return `try { $r = Invoke-WebRequest -Uri "https://wttr.in/${enc}?format=j1" -UseBasicParsing -ErrorAction Stop; $d = ($r.Content | ConvertFrom-Json).current_condition[0]; "Clima en ${city}: $($d.weatherDesc[0].value) | Temp: $($d.temp_C)°C (sensación $($d.FeelsLikeC)°C) | Humedad: $($d.humidity)% | Viento: $($d.windspeedKmph) km/h | Lluvia: $($d.precipMM) mm" } catch { "No pude obtener el clima de ${city}" }`
    },
    capture: true,
    msg: (m) => `Consultando clima...` },

  // --- SEND WHATSAPP VIA WEB ---
  { match: /env[ií]a\s+(un\s+)?whatsapp\s+(?:a|para)\s+(.+?)\s+(?:diciendo|con\s+el\s+texto|que\s+diga)\s+(.+)/i,
    run: (m) => {
      const text = encodeURIComponent(m[3].trim())
      return `start "https://web.whatsapp.com/send?phone=&text=${text}&type=phone_number&app_absent=1"`
    },
    msg: (m) => `Abriendo WhatsApp para enviar a ${m[2]}` },

  // --- DICTATION MODE ---
  { match: /(empieza|inicia|activa)\s+(?:el\s+)?(?:modo\s+)?dictado|dictado\s+(?:continuo|largo)/i,
    run: `Add-Type -AssemblyName System.Windows.Forms; $wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('{WIN}'); Start-Sleep 0.5; $wshell.SendKeys('configuración de dictado'); Start-Sleep 1; $wshell.SendKeys('{ENTER}')`,
    msg: 'Activando dictado de Windows (Win+H). Habla y escribe automáticamente.' },

  // --- QUICK CONSOLE ---
  { match: /ejecuta\s+(?:el\s+)?comando\s+(.+)|corre\s+(?:el\s+)?comando\s+(.+)|powershell\s+(.+)/i,
    run: (m) => {
      const cmd = (m[1] || m[2] || m[3]).trim()
      return cmd.startsWith('npm') || cmd.startsWith('node') || cmd.startsWith('git')
        ? `cmd /c "${cmd}" 2>&1`
        : `${cmd} 2>&1`
    },
    capture: true,
    confirm: (m) => `Ejecutar: ${m[1] || m[2] || m[3]}`,
    msg: (m) => `Ejecutando: ${m[1] || m[2] || m[3]}` },

  // --- RUN SCRIPT / BUILD ---
  { match: /corre\s+(npm\s+\w+|yarn\s+\w+|pnpm\s+\w+|python\s+.+|node\s+.+|npx\s+.+|dotnet\s+\w+|cargo\s+\w+)/i,
    run: (m) => `cmd /c "${m[1]}" 2>&1`,
    capture: true,
    confirm: (m) => `Ejecutar ${m[1]} en la terminal`,
    msg: (m) => `Ejecutando ${m[1]}` },

  // --- OPEN PROJECT IN VS CODE ---
  { match: /abre\s+(el\s+)?(proyecto|project)\s+(.+?)\s+(?:en\s+)?(vs\s+code|visual\s+studio\s+code|vscode)?/i,
    run: (m) => {
      const name = m[3].trim().toLowerCase()
      const dirs = [
        process.env.USERPROFILE + '\\Documents',
        process.env.USERPROFILE + '\\Documents\\projects',
        process.env.USERPROFILE + '\\Documents\\GitHub',
        process.env.USERPROFILE + '\\Desktop',
        process.env.USERPROFILE + '\\source',
        process.env.USERPROFILE + '\\source\\repos',
      ]
      return `$dirs = @($(Get-ChildItem '${dirs.join("','")}' -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*${name}*' })); if ($dirs) { code $dirs[0].FullName } else { Write-Output 'No encontré el proyecto "${name}"' }`
    },
    capture: true,
    msg: (m) => `Buscando proyecto "${m[3]}"...` },

  // --- WELCOME / GREETING ---
  { match: /buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|hola\s+(asistente|bot)/i,
    run: `$h = (Get-Date).Hour; $saludo = if ($h -lt 12) { 'Buenos días' } elseif ($h -lt 18) { 'Buenas tardes' } else { 'Buenas noches' }; $fecha = Get-Date -Format "dddd, d 'de' MMMM"; $hora = Get-Date -Format "HH:mm"; try { $r = Invoke-WebRequest -Uri "https://wttr.in/?format=j1" -UseBasicParsing -ErrorAction SilentlyContinue; $t = ($r.Content | ConvertFrom-Json).current_condition[0].temp_C; "$saludo! Hoy es $fecha y son las $hora. Temperatura actual: $t°C" } catch { "$saludo! Hoy es $fecha y son las $hora" }`,
    capture: true,
    msg: (m) => m[0] },

  // --- SEARCH HISTORY ---
  { match: /qu[eé]\s+(le\s+)?ped[ií]|historial|qu[eé]\s+(dije|dijiste|hicimos?)\s+(antes|ayer|anterior)/i,
    handler: async () => {
      const fs = require('fs')
      const path = require('path')
      const histPath = path.join(require('os').tmpdir(), '_ai_history.json')
      try {
        const data = JSON.parse(fs.readFileSync(histPath, 'utf8'))
        const last = data.slice(-5).reverse()
        return { success: true, message: 'Últimos comandos:\n' + last.map((h, i) => `${i+1}. "${h.q}" → ${h.a.substring(0, 60)}`).join('\n') }
      } catch {
        return { success: true, message: 'No hay historial guardado' }
      }
    },
    msg: 'Consultando historial' },

  // --- WINDOW PROFILES ---
  { match: /prepara\s+(el\s+)?(pc|equipo|computadora|escritorio)\s+(para\s+)?(trabajar|programar|estudiar|jugar|diseñar|editar|desarrollar)/i,
    handler: async (m) => {
      const profiles = {
        trabajar: ['chrome', 'outlook', 'slack', 'code'],
        programar: ['chrome', 'code', 'terminal'],
        estudiar: ['chrome', 'onenote', 'word'],
        jugar: ['steam', 'discord', 'chrome'],
        diseñar: ['chrome', 'figma', 'photoshop'],
        editar: ['premiere', 'chrome', 'spotify'],
        desarrollar: ['code', 'chrome', 'docker', 'terminal'],
      }
      const mode = m[4]?.toLowerCase() || 'trabajar'
      const apps = profiles[mode] || profiles.trabajar
      const { exec } = require('child_process')
      for (const app of apps) {
        exec(`start "" "${app}"`, { timeout: 3000 }, () => {})
      }
      return { success: true, message: `Preparando PC para ${mode}: ${apps.join(', ')}` }
    },
    msg: (m) => `Preparando PC para ${m[4] || 'trabajar'}...` },

  // --- CONVERT FORMATS ---
  { match: /convierte\s+(.+?)\s+(?:a|en)\s+(pdf|docx?|doc|txt|png|jpg|mp3|mp4)/i,
    run: (m) => {
      const file = m[1].trim().replace(/'/g, "''")
      const target = m[2].toLowerCase()
      let ps = ''
      if (target === 'pdf' && /\.docx?$/i.test(file)) {
        ps = `$w = New-Object -ComObject Word.Application -ErrorAction Stop; $w.Visible = $false; $d = $w.Documents.Open('${file}'); $pdf = '${file}'.Replace('.docx','.pdf').Replace('.doc','.pdf'); $d.SaveAs([ref] $pdf, [ref] 17); $d.Close(); $w.Quit(); Write-Output 'Convertido a PDF'`
      } else if (target === 'pdf' && /\.(xlsx?|xls)$/i.test(file)) {
        ps = `$e = New-Object -ComObject Excel.Application -ErrorAction Stop; $e.Visible = $false; $wb = $e.Workbooks.Open('${file}'); $pdf = '${file}'.Replace('.xlsx','.pdf').Replace('.xls','.pdf'); $wb.ExportAsFixedFormat(0, $pdf); $wb.Close(); $e.Quit(); Write-Output 'Convertido a PDF'`
      } else if (target === 'txt' && /\.(docx?|pdf)$/i.test(file)) {
        ps = `$w = New-Object -ComObject Word.Application -ErrorAction Stop; $w.Visible = $false; $d = $w.Documents.Open('${file}'); $txt = '${file}'.Replace('.docx','.txt').Replace('.doc','.txt').Replace('.pdf','.txt'); $d.SaveAs([ref] $txt, [ref] 2); $d.Close(); $w.Quit(); Write-Output 'Convertido a TXT'`
      } else {
        ps = `Write-Output 'Formato no soportado. Prueba: docx a pdf, xlsx a pdf, docx a txt'`
      }
      return ps
    },
    capture: true,
    msg: (m) => `Convirtiendo ${m[1]} a ${m[2]}` },

  // --- DESKTOP ORGANIZER ---
  { match: /limpia\s+(el\s+)?escritorio|organiza\s+(el\s+)?escritorio|ordena\s+(el\s+)?escritorio/i,
    run: `$desktop = [Environment]::GetFolderPath('Desktop'); $exts = @{ Images = @('.jpg','.jpeg','.png','.gif','.bmp','.webp','.svg'); Documents = @('.pdf','.docx','.doc','.xlsx','.xls','.pptx','.txt','.md','.csv'); Archives = @('.zip','.rar','.7z','.tar','.gz'); Videos = @('.mp4','.avi','.mkv','.mov','.wmv'); Music = @('.mp3','.wav','.flac','.aac','.ogg'); Installers = @('.exe','.msi','.bat','.ps1'); Shortcuts = @('.lnk'); Code = @('.js','.py','.html','.css','.json','.xml','.ts','.jsx','.tsx','.cpp','.c','.h') }; $moved = 0; Get-ChildItem $desktop -File | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object { $dest = ''; foreach ($cat in $exts.Keys) { if ($_.Extension -in $exts[$cat]) { $dest = Join-Path $desktop $cat; break } }; if (-not $dest) { $dest = Join-Path $desktop 'Others' }; if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }; Move-Item -Path $_.FullName -Destination (Join-Path $dest $_.Name) -Force -ErrorAction SilentlyContinue; $moved++ }; Write-Output "Escritorio organizado: $moved archivos movidos a carpetas por tipo"`,
    capture: true,
    msg: 'Organizando escritorio...' },

  // --- PRICE MONITOR (Amazon simple) ---
  { match: /cu[aá]nto\s+(cuesta|vale|est[aá])\s+(.+?)\s+(?:en\s+)?amazon/i,
    run: (m) => {
      const query = encodeURIComponent(m[2].trim())
      return `try { $r = Invoke-WebRequest -Uri "https://www.amazon.com/s?k=${query}" -UseBasicParsing -Headers @{'User-Agent'='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'} -ErrorAction Stop; $r.ParsedHtml.body.innerText -match '\\$[\\d.,]+'; if ($Matches) { Write-Output "Precio aproximado: $($Matches[0])" } else { Write-Output "No pude obtener precio. Abriendo Amazon..."; Start-Process "https://www.amazon.com/s?k=${query}" } } catch { Start-Process "https://www.amazon.com/s?k=${query}"; Write-Output 'Abriendo Amazon...' }`
    },
    capture: true,
    msg: (m) => `Buscando precio de ${m[2]} en Amazon` },

  // --- BATTERY HEALTH ---
  { match: /(salud|estado|vida)\s+(de\s+la\s+)?bater[ií]a|bater[ií]a\s+(salud|estado|health|report)/i,
    run: `$r = powercfg /batteryreport /output "$env:TEMP\\battery.html" 2>&1; if ($?) { Write-Output 'Reporte generado en: ' + "$env:TEMP\\battery.html"; Start-Process "$env:TEMP\\battery.html" } else { $b = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue; if ($b) { "$($b.EstimatedChargeRemaining)% - $($b.BatteryStatusDescription)" } else { 'No se detectó batería' } }`,
    capture: true,
    msg: 'Generando reporte de batería...' },

  // --- FIND MISSING FILE (search by partial name + recent) ---
  { match: /d[oó]nde\s+(est[aá]|qued[oó])\s+(.+?)(?:\s+(que\s+)?(descargu[eé]|baj[eé]|cre[eé]|guard[eé]))?/i,
    run: (m) => {
      const name = m[2].trim()
      return `$results = Get-ChildItem "$env:USERPROFILE\\Downloads","$env:USERPROFILE\\Desktop","$env:USERPROFILE\\Documents" -Recurse -Filter "*${name}*" -ErrorAction SilentlyContinue | Select-Object FullName, Length, LastWriteTime -First 5; if ($results) { $results | Format-Table -AutoSize | Out-String } else { Write-Output "No encontré '${name}' en las carpetas habituales" }`
    },
    capture: true,
    msg: (m) => `Buscando ${m[2]}...` },

  // --- SCREENSHOT REGION ---
  { match: /captura\s+(una\s+)?(regi[óo]n|parte|área|selección?|zona)/i,
    run: `Start-Process ms-screenclip:`,
    msg: 'Abriendo recorte de pantalla. Selecciona el área con el mouse.' },

  // --- VOLUME CONTROL BY APP ---
  { match: /volumen\s+(de\s+)?(.+?)\s+(sube|baja|silencio|mute|a\s+\d+)/i,
    run: (m) => {
      const app = m[2].trim()
      const action = m[3].toLowerCase()
      let ps = ''
      if (action.includes('silencio') || action.includes('mute')) {
        ps = `$s = Get-AudioProcess -ProcessName '${app}' -ErrorAction SilentlyContinue; if (-not $s) { $s = Get-Process '${app}' -ErrorAction SilentlyContinue }; if ($s) { $s | Set-Audio -Mute $true }; Write-Output 'App silenciada'`
      } else if (/\d+/.test(action)) {
        const val = parseInt(action.match(/\d+/)[0])
        ps = `$s = Get-Process '${app}' -ErrorAction SilentlyContinue; if ($s) { $s | Set-Audio -Volume (${val}/100) }; Write-Output 'Volumen de ${app} al ${val}%'`
      } else if (action.includes('sube')) {
        ps = `$s = Get-Process '${app}' -ErrorAction SilentlyContinue; if ($s) { $s | Set-Audio -Volume (+0.1) }; Write-Output 'Subiendo volumen de ${app}'`
      } else {
        ps = `Write-Output 'No pude ajustar volumen de ${app}. Necesita módulo AudioCmdlets'`
      }
      return ps
    },
    msg: (m) => `Ajustando volumen de ${m[2]}` },
]

function escapePs(str) { return str.replace(/'/g, "''").replace(/\$/g, '`$').replace(/`/g, '``').replace(/"/g, '`"') }
function psStr(str) { return "'" + str.replace(/'/g, "''") + "'" }

function getWifiAdapter() { return 'Wi-Fi' }

function stopProcess(name) {
  const clean = name.replace(/^(el |la |lo |un |una |por\s+favor)/i, '').trim()
  return `Get-Process -Name '${escapePs(clean)}' -ErrorAction SilentlyContinue | Stop-Process -Force`
}

function browserIncognito(browser) {
  const flags = { chrome: '--incognito', firefox: '-private-window', edge: '-inprivate', brave: '--incognito' }
  return `start ${browser} "${flags[browser] || '--incognito'}"`
}

function brightnessChange(dir, val) {
  if (val) { const v = Math.min(100, Math.max(0, parseInt(val))); return `$m = Get-CimInstance -Namespace root/WMI -Class WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue; if ($m) { $m.WmiSetBrightness(1, ${v}) }` }
  const delta = /sube|subir|aumenta/i.test(dir) ? 20 : -20
  return `$m = Get-CimInstance -Namespace root/WMI -Class WmiMonitorBrightness -ErrorAction SilentlyContinue; if ($m) { $c = $m.CurrentBrightness; $n = [Math]::Min(100,[Math]::Max(0, $c ${delta>=0?'+':'-'} ${Math.abs(delta)})); $wm = Get-CimInstance -Namespace root/WMI -Class WmiMonitorBrightnessMethods; if ($wm) { $wm.WmiSetBrightness(1,$n) } }`
}

function windowCmd(name, action) {
  const clean = name.replace(/^(el |la |lo |la ventana de |la ventana del? |ventana |programa |app )/i, '').trim()
  if (!action) return `$wshell = New-Object -ComObject WScript.Shell; $wshell.AppActivate('${escapePs(clean)}')`
  return `$wshell = New-Object -ComObject WScript.Shell; $wshell.AppActivate('${escapePs(clean)}'); Start-Sleep -Milliseconds 500; $wshell.SendKeys('{${action}}')`
}

function createFolder(name, location) {
  const dir = location ? mapLocation(location) : '$env:USERPROFILE\\Desktop'
  const clean = name.replace(/^(carpeta |directorio |llamada |llamado )/i, '').trim()
  return `New-Item -Path "${dir}" -Name '${escapePs(clean)}' -ItemType Directory -Force | Out-Null`
}

function mapLocation(loc) {
  const l = loc.toLowerCase().trim()
  if (l.includes('escritorio')) return '$env:USERPROFILE\\Desktop'
  if (l.includes('documento')) return '$env:USERPROFILE\\Documents'
  if (l.includes('descarga')) return '$env:USERPROFILE\\Downloads'
  if (l.includes('imagen')) return '$env:USERPROFILE\\Pictures'
  if (l.includes('música') || l.includes('musica')) return '$env:USERPROFILE\\Music'
  if (l.includes('vídeo') || l.includes('video')) return '$env:USERPROFILE\\Videos'
  return `"${escapePs(loc)}"`
}

function openSettings(page) {
  if (!page) return `start ms-settings:`
  const pages = {
    red: 'ms-settings:network', wifi: 'ms-settings:network-wifi', bluetooth: 'ms-settings:bluetooth',
    sonido: 'ms-settings:sound', audio: 'ms-settings:sound', pantalla: 'ms-settings:display',
    monitor: 'ms-settings:display', fondo: 'ms-settings:personalization-background',
    temas: 'ms-settings:themes', 'taskbar': 'ms-settings:taskbar', notificaciones: 'ms-settings:notifications',
    aplicaciones: 'ms-settings:appsfeatures', 'apps': 'ms-settings:appsfeatures',
    cuenta: 'ms-settings:accounts', cuentas: 'ms-settings:accounts',
    fecha: 'ms-settings:dateandtime', hora: 'ms-settings:dateandtime',
    idioma: 'ms-settings:regionlanguage', teclado: 'ms-settings:typing',
    mouse: 'ms-settings:mousetouchpad', 'touchpad': 'ms-settings:mousetouchpad',
    impresora: 'ms-settings:printers', impresoras: 'ms-settings:printers',
    usb: 'ms-settings:usb', energía: 'ms-settings:powersleep', 'batería': 'ms-settings:batterysaver',
    almacenamiento: 'ms-settings:storagesense', multimedia: 'ms-settings:gaming-gamebar',
    juegos: 'ms-settings:gaming-gamebar', 'facilidad': 'ms-settings:easeofaccess',
    recuperación: 'ms-settings:recovery', activación: 'ms-settings:activation',
    'about': 'ms-settings:about', 'acerca': 'ms-settings:about',
  }
  const key = Object.keys(pages).find(k => page.toLowerCase().includes(k))
  return `start ${pages[key] || 'ms-settings:'}`
}

function screenshot() {
  const outPath = `${os.homedir()}\\Desktop\\captura_${Date.now()}.png`
  return `Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save('${outPath.replace(/\\/g, '\\\\')}')
$g.Dispose(); $bmp.Dispose()`
}

let _chromePort = null
const CHROME_PORTS = [9222, 9223, 9224, 9225, 9229]

async function _findChromePort() {
  for (const port of CHROME_PORTS) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
          let d = ''
          res.on('data', c => d += c)
          res.on('end', () => { try { const j = JSON.parse(d); if (j.Browser) resolve(port) } catch { reject() } })
        })
        req.on('error', reject)
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')) })
      })
      _chromePort = port
      return port
    } catch (e) { logger.warn('Chrome sin remote-debugging en puerto', port, '-', e.message) }
  }
  return null
}

function chromeDebugUrl(path) {
  const port = _chromePort || 9222
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { reject(new Error('parse fail')) } })
    }).on('error', (e) => reject(e))
  })
}

function startChromeDebug() {
  return new Promise(async (resolve) => {
    const found = await _findChromePort()
    if (found) { resolve(found); return }
    const port = 9222
    exec(`start chrome --remote-debugging-port=${port}`, () => {
      setTimeout(() => resolve(port), 2000)
    })
  })
}

async function chromeListTabs() {
  try {
    await startChromeDebug()
    const tabs = await chromeDebugUrl('/json')
    if (!tabs || !tabs.length) return 'No hay pestañas abiertas'
    return tabs.map((t, i) => `${i+1}. ${t.title || 'sin título'} — ${t.url || ''}`).slice(0, 20).join('\n')
  } catch { return 'Chrome no responde. Asegúrate de tener Chrome instalado' }
}

async function chromeCloseTab(idx) {
  try {
    const port = _chromePort || 9222
    const tabs = await chromeDebugUrl('/json')
    if (!tabs || idx >= tabs.length) return `start echo No se encontró pestaña ${idx+1}`
    const id = tabs[idx].id
    return `start chrome "http://127.0.0.1:${port}/json/close/${id}"`
  } catch { return `start echo Error conectando con Chrome` }
}

function chromeNewTab(url) {
  const u = url.startsWith('http') ? url : `https://${url}`
  return `start chrome "${u}"`
}

function findAndOpen(typeName, searchName) {
  const extMap = { excel: ['.xlsx', '.xls'], word: ['.docx', '.doc'], pdf: ['.pdf'],
    documento: ['.docx', '.doc', '.pdf', '.txt'], archivo: [''],
    ppt: ['.pptx', '.ppt'], powerpoint: ['.pptx', '.ppt'] }
  const exts = extMap[typeName.toLowerCase()] || ['.' + typeName]
  const dirs = ['$env:USERPROFILE\\Desktop', '$env:USERPROFILE\\Documents', '$env:USERPROFILE\\Downloads']
  const escaped = searchName.replace(/'/g, "''")
  return [
    '$found = @()',
    ...dirs.map(d => `$found += Get-ChildItem "${d}" -Recurse -File -ErrorAction SilentlyContinue | Where { $_.Name -like "*${escaped}*" ${exts[0] ? ' -and ($_.Extension -in @(' + exts.map(e => "'" + e + "'").join(',') + '))' : ''} } | Select -First 3`),
    'if ($found) {',
    '  $f = $found[0].FullName',
    '  "$f"',
    '  Invoke-Item $f',
    '} else {',
    '  "No encontré ' + searchName + '"',
    '}',
  ].join('\n')
}

function smartOpen(typeName, searchName) {
  return findAndOpen(typeName, searchName)
}

function ps_grep(text) {
  const t = text.replace(/'/g, "''")
  return [
    '$dirs = @("$env:USERPROFILE\\Desktop", "$env:USERPROFILE\\Documents", "$env:USERPROFILE\\Downloads")',
    '$results = @()',
    'foreach ($d in $dirs) {',
    '  $results += Get-ChildItem $d -Recurse -File -ErrorAction SilentlyContinue | Select-String -Pattern "' + t + '" -SimpleMatch -ErrorAction SilentlyContinue | Select -First 10 FileName, Path, LineNumber, Line',
    '}',
    'if ($results) { $results | Select -First 20 | Format-Table -AutoSize -Wrap | Out-String -Width 4096 } else { "No encontré archivos con ese texto" }',
  ].join('\n')
}

function ps_ocr() {
  const tmpImg = path.join(os.tmpdir(), `_ai_ocr_${Date.now()}.png`)
  return [
    // Screenshot
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
    '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    '$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height',
    '$g = [System.Drawing.Graphics]::FromImage($bmp)',
    '$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)',
    `$bmp.Save('${tmpImg.replace(/\\/g, '\\\\')}')`,
    '$g.Dispose(); $bmp.Dispose()',
    // OCR via Windows.Media.Ocr
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
    '$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]',
    '$null = [Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]',
    `$file = [Windows.Storage.StorageFile]::GetFileFromPathAsync('${tmpImg.replace(/\\/g, '\\\\')}').GetAwaiter().GetResult()`,
    '$stream = $file.OpenReadAsync().GetAwaiter().GetResult()',
    '$decoder = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream).GetAwaiter().GetResult()',
    '$bitmap = $decoder.GetSoftwareBitmapAsync().GetAwaiter().GetResult()',
    '$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()',
    'if (-not $engine) { "OCR no disponible en esta versión de Windows"; exit }',
    '$result = $engine.RecognizeAsync($bitmap).GetAwaiter().GetResult()',
    // Cleanup
    `Remove-Item '${tmpImg.replace(/\\/g, '\\\\')}' -Force -ErrorAction SilentlyContinue`,
    // Output
    'if ($result.Text -and $result.Text.Trim()) { $result.Text.Trim() } else { "No encontré texto en la pantalla" }',
  ].join('\n')
}

function winSnap(keys) {
  const allKeys = [...new Set(['0x5B', ...keys])]
  const press = allKeys.map(k => `[WS]::keybd_event(${k}, 0, 0, UIntPtr.Zero)`).join('; ')
  const release = allKeys.map(k => `[WS]::keybd_event(${k}, 0, 2, UIntPtr.Zero)`).join('; ')
  return [
    'Add-Type -ErrorAction SilentlyContinue @\"',
    'using System; using System.Runtime.InteropServices;',
    'public class WS {',
    '  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);',
    '}',
    '\"@',
    press,
    'Start-Sleep -Milliseconds 80',
    release,
  ].join('\n')
}

function ps_diagnostic() {
  return [
    '$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue; if (-not $os) { $os = Get-WmiObject Win32_OperatingSystem }',
    '$cpu = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue; if (-not $cpu) { $cpu = Get-WmiObject Win32_Processor }',
    '$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID=\'C:\'" -ErrorAction SilentlyContinue; if (-not $disk) { $disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID=\'C:\'" }',
    '$ramTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)',
    '$ramFree = [math]::Round($os.FreePhysicalMemory / 1MB, 1)',
    '$up = (Get-Date) - $os.LastBootUpTime',
    '$diskFree = [math]::Round($disk.FreeSpace / 1GB, 1)',
    '$diskTotal = [math]::Round($disk.Size / 1GB, 1)',
    '$batt = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue',
    '$ping = Test-Connection 8.8.8.8 -Count 1 -Quiet -ErrorAction SilentlyContinue',
    '$tempFiles = (Get-ChildItem "$env:TEMP" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count',
    '',
    '"=== DIAGNÓSTICO DEL SISTEMA ==="',
    '"Sistema: $($os.Caption) (build $($os.BuildNumber))"',
    '"Uptime: $($up.Days)d $($up.Hours)h $($up.Minutes)m"',
    '"CPU: $($cpu.Name) @ $($cpu.MaxClockSpeed) MHz"',
    '"RAM: ${ramFree}GB libres de ${ramTotal}GB"',
    '"Disco C: ${diskFree}GB libres de ${diskTotal}GB ($([math]::Round($disk.FreeSpace/$disk.Size*100,1))% libre)"',
    '"Internet: $(if ($ping) {\"Conectado\"} else {\"Sin conexión\"})"',
    '"Archivos temporales: $tempFiles"',
    'if ($batt) { "Batería: $($batt.EstimatedChargeRemaining)%" }',
    '"=== FIN ==="',
  ].join('\n')
}

function ps_systemInfo() {
  return [
    'function gfmi { param($c) $r = Get-CimInstance $c -ErrorAction SilentlyContinue; if (-not $r) { $r = Get-WmiObject $c }; $r }',
    '$os = gfmi Win32_OperatingSystem',
    '$cpu = gfmi Win32_Processor',
    '$ram = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)',
    '$free = [math]::Round($os.FreePhysicalMemory / 1MB, 1)',
    '$disks = gfmi Win32_LogicalDisk -Filter DriveType=3 | % { $_.DeviceID + " " + [math]::Round($_.FreeSpace/1GB,1) + "GB libres de " + [math]::Round($_.Size/1GB,1) + "GB" }',
    '$gpu = (gfmi Win32_VideoController | Select -First 1).Name',
    '$up = (Get-Date) - $os.LastBootUpTime',
    '$so = $os.Caption',
    '"SO: $so | CPU: $($cpu.Name) | RAM: ${free}GB/${ram}GB | " + ($disks -join " | ") + " | GPU: $gpu | Activo: $($up.Days)d $($up.Hours)h $($up.Minutes)m"',
  ].join('\n')
}

function ps_diskSpace(drive) {
  drive = (drive || 'C').toUpperCase()
  return [
    '$d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID=\'' + drive + ':\'"',
    'if ($d) {',
    '  $total = [math]::Round($d.Size / 1GB, 1)',
    '  $free = [math]::Round($d.FreeSpace / 1GB, 1)',
    '  $used = [math]::Round(($d.Size - $d.FreeSpace) / 1GB, 1)',
    '  $pct = [math]::Round($d.FreeSpace / $d.Size * 100, 1)',
    '  "' + drive + ': $total GB total, $used GB usados, $free GB libres ($pct% libre)"',
    '} else {',
    '  "Unidad ' + drive + ' no encontrada"',
    '}',
  ].join('\n')
}

function ps_temperature() {
  return [
    '$t = Get-CimInstance -Namespace root/WMI -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue',
    'if ($t) {',
    '  $t | % { $c = [math]::Round(($_.CurrentTemperature - 2732) / 10, 1); "$($_.InstanceName): ${c}°C" }',
    '} else {',
    '  "No se pudo leer temperatura (sensores no disponibles o permisos de admin requeridos)"',
    '}',
  ].join('\n')
}

function ps_events(filter) {
  const level = filter ? filter.trim().toLowerCase() : ''
  const levelFilter = level.includes('error') ? 'Error' : level.includes('warning') ? 'Warning' : level.includes('crítico') || level.includes('critico') || level.includes('critical') ? 'Critical' : ''
  return [
    '$events = Get-WinEvent -LogName System -MaxEvents 30 -ErrorAction SilentlyContinue',
    levelFilter ? '$events = $events | Where { $_.LevelDisplayName -eq "' + levelFilter + '" }' : '',
    '$events | Select-Object -First 15 TimeCreated, LevelDisplayName, @{N="Msg";E={$_.Message.Substring(0,[Math]::Min(80,$_.Message.Length))}} | Format-Table -Wrap -AutoSize | Out-String -Width 4096',
    'if (-not $events) { "No se encontraron eventos' + (levelFilter ? ' de tipo ' + levelFilter : '') + '" }',
  ].filter(Boolean).join('\n')
}



async function execute(text) {
  const parser = require('./command-parser')
  const segments = parser.splitCommands(text, SEP)
  if (segments.length > 1) {
    const results = []
    for (const seg of segments) {
      try { const r = await matchOne(seg); if (r) results.push(r) } catch (e) { logger.warn('segmento falló:', seg, '-', e.message) }
    }
    if (!results.length) return null
    const messages = results.map(r => r.message).filter(Boolean).join('. ')
    // Fase 3: sin re-ejecutar — matchOne ya corrió cada segmento (evita doble apagado/borrado).
    const result = { success: true, message: messages, speak: true }
    saveHistory(text, result)
    return result
  }
  const result = await matchOne(text)
  saveHistory(text, result)
  return result
}

// Fase 5: ruteo por prioridad, no por orden físico.
// Todos los patrones que matchean compiten; gana `priority` mayor.
// p.priority: 10 = específico (cancela apagado > apaga), 0 = genérico (default).
function route(text) {
  const hits = []
  for (const p of PATTERNS) {
    const m = text.match(p.match)
    if (m) hits.push({ pattern: p, match: m })
  }
  hits.sort((a, b) => (b.pattern.priority || 0) - (a.pattern.priority || 0))
  return hits
}

function labelOf(p) {
  if (p.confirm && typeof p.confirm === 'string') return p.confirm
  if (typeof p.msg === 'string') return p.msg
  return 'esta acción'
}

// hits debe venir ordenado (ver route). Si empatan acciones distintas en la
// cima y hay riesgo (prioridad > 0 o patrón delicado), se pregunta en vez de
// ejecutar a ciegas. Empates genéricos sin riesgo = primero (como antes).
function pickBest(hits) {
  if (!hits.length) return null
  const top = hits[0].pattern.priority || 0
  const tied = hits.filter(h => (h.pattern.priority || 0) === top)
  const labels = [...new Set(tied.map(h => labelOf(h.pattern)))]
  if (labels.length > 1 && (top > 0 || tied.some(h => h.pattern.confirm))) {
    return { ask: labels.slice(0, 3) }
  }
  return { hit: hits[0] }
}

async function matchOne(text) {  // Check custom commands first (user-taught patterns)
  const custom = memory.matchCustom(text)
  if (custom) {
    const msg = `${custom.reply || 'Ejecutando'}: ${custom.action}`
    return { success: true, message: msg, speak: true }
  }

  const hits = route(text)
  if (!hits.length) return null
  const pick = pickBest(hits)
  if (pick.ask) {
    return { success: true, message: `Escuché "${text}". ¿Quisiste decir: ${pick.ask.join(' / ')}? Repite tu comando.`, speak: true }
  }
  const p = pick.hit.pattern
  const m = pick.hit.match
  if (p.confirm) {
    const ok = await _confirm(typeof p.confirm === 'function' ? p.confirm(m) : p.confirm, text)
    if (!ok) return { success: true, message: 'Cancelado. ¿Necesitas algo más?', speak: true }
  }
  // Handler pattern — JS-only, no PS needed
  if (p.handler) {
    try {
      const result = await p.handler(m)
      const isObj = typeof result === 'object' && result !== null
      const msg = isObj ? (result.message || 'Hecho') : (result || 'Hecho')
      const ok = isObj ? (result.success !== false) : true
      return { success: ok, message: msg, speak: ok, ...(isObj ? { _macro: result._macro } : {}), _tts: tts.isAvailable() }
    } catch (e) {
      logger.error('Handler error:', e.message)
      return { success: false, message: 'Error: ' + e.message }
    }
  }

  const psCode = typeof p.run === 'function' ? await p.run(m) : p.run
  if (p.capture) {
    const { stdout: output } = await runPs(psCode)
    return { success: true, message: output || 'Hecho', speak: true, _psCode: psCode, _capture: true, _tts: tts.isAvailable() }
  }
  await runPs(psCode)
  return { success: true, message: typeof p.msg === 'function' ? p.msg(m) : p.msg, speak: true, _psCode: psCode, _tts: tts.isAvailable() }
}

function getHelp() {
  return [
    { group: 'AUTOMATIZACIÓN', items: [
      'a la izquierda / a la derecha',
      'esquina [superior|inferior] [izquierda|derecha]',
      'maximiza/minimiza/restaura ventana',
      'pantalla completa',
      'minimiza todo / muestra escritorio',
      'maximiza / minimiza / restaura [ventana]',
      'trae [ventana] al frente / primer plano',
      'cierra [app] / cierra todo',
      'mouse a [X], [Y]',
      'click izquierdo / click derecho / doble click',
      'copia [texto] / pega / corta',
      'expulsa [USB]',
      'captura pantalla / captura región',
      'graba macro / guarda macro como [nombre]',
      'ejecuta macro [nombre]',
      'dicta [texto] (escribe por ti)',
      'copia [texto] al portapapeles / pega portapapeles',
      '[app] a la izquierda / [app] a la derecha',
      'prepara el PC para [trabajar|programar|estudiar|jugar]',
    ]},
    { group: 'SISTEMA', items: [
      'diagnóstico (salud del sistema)',
      'info sistema (CPU, RAM, discos, GPU, SO, tiempo)',
      'espacio en [C|D|...]',
      'temperatura (CPU/GPU)',
      'eventos sistema [error|warning]',
      'lista procesos (PID, RAM, CPU)',
      'mata [PID] / prioridad [alta|normal|baja] [PID]',
      'lista servicios / inicia / detén / reinicia [servicio]',
      'apaga / reinicia / suspende / hiberna / bloquea',
      'cierra sesión / logoff',
      'cancela apagado / reinicio',
      'vacía papelera',
      'plan de energía [ahorro|balanceado|rendimiento]',
      'bluetooth on/off',
      'conecta/desconecta VPN [nombre]',
      'busca/instala actualizaciones Windows',
      'sfc / dism (repara sistema)',
      'limpia disco / libera espacio',
      'crea punto de restauración',
      'variable de entorno [nombre]',
      'programador de tareas / firewall',
      'apágate en [N] [minutos|horas]',
      'cancela apagado programado',
      'no molestar / quita no molestar',
      'silencia / activa micrófono',
      'salud / estado de la batería',
      'volumen de [app] [sube|baja|mute]',
    ]},
    { group: 'ARCHIVOS', items: [
      'copia [archivo] a [destino]',
      'mueve [archivo] a [destino]',
      'busca archivos que contengan [texto]',
      'abre el excel/word/pdf de [nombre]',
      'crea carpeta [nombre]',
      'borra / renombra [archivo]',
      'borra carpeta [nombre]',
      'comprime [carpeta] / extrae [zip]',
      'lee archivo [ruta]',
      'crea archivo [ruta] con contenido [texto]',
      'añade [texto] al archivo [ruta]',
      'busca archivos llamados [nombre]',
      'lista archivos en [carpeta]',
      'archivos grandes en [carpeta]',
      'archivos duplicados en [carpeta]',
      'compara [archivo1] con [archivo2]',
      'propiedades de archivo [ruta]',
      'atributo [ruta] a solo lectura/oculto',
      'monta/desmonta imagen [iso]',
      'crea acceso directo [nombre] para [ruta]',
      'dónde está [archivo] (busca en carpetas comunes)',
      'convierte [docx|xlsx] a [pdf|txt]',
      'limpia / organiza el escritorio',
    ]},
    { group: 'WEB Y BÚSQUEDAS', items: [
      'busca en google [consulta]',
      'busca en youtube [consulta]',
      'busca en [wikipedia|amazon|mercadolibre] [consulta]',
      'cuánto cuesta [producto] en Amazon',
      'traduce [texto] a [idioma]',
      'descarga [url]',
      '[chrome|firefox|edge] incógnito',
      '[chrome|firefox|edge] nueva pestaña [url]',
      'lista pestañas Chrome',
      'cierra pestaña [N] / nueva pestaña [url]',
      'abre [reddit|twitter|facebook|instagram|linkedin|...]',
      'abre [mercadolibre|ebay|aliexpress|walmart|...]',
      'noticias / qué pasa en el mundo',
      'va a llover? / pronóstico del clima',
      'qué temperatura hará [mañana|en [ciudad]]',
      'speedtest / velocidad de internet',
    ]},
    { group: 'EMAIL / MENSAJES', items: [
      'envía email a [contacto] asunto [x] diciendo [y]',
      'redacta/crea/nuevo correo [con asunto X] [diciendo Y]',
      'envía whatsapp a [contacto] diciendo [texto]',
    ]},
    { group: 'CONFIGURACIÓN', items: [
      'abre configuración [de red|wifi|sonido|pantalla|...]',
      'abre panel de control / administrador de tareas',
      'abre explorador / descargas / documentos / imágenes',
      'volumen [sube|baja|50|silencio]',
      'brillo [sube|baja|50]',
      'tema oscuro / tema claro',
      'luz nocturna / modo noche',
      'wifi on/off',
    ]},
    { group: 'HERRAMIENTAS', items: [
      'calcula / cuánto es [expresión]',
      'temporizador / cronómetro [N] [minutos|segundos]',
      'recuérdame [texto] en [N] [minutos]',
      'qué eventos/recordatorios tengo',
      'genera código QR [texto]',
      'dónde estoy / mi ubicación / geo ip',
      'saca/toma foto / selfie',
      'imprime [archivo]',
      'qué día es hoy / qué hora es',
      'abre [app] (Slack, Zoom, Teams, Photoshop, VLC...)',
      'abre proyecto [nombre] en VS Code',
      'corre [npm install|npm run build|python script.py|...]',
      'ejecuta comando [cmd o powershell]',
      'batería / salud de batería / reporte',
      'dictado continuo / activa dictado',
      'buenos días / buenas tardes (saludo personalizado)',
      'qué le pedí ayer? / historial de comandos',
    ]},
    { group: 'INTELIGENCIA', items: [
      'lee la pantalla / lee esto (OCR nativo)',
      'recuerda que [clave] es [valor]',
      'qué recuerdas / olvida [clave]',
      'aprende [frase] para [acción]',
      'olvida comando [frase] / lista comandos aprendidos',
      'Pregunta lo que sea con "gemini"/"chapi"/"ia" al inicio',
    ]},
  ]
}

function saveHistory(query, result) {
  try {
    const fs = require('fs')
    const path = require('path')
    const histPath = path.join(require('os').tmpdir(), '_ai_history.json')
    let hist = []
    try { hist = JSON.parse(fs.readFileSync(histPath, 'utf8')) } catch {}
    hist.push({ q: query, a: typeof result === 'string' ? result : result?.message || '', t: Date.now() })
    if (hist.length > 100) hist = hist.slice(-100)
    fs.writeFileSync(histPath, JSON.stringify(hist))
  } catch {}
}

module.exports = { execute, getHelp, setConfirm, route, pickBest }
