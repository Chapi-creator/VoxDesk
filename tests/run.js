// Corre todas las suites y junta el resultado (una sola salida para CI).
const { execFileSync } = require('child_process')
const files = ['tests/basic.test.js', 'tests/renderer.test.js']
let failed = 0
for (const f of files) {
  try {
    execFileSync(process.execPath, [f], { stdio: 'inherit' })
  } catch {
    failed = 1
  }
}
process.exit(failed)
