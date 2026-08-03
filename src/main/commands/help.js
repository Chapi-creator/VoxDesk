function execute() {
  const smartHelp = require('../smart-exec').getHelp()
  const lines = smartHelp.map(g => g.group + ': ' + g.items.join(', '))
  return Promise.resolve({
    success: true,
    message: 'COMANDOS DISPONIBLES. ' + lines.join(' | '),
    speak: true,
  })
}

module.exports = { execute }