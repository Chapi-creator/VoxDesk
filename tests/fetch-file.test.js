// fetch-file + semantic-download contra servidor HTTP local.
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const http = require('http')
const os = require('os')

process.chdir(path.join(__dirname, '..'))
const { fetchFile } = require('../src/main/fetch-file')
const { downloadSemantic } = require('../src/main/semantic-download')

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  V ${name}`) }
  catch (e) { failed++; console.log(`  ? ${name}: ${(e && e.stack) || e}`) }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vox-ff-'))
const DATA = Buffer.alloc(200000, 7)

// mode: range | flaky | norange | short (miente tamaño)
function serve(mode) {
  const state = { hits: 0, sawRange: false }
  const srv = http.createServer((req, res) => {
    state.hits++
    if (mode === 'flaky' && state.hits === 1) { req.socket.destroy(); return }
    const m = /^bytes=(\d+)-$/.exec(req.headers.range || '')
    if (mode === 'short') {
      res.writeHead(200, { 'Content-Length': DATA.length + 50000 })
      res.end(DATA.subarray(0, 100000))
      return
    }
    if (mode !== 'norange' && m) {
      const start = parseInt(m[1], 10)
      if (start >= DATA.length) {
        res.writeHead(416, { 'Content-Range': `bytes */${DATA.length}` })
        res.end()
        return
      }
      state.sawRange = true
      res.writeHead(206, { 'Content-Length': DATA.length - start, 'Content-Range': `bytes ${start}-${DATA.length - 1}/${DATA.length}` })
      res.end(DATA.subarray(start))
      return
    }
    res.writeHead(200, { 'Content-Length': DATA.length })
    res.end(DATA)
  })
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => resolve({ srv, state, url: `http://127.0.0.1:${srv.address().port}/f.bin` }))
  })
}

async function run() {
  console.log('\nfetch-file + semantic-download')

  await test('descarga completa con progreso', async () => {
    const { srv, url } = await serve('range')
    try {
      const dest = path.join(ROOT, 'a.bin')
      const phases = []
      const r = await fetchFile(url, dest, { expectedBytes: DATA.length, send: (e) => phases.push(e.phase) })
      assert.equal(r.bytes, DATA.length)
      assert.ok(phases.includes('download'))
      assert.ok(fs.readFileSync(dest).equals(DATA))
    } finally { srv.close() }
  })

  await test('reanuda parcial', async () => {
    const { srv, state, url } = await serve('range')
    try {
      const dest = path.join(ROOT, 'b.bin')
      fs.writeFileSync(dest, DATA.subarray(0, 50000))
      const r = await fetchFile(url, dest, { expectedBytes: DATA.length })
      assert.equal(r.bytes, DATA.length)
      assert.equal(state.sawRange, true)
      assert.ok(fs.readFileSync(dest).equals(DATA))
    } finally { srv.close() }
  })

  await test('reintenta tras corte', async () => {
    const { srv, state, url } = await serve('flaky')
    try {
      const dest = path.join(ROOT, 'c.bin')
      let retries = 0
      const r = await fetchFile(url, dest, { expectedBytes: DATA.length, onRetry: () => retries++ })
      assert.equal(r.bytes, DATA.length)
      assert.ok(state.hits >= 2 && retries >= 1)
    } finally { srv.close() }
  })

  await test('servidor sin Range reinicia', async () => {
    const { srv, url } = await serve('norange')
    try {
      const dest = path.join(ROOT, 'd.bin')
      fs.writeFileSync(dest, DATA.subarray(0, 50000))
      const r = await fetchFile(url, dest, { expectedBytes: DATA.length })
      assert.equal(r.bytes, DATA.length)
      assert.ok(fs.readFileSync(dest).equals(DATA))
    } finally { srv.close() }
  })

  await test('parcial más grande (416) reinicia de cero', async () => {
    const { srv, url } = await serve('range')
    try {
      const dest = path.join(ROOT, 'e.bin')
      fs.writeFileSync(dest, Buffer.alloc(DATA.length + 1000, 9))
      const r = await fetchFile(url, dest, { expectedBytes: DATA.length })
      assert.equal(r.bytes, DATA.length)
      assert.ok(fs.readFileSync(dest).equals(DATA))
    } finally { srv.close() }
  })

  await test('tamaño mentiroso se rechaza', async () => {
    const { srv, url } = await serve('short')
    try {
      let err = ''
      try { await fetchFile(url, path.join(ROOT, 'f.bin'), { expectedBytes: DATA.length }) } catch (e) { err = e.message }
      assert.ok(/inesperado|incompleto|falló/.test(err), err)
    } finally { srv.close() }
  })

  await test('semantic-download: baja 2 archivos y escribe meta', async () => {
    const { srv, url } = await serve('range')
    try {
      const modelsDir = fs.mkdtempSync(path.join(ROOT, 'sem-'))
      const events = []
      const ok = await downloadSemantic({
        modelsDir, exact: false,
        urls: { onnx: url, tok: url },
        send: (e) => events.push(e),
      })
      assert.equal(ok, true)
      const sem = require('../src/main/semroute')
      const meta = JSON.parse(fs.readFileSync(sem.modelFiles(modelsDir).meta, 'utf8'))
      assert.equal(meta.id, sem.MODEL_ID)
      assert.ok(events.some(e => e.done && e.ok))
    } finally { srv.close() }
  })

  await test('semantic-download: salta lo ya completo sin red', async () => {
    const { srv, state, url } = await serve('range')
    try {
      const sem = require('../src/main/semroute')
      const modelsDir = fs.mkdtempSync(path.join(ROOT, 'sem2-'))
      const f = sem.modelFiles(modelsDir)
      fs.mkdirSync(f.dir, { recursive: true })
      // Archivos sparse del tamaño exacto esperado → skip sin tocar red.
      for (const [p, sz] of [[f.onnx, 118308126], [f.tok, 17082913]]) {
        const fd = fs.openSync(p, 'w')
        fs.ftruncateSync(fd, sz)
        fs.closeSync(fd)
      }
      const ok = await downloadSemantic({ modelsDir, urls: { onnx: url, tok: url }, send: () => {} })
      assert.equal(ok, true)
      assert.equal(state.hits, 0)
    } finally { srv.close() }
  })

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

run().catch((e) => { console.error(e); process.exit(1) })
