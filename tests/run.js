// Corre todas las suites y junta el resultado (una sola salida para CI).
// Watchdog 10 min por archivo: un colgado falla en vez de congelar la CI.
const { execFileSync } = require('child_process')
const files = ['tests/basic.test.js', 'tests/renderer.test.js', 'tests/model-download.test.js', 'tests/semroute.test.js', 'tests/fetch-file.test.js', 'tests/semantic-bank.test.js']
let failed = 0
for (const f of files) {
  try {
    execFileSync(process.execPath, [f], { stdio: 'inherit', timeout: 600000 })
  } catch (e) {
    failed = 1
    console.log(`SUITE FALLIDA/COLGADA: ${f} (${e.code || e.message})`)
  }
}
process.exit(failed)
