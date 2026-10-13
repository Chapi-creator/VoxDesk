// Cliente remoto puro: token del hash, llamadas con Bearer. Testeable (fetch inyectado).
function parseToken(url) {
  const h = String(url || '').split('#')[1] || ''
  const m = /^[0-9a-f]{4,128}$/i.exec(h.trim())
  return m ? m[0] : ''
}

function authHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
}

async function apiCall(fetchImpl, base, token, path, opts = {}) {
  const res = await fetchImpl(base.replace(/\/$/, '') + path, {
    method: opts.method || 'GET',
    headers: authHeaders(token),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  let data = null
  try { data = await res.json() } catch {}
  if (res.status === 401) throw new Error('sin acceso (revocado?)')
  if (!res.ok) throw new Error('error ' + res.status)
  return data
}

if (typeof module !== 'undefined') module.exports = { parseToken, authHeaders, apiCall }
