// Fase 14b: foto rápida del sistema en un solo PowerShell.
// snapshot() ejecuta; parseSnapshot()/score() son puros → testeables.
const { runPs } = require('./run-ps')

function parseSnapshot(text) {
  const out = { ramFree: -1, diskFree: -1, diskFreeGB: -1, batt: -1, upDays: -1, cpu: -1 }
  const m = /RAM:([-\d.]+)\|DISCO:([-\d.]+)\|DISCOGB:([-\d.]+)\|BAT:([-\d.]+)\|UP:([-\d.]+)\|CPU:([-\d.]+)/.exec(text || '')
  if (!m) return out
  out.ramFree = parseFloat(m[1])
  out.diskFree = parseFloat(m[2])
  out.diskFreeGB = parseFloat(m[3])
  out.batt = parseInt(m[4], 10)
  out.upDays = parseFloat(m[5])
  out.cpu = parseFloat(m[6])
  return out
}

function score(s) {
  let n = 100
  if (s.diskFree >= 0 && s.diskFree < 10) n -= 30
  else if (s.diskFree >= 0 && s.diskFree < 20) n -= 15
  if (s.ramFree >= 0 && s.ramFree < 15) n -= 25
  else if (s.ramFree >= 0 && s.ramFree < 25) n -= 10
  if (s.batt >= 0 && s.batt < 20) n -= 15
  if (s.upDays > 7) n -= 5
  return Math.min(100, Math.max(0, n))
}

function reportText(s) {
  const sc = score(s)
  const parts = [`Sistemas al ${sc}%`]
  if (s.ramFree >= 0) parts.push(`RAM libre ${Math.round(s.ramFree)}%`)
  if (s.diskFree >= 0) parts.push(`disco C ${Math.round(s.diskFree)}% libre (${s.diskFreeGB} GB)`)
  if (s.batt >= 0) parts.push(`batería ${s.batt}%`)
  if (s.upDays >= 0) parts.push(`encendido hace ${s.upDays < 1 ? 'menos de un día' : Math.floor(s.upDays) + ' días'}`)
  return parts.join(' · ') + '.'
}

async function snapshot() {
  const ps = [
    '$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue',
    '$ramFree = if ($os) { $os.FreePhysicalMemory / $os.TotalVisibleMemorySize * 100 } else { -1 }',
    '$d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID=\'C:\'" -ErrorAction SilentlyContinue',
    '$diskFree = if ($d -and $d.Size) { $d.FreeSpace / $d.Size * 100 } else { -1 }',
    '$diskFreeGB = if ($d) { [math]::Round($d.FreeSpace / 1GB, 1) } else { -1 }',
    '$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1',
    '$batt = if ($b) { $b.EstimatedChargeRemaining } else { -1 }',
    '$up = if ($os) { ((Get-Date) - $os.LastBootUpTime).TotalDays } else { -1 }',
    '$cpu = -1',
    'try { $c = Get-Counter "\\Processor(_Total)\\% Processor Time" -MaxSamples 1 -ErrorAction Stop | Select-Object -ExpandProperty CounterSamples | Select-Object -First 1; $cpu = $c.CookedValue } catch {}',
    '"RAM:{0:0}|DISCO:{1:0}|DISCOGB:{2}|BAT:{3}|UP:{4:0.0}|CPU:{5:0}" -f $ramFree, $diskFree, $diskFreeGB, $batt, $up, $cpu',
  ].join('\n')
  const { stdout } = await runPs(ps, { timeout: 20000 })
  return parseSnapshot(stdout)
}

module.exports = { snapshot, parseSnapshot, score, reportText }
