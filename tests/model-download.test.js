// Integración real del pipeline: servidor HTTP local + descarga→EOCD→extrae→verifica→swap.
// Lento (~minutos por Expand-Archive de 370MB) pero es la prueba que importa.
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const http = require('http')
const os = require('os')
const { execFileSync } = require('child_process')

process.chdir(path.join(__dirname, '..'))
const { downloadLarge } = require('../src/main/model-download')

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  V ${name}`) }
  catch (e) { failed++; console.log(`  ? ${name}: ${(e && e.stack) || e}`) }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vox-mdl-int-'))
const SERVE_ZIP = path.join(ROOT, 'serve.zip')
const MINZIP = 1000 // piso de prueba (prod usa 1GB)

function sparse(p, mb) { const fd = fs.openSync(p, 'w'); fs.ftruncateSync(fd, mb * 1024 * 1024); fs.closeSync(fd) }

function buildFixture() {
  const fake = path.join(ROOT, 'fake', 'vosk-model-es-0.42')
  fs.mkdirSync(path.join(fake, 'am'), { recursive: true })
  fs.mkdirSync(path.join(fake, 'graph'), { recursive: true })
  fs.mkdirSync(path.join(fake, 'conf'), { recursive: true })
  sparse(path.join(fake, 'am', 'final.mdl'), 60)
  sparse(path.join(fake, 'graph', 'HCLG.fst'), 310)
  fs.writeFileSync(path.join(fake, 'conf', 'model.conf'), 'x'.repeat(200))
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -LiteralPath '${fake}' -DestinationPath '${SERVE_ZIP}' -Force`], { timeout: 300000 })
}

// mode: {range:bool, flaky:bool, data?:Buffer}
function serve(mode) {
  const state = { hits: 0, sawRange: false }
  const data = mode.data || fs.readFileSync(SERVE_ZIP)
  const srv = http.createServer((req, res) => {
    state.hits++
    if (mode.flaky && state.hits === 1) { req.socket.destroy(); return }
    const m = /^bytes=(\d+)-$/.exec(req.headers.range || '')
    if (mode.range && m) {
      const start = Math.min(parseInt(m[1], 10), data.length)
      state.sawRange = true
      res.writeHead(206, {
        'Content-Length': data.length - start,
        'Content-Range': `bytes ${start}-${data.length - 1}/${data.length}`,
        'Accept-Ranges': 'bytes',
      })
      res.end(data.subarray(start))
      return
    }
    res.writeHead(200, { 'Content-Length': data.length, 'Accept-Ranges': 'bytes' })
    res.end(data)
  })
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => resolve({ srv, state, url: `http://127.0.0.1:${srv.address().port}/m.zip` }))
  })
}

function freshDirs() {
  const d = fs.mkdtempSync(path.join(ROOT, 'case-'))
  const modelsDir = path.join(d, 'models')
  const tmpDir = path.join(d, 'tmp')
  fs.mkdirSync(modelsDir, { recursive: true })
  fs.mkdirSync(tmpDir, { recursive: true })
  return { modelsDir, tmpDir }
}

function collect() {
  const phases = []
  return { phases, send: (e) => phases.push(e.phase || (e.done ? (e.ok ? 'done-ok' : 'done-fail') : '?')) }
}

