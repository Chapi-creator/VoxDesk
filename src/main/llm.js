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
function mkOpenAI(name, baseUrl, defaultModel) {
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
          body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature })
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
    defaultModel: 'claude-sonnet-4-20250514',
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
  deepseek: mkOpenAI('DeepSeek', 'https://api.deepseek.com/v1', 'deepseek-chat'),
  together: mkOpenAI('Together AI', 'https://api.together.xyz/v1', 'mistralai/Mixtral-8x7B-Instruct-v0.1'),
  openrouter: mkOpenAI('OpenRouter', 'https://openrouter.ai/api/v1', 'openai/gpt-4o-mini'),
  mistral: mkOpenAI('Mistral AI', 'https://api.mistral.ai/v1', 'mistral-large-latest'),
  perplexity: mkOpenAI('Perplexity', 'https://api.perplexity.ai', 'sonar-pro'),
  xai: mkOpenAI('xAI (Grok)', 'https://api.x.ai/v1', 'grok-2-latest'),
  cohere: mkOpenAI('Cohere', 'https://api.cohere.com/v1', 'command-r-plus'),
  kimi: mkOpenAI('Kimi (Moonshot)', 'https://api.moonshot.cn/v1', 'moonshot-v1-8k'),
  glm: mkOpenAI('GLM (Zhipu)', 'https://open.bigmodel.cn/api/paas/v4', 'glm-4-plus'),
  // Generic custom URL — user sets apiUrl + model manually
  'openai-custom': mkOpenAI('OpenAI Compatible (Custom URL)', '', ''),
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
    { name: 'gemini-flash-latest', displayName: 'Gemini Flash (Latest)' },
    { name: 'gemini-flash-lite-latest', displayName: 'Gemini Flash Lite (Latest)' },
    { name: 'gemini-pro-latest', displayName: 'Gemini Pro (Latest)' },
  ],
  claude: [
    { name: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' },
    { name: 'claude-sonnet-4-20250514-lite', displayName: 'Claude Sonnet 4 Lite' },
    { name: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku' },
  ],
  openai: [
    { name: 'gpt-4o-mini', displayName: 'GPT-4o Mini' },
    { name: 'gpt-4o', displayName: 'GPT-4o' },
    { name: 'gpt-4.1', displayName: 'GPT-4.1' },
    { name: 'o3-mini', displayName: 'o3 Mini' },
    { name: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo' },
  ],
  groq: [
    { name: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B' },
    { name: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B' },
    { name: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B' },
    { name: 'deepseek-r1-distill-llama-70b', displayName: 'DeepSeek R1 70B' },
  ],
  deepseek: [
    { name: 'deepseek-chat', displayName: 'DeepSeek V3' },
    { name: 'deepseek-reasoner', displayName: 'DeepSeek R1' },
  ],
  together: [
    { name: 'mistralai/Mixtral-8x7B-Instruct-v0.1', displayName: 'Mixtral 8x7B' },
    { name: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', displayName: 'Llama 3.3 70B' },
    { name: 'deepseek-ai/DeepSeek-R1', displayName: 'DeepSeek R1' },
  ],
  openrouter: [
    { name: 'openai/gpt-4o-mini', displayName: 'GPT-4o Mini' },
    { name: 'anthropic/claude-sonnet-4', displayName: 'Claude Sonnet 4' },
    { name: 'google/gemini-flash-latest', displayName: 'Gemini Flash' },
    { name: 'meta-llama/llama-3.3-70b-instruct', displayName: 'Llama 3.3 70B' },
    { name: 'deepseek/deepseek-chat', displayName: 'DeepSeek V3' },
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
    { name: 'grok-2-latest', displayName: 'Grok 2' },
    { name: 'grok-beta', displayName: 'Grok Beta' },
  ],
  cohere: [
    { name: 'command-r-plus', displayName: 'Command R+' },
    { name: 'command-r', displayName: 'Command R' },
  ],
  kimi: [
    { name: 'moonshot-v1-8k', displayName: 'Moonshot v1 8K' },
    { name: 'moonshot-v1-32k', displayName: 'Moonshot v1 32K' },
    { name: 'moonshot-v1-128k', displayName: 'Moonshot v1 128K' },
  ],
  glm: [
    { name: 'glm-4-plus', displayName: 'GLM-4 Plus' },
    { name: 'glm-4-air', displayName: 'GLM-4 Air' },
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
  if (!KNOWN_MODELS[providerName]) return []
  if (!apiKey) return []
  return KNOWN_MODELS[providerName]
}

async function ask(prompt) {
  ensureHistory()
  const cfg = config.load()
  const providerName = cfg.provider || 'gemini'
  if (providerName !== 'local' && !cfg.apiKey) return ''
  if (!PROVIDERS[providerName]) return `Proveedor "${providerName}" no soportado. Usa: ${Object.keys(PROVIDERS).join(', ')}`

  const provider = PROVIDERS[providerName]
  const model = cfg.model || provider.defaultModel
  const apiKey = providerName === 'local' ? '' : cfg.apiKey
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