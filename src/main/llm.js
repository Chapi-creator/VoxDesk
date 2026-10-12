const config = require('./config')

const MAX_HISTORY = 25
const conversationHistory = []

const SYSTEM_PROMPT = 'Eres Vox, el sistema de esta PC con Windows: preciso, sobrio y servicial, con un punto de humor seco. Hablas español claro y conciso, con respuestas cortas (te van a leer en voz alta). No tienes cuerpo ni avatar: eres presencia por voz y texto.\n\nPuedes controlar este PC: abrir programas, manejar archivos, controlar mouse/teclado/ventanas, ajustar el sistema y usar la red. Cuando te pidan HACER algo en el PC, genera el código PowerShell dentro de bloques ```powershell ... ``` (tienes .NET, COM, WMI/CIM y Win32 vía P/Invoke). Para conversar, responder dudas o explicar, responde solo texto, sin código.\n\nEvita lo destructivo (borrados masivos, formato, desactivar protecciones): si te lo piden, avisa del riesgo en tu respuesta.\n\nAl escribir archivos con caracteres especiales usa `Out-File -Encoding UTF8`.'

function getCfg() {
  const cfg = config.load()
  return {
    maxTokens: cfg.maxTokens || 4096,
    temperature: cfg.temperature ?? 0.7,
    systemPrompt: cfg.systemPrompt || SYSTEM_PROMPT,
    apiUrl: cfg.apiUrl || '',
    raw: cfg
  }
}

function buildSystemMessages(sp) {
  return [{ role: 'system', content: sp }]
}

// Generic OpenAI-compatible provider factory (one shared implementation)
// extraBody se mezcla al JSON (p.ej. DeepSeek thinking off).
function mkOpenAI(name, baseUrl, defaultModel, extraBody) {
  return {
    name, baseUrl, defaultModel,
    buildRequest(apiKey, model, userMessage, history) {
      const { maxTokens, temperature, systemPrompt, apiUrl } = getCfg()
      const finalBase = apiUrl || baseUrl
      const messages = [
        ...buildSystemMessages(systemPrompt),
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ]
      return {
        url: `${finalBase}/chat/completions`,
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, ...(extraBody || {}) })
        }
      }
    },
    parseResponse(data) { return data.choices?.[0]?.message?.content || null },
    extractError(data) { return data.error?.message || null }
  }
}

const _openaiParse = (data) => data.choices?.[0]?.message?.content || null
const _openaiError = (data) => data.error?.message || null

const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-flash-latest',
    buildRequest(apiKey, model, userMessage, history) {
      const { maxTokens, temperature, systemPrompt } = getCfg()
      const contents = [
        ...history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        { role: 'user', parts: [{ text: userMessage }] }
      ]
      return {
        url: `${this.baseUrl}/models/${model}:generateContent?key=${apiKey}`,
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { maxOutputTokens: maxTokens, temperature }
          })
        }
      }
    },
    parseResponse(data) { return data.candidates?.[0]?.content?.parts?.[0]?.text || null },
    extractError(data) { return data.error?.message || null }
  },
  claude: {
    name: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-5',
    buildRequest(apiKey, model, userMessage, history) {
      const { maxTokens, temperature, systemPrompt } = getCfg()
      const messages = [
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ]
      return {
        url: `${this.baseUrl}/messages`,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt, messages, temperature })
        }
      }
    },
    parseResponse(data) { return data.content?.[0]?.text || null },
    extractError(data) { return data.error?.message || data.error?.type || null }
  },
  // All OpenAI-compatible providers share the same implementation via mkOpenAI
  openai: mkOpenAI('OpenAI', 'https://api.openai.com/v1', 'gpt-4o-mini'),
  groq: mkOpenAI('Groq', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'),
  deepseek: mkOpenAI('DeepSeek', 'https://api.deepseek.com/v1', 'deepseek-v4-flash', { thinking: { type: 'disabled' } }),
  together: mkOpenAI('Together AI', 'https://api.together.xyz/v1', 'mistralai/Mixtral-8x7B-Instruct-v0.1'),
  openrouter: mkOpenAI('OpenRouter', 'https://openrouter.ai/api/v1', 'openai/gpt-4o-mini'),
  mistral: mkOpenAI('Mistral AI', 'https://api.mistral.ai/v1', 'mistral-large-latest'),
  perplexity: mkOpenAI('Perplexity', 'https://api.perplexity.ai', 'sonar-pro'),
  xai: mkOpenAI('xAI (Grok)', 'https://api.x.ai/v1', 'grok-4.5'),
  cohere: mkOpenAI('Cohere', 'https://api.cohere.com/v1', 'command-r-plus'),
  kimi: mkOpenAI('Kimi (Moonshot)', 'https://api.moonshot.cn/v1', 'kimi-k2.5'),
  glm: mkOpenAI('GLM (Zhipu)', 'https://open.bigmodel.cn/api/paas/v4', 'glm-4.6'),
  // Generic custom URL — user sets apiUrl + model manually
  'openai-custom': mkOpenAI('OpenAI Compatible (Custom URL)', '', ''),
  lmstudio: mkOpenAI('LM Studio (local)', 'http://127.0.0.1:1234/v1', 'local-model'),
  local: {
    name: 'Local (Ollama)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'llama3.2',
    buildRequest(apiKey, model, userMessage, history) {
      const { maxTokens, temperature, systemPrompt } = getCfg()
      const messages = [
        ...buildSystemMessages(systemPrompt),
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ]
      return {
        url: `${this.baseUrl}/chat/completions`,
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature })
        }
      }
    },
    parseResponse: _openaiParse,
    extractError: _openaiError
  }
}

