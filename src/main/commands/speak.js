function execute(text) {
  return Promise.resolve({
    success: true,
    message: text,
    speak: true,
  })
}

module.exports = { execute }
