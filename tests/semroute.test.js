// C1: cliente semántico — puras (coseno, estado) + protocolo real contra stub python.
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')

process.chdir(path.join(__dirname, '..'))
const sem = require('../src/main/semroute')

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  V ${name}`) }
  catch (e) { failed++; console.log(`  ? ${name}: ${(e && e.stack) || e}`) }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vox-sem-'))
const STUB = path.join(ROOT, 'stub_sem.py')
fs.writeFileSync(STUB, `
import sys, json, math
def vec(text):
    h = abs(hash(text)) % (2**32)
    return [round(math.sin(h * 0.001 + i * 0.13), 5) for i in range(384)]
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
    except Exception:
        print(json.dumps({'id': None, 'ok': False, 'error': 'json'}), flush=True)
        continue
    rid = req.get('id')
    op = req.get('op')
    if op == 'ping':
        print(json.dumps({'id': rid, 'ok': True, 'ready': True, 'dim': 384}), flush=True)
    elif op == 'embed':
        texts = req.get('texts') or []
        if any(t == '__hang__' for t in texts):
            continue
        if any(t == '__die__' for t in texts):
            sys.exit(1)
        print(json.dumps({'id': rid, 'ok': True, 'dim': 384, 'vecs': [vec(t) for t in texts]}), flush=True)
    else:
        print(json.dumps({'id': rid, 'ok': False, 'error': 'op?'}), flush=True)
`)

function stubOver(modelsDir) {
  return { bin: 'python', args: [STUB] }
}

async function run() {
  console.log('\nsemroute (cliente semántico)')

  await test('coseno: idéntico 1, ortogonal 0, cero 0', async () => {
    const near = (x, v) => Math.abs(x - v) < 1e-9
    assert.ok(near(sem.cosine([1, 0], [1, 0]), 1))
    assert.ok(near(sem.cosine([1, 0], [0, 1]), 0))
    assert.ok(near(sem.cosine([1, 1], [1, 1]), 1))
    assert.equal(sem.cosine([0, 0], [1, 2]), 0)
  })

  await test('routeSemantic elige el máximo', async () => {
    const r = sem.routeSemantic([1, 0], [[0, 1], [1, 0], [0.5, 0.5]])
    assert.equal(r.idx, 1)
    assert.ok(r.sim > 0.99)
  })

  await test('status sin modelo: no disponible + faltantes', async () => {
    const d = fs.mkdtempSync(path.join(ROOT, 'm-'))
    const st = sem.status(d)
    assert.equal(st.available, false)
    assert.ok(st.missing.includes('onnx'))
  })

  await test('status con archivos: disponible', async () => {
    const d = fs.mkdtempSync(path.join(ROOT, 'm-'))
    const f = sem.modelFiles(d)
    fs.mkdirSync(f.dir, { recursive: true })
    for (const p of [f.onnx, f.tok]) {
      const fd = fs.openSync(p, 'w')
      fs.ftruncateSync(fd, 2 * 1024 * 1024)
      fs.closeSync(fd)
    }
    fs.writeFileSync(f.meta, JSON.stringify({ id: sem.MODEL_ID }))
    assert.equal(sem.status(d).available, true)
  })

  await test('bestGroup elige patrón por máximo', async () => {
    const vecs = [[1, 0], [0, 1], [0.7, 0.7]]
    const groups = [{ canon: 'A', vecIdx: [0] }, { canon: 'B', vecIdx: [1, 2] }]
    const r = sem.bestGroup([0.9, 0.1], vecs, groups)
    assert.equal(r.canon, 'A')
    assert.ok(r.sim > 0.99)
    const r2 = sem.bestGroup([0, 1], vecs, groups)
    assert.equal(r2.canon, 'B')
  })

  await test('protocolo: ping + embed reales contra stub', async () => {
    const d = fs.mkdtempSync(path.join(ROOT, 'm-'))
    const p = await sem.ping(d, stubOver(d))
    assert.equal(p.ready, true)
    assert.equal(p.dim, 384)
    const v = await sem.embed(d, ['apaga el equipo', 'pon música'], stubOver(d))
    assert.equal(v.length, 2)
    assert.equal(v[0].length, 384)
    const v2 = await sem.embed(d, ['apaga el equipo'], stubOver(d))
    assert.ok(sem.cosine(v[0], v2[0]) > 0.999)
    sem.stop()
  })

  await test('timeout cuando el sidecar se cuelga', async () => {
    const d = fs.mkdtempSync(path.join(ROOT, 'm-'))
    let err = ''
    try { await sem.embed(d, ['__hang__'], { ...stubOver(d), timeoutMs: 1500 }) } catch (e) { err = e.message }
    assert.ok(/timeout/.test(err), err)
    sem.stop()
  })

  await test('binario malo rechaza sin colgar', async () => {
    const d = fs.mkdtempSync(path.join(ROOT, 'm-'))
    let err = ''
    try { await sem.ping(d, { bin: 'C:\\no-existe\\vox-stub.exe', args: [] }) } catch (e) { err = e.message }
    assert.ok(err.length > 0, 'rechaza')
    sem.stop()
  })

  await test('candidateVecs cachea en disco', async () => {
    const d = fs.mkdtempSync(path.join(ROOT, 'm-'))
    fs.mkdirSync(sem.modelFiles(d).dir, { recursive: true })
    const texts = ['apaga el equipo', 'sube el volumen']
    const v1 = await sem.candidateVecs(d, texts, stubOver(d))
    const files = fs.readdirSync(sem.modelFiles(d).dir).filter(f => f.startsWith('vecs-'))
    assert.equal(files.length, 1)
    sem.stop() // sidecar muerto: la 2da sale de disco
    const v2 = await sem.candidateVecs(d, texts, { bin: 'C:\\no-existe\\x.exe', args: [] })
    assert.deepEqual(v2, v1)
    sem.stop()
  })

  await test('sharedFlight: comparte, topa y reintenta', async () => {
    let n = 0
    const build = async () => { n++; await new Promise(r => setTimeout(r, 30)); return 'v' }
    const fl = sem.sharedFlight()
    const [a, b] = await Promise.all([fl(build, 1000), fl(build, 1000)])
    assert.equal(a, 'v')
    assert.equal(b, 'v')
    assert.equal(n, 1)
    const slow = async () => { await new Promise(r => setTimeout(r, 200)); return 's' }
    const fl2 = sem.sharedFlight()
    let err = ''
    try { await fl2(slow, 50) } catch (e) { err = e.message }
    assert.ok(/tope/.test(err), err)
    assert.equal(await fl2(slow, 1000), 's')
    let failN = 0
    const bad = async () => { failN++; throw new Error('pum') }
    const fl3 = sem.sharedFlight()
    try { await fl3(bad, 500) } catch {}
    try { await fl3(bad, 500) } catch {}
    assert.equal(failN, 2)
  })

  sem.stop()
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`)
  try { fs.rmSync(ROOT, { recursive: true, force: true }) } catch {}
  process.exit(failed ? 1 : 0)
}

run().catch((e) => { console.error(e); process.exit(1) })