function isPrivateUrl(url) {
  return /^(https?:\/\/)?(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url || '')
}

function validateKey(provider, key, apiUrl) {
  if (provider === 'local') return null
  const base = apiUrl || (PROVIDERS[provider] && PROVIDERS[provider].baseUrl) || ''
  // Fase 13: servidores caseros (Ollama, LM Studio, llama.cpp) no piden key.
  if ((!key || key.length < 8) && isPrivateUrl(base)) return null
  if (!key || typeof key !== 'string') return 'API key requerida'
  if (provider === 'gemini' && !key.startsWith('AIza')) return 'Gemini key debe empezar con "AIza"'
  if (provider === 'claude' && !key.startsWith('sk-ant-')) return 'Claude key debe empezar con "sk-ant-"'
  if (provider === 'xai' && !key.startsWith('xai-')) return 'xAI key debe empezar con "xai-"'
  if (key.length < 8) return 'Key debe tener al menos 8 caracteres'
  return null
}

function addToHistory(role, content) {
  conversationHistory.push({ role, content })
  while (conversationHistory.length > MAX_HISTORY) conversationHistory.shift()
  // Fase 13: el historial sobrevive reinicios.
  try { require('./memory').set('vox_hist', conversationHistory.slice(-MAX_HISTORY)) } catch {}
}

function clearHistory() {
  conversationHistory.length = 0
  try { require('./memory').set('vox_hist', []) } catch {}
}

let _histLoaded = false
function ensureHistory() {
  if (_histLoaded) return
  _histLoaded = true
  try {
    const saved = require('./memory').get('vox_hist')
    if (Array.isArray(saved) && saved.length) {
      conversationHistory.push(...saved.slice(-MAX_HISTORY))
    }
  } catch {}
}