async function run() {
  console.log('\nmodel-download (integración)')
  console.log('  armando fixture 370MB sparse + zip…')
  buildFixture()
  const fullSize = fs.statSync(SERVE_ZIP).size
  assert.ok(fullSize > MINZIP, 'fixture zip válido, bytes=' + fullSize)

  await test('descarga completa de punta a punta', async () => {
    const { srv, url } = await serve({ range: true })
    try {
      const { modelsDir, tmpDir } = freshDirs()
      const { phases, send } = collect()
      const ok = await downloadLarge({ modelsDir, tmpDir, url, send, minZipBytes: MINZIP })
      assert.equal(ok, true)
      for (const p of ['download', 'extract', 'verify']) assert.ok(phases.includes(p), 'fase ' + p)
      const base = path.join(modelsDir, 'vosk-model-es-0.42')
      assert.ok(fs.statSync(path.join(base, 'am', 'final.mdl')).size > 50 * 1024 * 1024)
      assert.ok(fs.statSync(path.join(base, 'graph', 'HCLG.fst')).size > 300 * 1024 * 1024)
      assert.equal(fs.existsSync(path.join(modelsDir, '.stage-large')), false)
      assert.equal(fs.existsSync(path.join(tmpDir, 'vosk-model-es-0.42.zip')), false)
    } finally { srv.close() }
  })

  await test('reanuda desde parcial con Range', async () => {
    const { srv, state, url } = await serve({ range: true })
    try {
      const { modelsDir, tmpDir } = freshDirs()
      const zip = path.join(tmpDir, 'vosk-model-es-0.42.zip')
      const full = fs.readFileSync(SERVE_ZIP)
      fs.writeFileSync(zip, full.subarray(0, Math.floor(full.length / 3)))
      const { phases, send } = collect()
      const ok = await downloadLarge({ modelsDir, tmpDir, url, send, minZipBytes: MINZIP })
      assert.equal(ok, true)
      assert.equal(state.sawRange, true)
      assert.ok(phases.includes('resume'), 'fase resume visible')
      assert.ok(fs.existsSync(path.join(modelsDir, 'vosk-model-es-0.42', 'graph', 'HCLG.fst')))
    } finally { srv.close() }
  })

  await test('reintenta tras corte y termina', async () => {
    const { srv, state, url } = await serve({ range: true, flaky: true })
    try {
      const { modelsDir, tmpDir } = freshDirs()
      const { phases, send } = collect()
      const ok = await downloadLarge({ modelsDir, tmpDir, url, send, minZipBytes: MINZIP })
      assert.equal(ok, true)
      assert.ok(state.hits >= 2, 'hits=' + state.hits)
      assert.ok(phases.includes('retry'), 'fase retry visible')
    } finally { srv.close() }
  })

  await test('servidor sin Range reinicia de cero', async () => {
    const { srv, url } = await serve({ range: false })
    try {
      const { modelsDir, tmpDir } = freshDirs()
      const full = fs.readFileSync(SERVE_ZIP)
      fs.writeFileSync(path.join(tmpDir, 'vosk-model-es-0.42.zip'), full.subarray(0, Math.floor(full.length / 2)))
      const { send } = collect()
      const ok = await downloadLarge({ modelsDir, tmpDir, url, send, minZipBytes: MINZIP })
      assert.equal(ok, true)
      assert.ok(fs.existsSync(path.join(modelsDir, 'vosk-model-es-0.42', 'graph', 'HCLG.fst')))
    } finally { srv.close() }
  })

  await test('basura no toca el modelo instalado', async () => {
    const { srv, url } = await serve({ range: true, data: Buffer.alloc(2048, 7) })
    try {
      const { modelsDir, tmpDir } = freshDirs()
      const keepDir = path.join(modelsDir, 'vosk-model-es-0.42')
      fs.mkdirSync(keepDir, { recursive: true })
      fs.writeFileSync(path.join(keepDir, 'KEEP.txt'), 'modelo bueno')
      const got = { err: '' }
      const ok = await downloadLarge({ modelsDir, tmpDir, url, minZipBytes: MINZIP, send: (e) => { if (e.error) got.err = e.error } })
      assert.equal(ok, false)
      assert.ok(/zip/i.test(got.err), 'motivo: ' + got.err)
      assert.equal(fs.readFileSync(path.join(keepDir, 'KEEP.txt'), 'utf8'), 'modelo bueno')
      assert.equal(fs.existsSync(path.join(modelsDir, '.stage-large')), false)
    } finally { srv.close() }
  })

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`)
  try { fs.rmSync(ROOT, { recursive: true, force: true }) } catch {} // no dejar 2GB en TEMP
  process.exit(failed ? 1 : 0)
}

run().catch((e) => { console.error(e); process.exit(1) })
