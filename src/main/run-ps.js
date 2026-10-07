// Unico corredor de PowerShell: escribe .ps1 temporal, ejecuta, limpia.
// Reemplaza los 4 inventos previos (system.js x2, smart-exec x2).
// Devuelve siempre { err, stdout, stderr }.
const { exec } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

let _n = 0

function runPs(psCode, { timeout = 30000 } = {}) {
  const f = path.join(os.tmpdir(), `_ai_ps_${process.pid}_${++_n}.ps1`)
  fs.writeFileSync(f, '﻿' + psCode, 'utf8')
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${f}"`, { timeout }, (err, stdout, stderr) => {
      try { fs.unlinkSync(f) } catch {}
      resolve({ err, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() })
    })
  })
}

module.exports = { runPs }
