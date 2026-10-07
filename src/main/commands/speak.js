function execute(text) {
  // Fase 11: "dime un chiste/dato" lo resuelve smart-exec, no se repite literal.
  if (/chiste|dato curioso|curiosidad/i.test(text || '')) {
    return Promise.resolve({ success: false, message: '' })
  }
  return Promise.resolve({
    success: true,
    message: text,
    speak: true,
  })
}

module.exports = { execute }
