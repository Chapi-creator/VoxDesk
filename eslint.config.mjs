// Fase 6: lint mínimo — solo lo que rompe en runtime (nombres mal escritos, muertos).
const nodeGlobals = {
  require: 'readonly', module: 'readonly', exports: 'writable',
  __dirname: 'readonly', __filename: 'readonly', process: 'readonly',
  console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly', Buffer: 'readonly',
  fetch: 'readonly', URL: 'readonly',
}
const rendererGlobals = {
  window: 'readonly', document: 'readonly', navigator: 'readonly',
  requestAnimationFrame: 'readonly', AudioContext: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly',
}
export default [
  {
    files: ['main.js', 'preload.js', 'src/main/**/*.js', 'src/shared/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: nodeGlobals },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none' }], 'no-redeclare': 'error' },
  },
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: rendererGlobals },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none' }], 'no-redeclare': 'error' },
  },
]