const KNOWN_MODELS = {
  gemini: [
    { name: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' },
    { name: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash' },
    { name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash-Lite' },
    { name: 'gemini-flash-latest', displayName: 'Gemini Flash (Latest)' },
  ],
  claude: [
    { name: 'claude-sonnet-5', displayName: 'Claude Sonnet 5' },
    { name: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5' },
    { name: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' },
  ],
  openai: [
    { name: 'gpt-5.6-luna', displayName: 'GPT-5.6 Luna' },
    { name: 'gpt-4o-mini', displayName: 'GPT-4o Mini' },
    { name: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini' },
  ],
  groq: [
    { name: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B (rápido)' },
    { name: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B' },
    { name: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B' },
  ],
  deepseek: [
    { name: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash' },
    { name: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner' },
  ],
  together: [
    { name: 'mistralai/Mixtral-8x7B-Instruct-v0.1', displayName: 'Mixtral 8x7B' },
    { name: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', displayName: 'Llama 3.3 70B' },
    { name: 'deepseek-ai/DeepSeek-R1', displayName: 'DeepSeek R1' },
  ],
  openrouter: [
    { name: 'openai/gpt-4o-mini', displayName: 'GPT-4o Mini' },
    { name: 'anthropic/claude-sonnet-5', displayName: 'Claude Sonnet 5' },
    { name: 'google/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash' },
    { name: 'meta-llama/llama-3.3-70b-instruct', displayName: 'Llama 3.3 70B' },
  ],
  mistral: [
    { name: 'mistral-large-latest', displayName: 'Mistral Large' },
    { name: 'mistral-small-latest', displayName: 'Mistral Small' },
    { name: 'codestral-latest', displayName: 'Codestral' },
  ],
  perplexity: [
    { name: 'sonar-pro', displayName: 'Sonar Pro' },
    { name: 'sonar', displayName: 'Sonar' },
  ],
  xai: [
    { name: 'grok-4.5', displayName: 'Grok 4.5' },
    { name: 'grok-4.1-fast-reasoning', displayName: 'Grok 4.1 Fast' },
  ],
  cohere: [
    { name: 'command-r-plus', displayName: 'Command R+' },
    { name: 'command-r', displayName: 'Command R' },
  ],
  kimi: [
    { name: 'kimi-k2.5', displayName: 'Kimi K2.5' },
    { name: 'moonshot-v1-8k', displayName: 'Moonshot v1 8K' },
    { name: 'moonshot-v1-128k', displayName: 'Moonshot v1 128K' },
  ],
  glm: [
    { name: 'glm-4.6', displayName: 'GLM-4.6' },
    { name: 'glm-4-plus', displayName: 'GLM-4 Plus' },
    { name: 'glm-4-flash', displayName: 'GLM-4 Flash' },
  ],
  'openai-custom': [
    { name: '', displayName: 'Escribe el modelo manualmente' },
  ],
  local: [
    { name: 'llama3.2', displayName: 'Llama 3.2' },
    { name: 'llama3.1', displayName: 'Llama 3.1' },
    { name: 'phi4', displayName: 'Phi-4' },
    { name: 'phi3.5', displayName: 'Phi-3.5' },
    { name: 'mistral', displayName: 'Mistral' },
    { name: 'qwen2.5', displayName: 'Qwen 2.5' },
    { name: 'deepseek-r1:7b', displayName: 'DeepSeek R1 (7B)' },
  ]
}

async function listModels(apiKey, providerName) {
  if (providerName === 'local') {
    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags')
      const data = await res.json()
      if (res.ok && data.models) {
        return data.models.map(m => ({ name: m.name, displayName: m.name }))
      }
    } catch {}
    return KNOWN_MODELS.local
  }
  // Servidores OpenAI-compatibles (LM Studio, custom con URL): lista viva.
  if (providerName === 'lmstudio' || providerName === 'openai-custom') {
    try {
      const cfg = config.load()
      const base = (providerName === 'lmstudio' ? 'http://127.0.0.1:1234/v1' : '') || cfg.apiUrl || ''
      if (base) {
        const res = await fetch(`${base.replace(/\/$/, '')}/models`)
        const data = await res.json()
        if (res.ok && Array.isArray(data.data) && data.data.length) {
          return data.data.map(m => ({ name: m.id, displayName: m.id })).slice(0, 30)
        }
      }
    } catch {}
    if (providerName === 'lmstudio') return [{ name: 'local-model', displayName: 'Modelo cargado en LM Studio' }]
  }
  if (!KNOWN_MODELS[providerName]) return []
  if (!apiKey) return []
  return KNOWN_MODELS[providerName]
}

async function ask(prompt) {
  ensureHistory()
  const cfg = config.load()
  const providerName = cfg.provider || 'gemini'
  const provider = PROVIDERS[providerName]
  if (!provider) return `Proveedor "${providerName}" no soportado. Usa: ${Object.keys(PROVIDERS).join(', ')}`
  // Sin key solo vale en local o URLs privadas (Ollama, LM Studio, llama.cpp).
  const base = (providerName === 'local' ? 'http://127.0.0.1:11434/v1' : null)
    || cfg.apiUrl || provider.baseUrl || ''
  if (providerName !== 'local' && !cfg.apiKey && !isPrivateUrl(base)) return ''

  const model = cfg.model || provider.defaultModel
  const apiKey = cfg.apiKey || ''
  const { url, options } = provider.buildRequest(apiKey, model, prompt, conversationHistory)

  try {
    const res = await fetch(url, options)
    const data = await res.json()
    const apiError = provider.extractError(data)
    if (!res.ok || apiError) {
      const msg = apiError || `HTTP ${res.status}`
      if (model !== provider.defaultModel && /no longer available|not found|not supported/i.test(msg)) {
        const { url: url2, options: opts2 } = provider.buildRequest(cfg.apiKey, provider.defaultModel, prompt, conversationHistory)
        try {
          const res2 = await fetch(url2, opts2)
          const data2 = await res2.json()
          if (res2.ok && !provider.extractError(data2)) {
            const text = provider.parseResponse(data2)
            if (text) {
              config.save({ ...cfg, model: provider.defaultModel })
              addToHistory('user', prompt); addToHistory('assistant', text)
              return text
            }
          }
        } catch {}
      }
      addToHistory('user', prompt)
      addToHistory('assistant', `Error: ${msg}`)
      return `Error (${cfg.provider}/${model}): ${msg}`
    }
    const text = provider.parseResponse(data)
    if (!text) { addToHistory('user', prompt); return '' }
    addToHistory('user', prompt)
    addToHistory('assistant', text)
    return text
  } catch (err) {
    addToHistory('user', prompt)
    addToHistory('assistant', `Error de conexión: ${err.message}`)
    return `Error de conexión: ${err.message}`
  }
}

module.exports = { ask, listModels, clearHistory, PROVIDERS, validateKey }