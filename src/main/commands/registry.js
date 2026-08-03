const { COMMANDS } = require('../../shared/constants')
const system = require('./system')

class CommandRegistry {
  constructor() {
    this.handlers = new Map()
    this._registerDefaults()
  }

  _registerDefaults() {
    this.register(COMMANDS.LAUNCH, require('./launch'))
    this.register(COMMANDS.SPEAK, require('./speak'))
    this.register(COMMANDS.SEARCH, require('./search'))
    this.register(COMMANDS.TYPE, require('./type'))
    this.register(COMMANDS.HELP, require('./help'))
    this.register(COMMANDS.VOLUME, { execute: system.executeVolume })
    this.register(COMMANDS.BRIGHTNESS, { execute: system.executeBrightness })
    this.register(COMMANDS.SYSTEM, { execute: system.executeSystem })
    this.register(COMMANDS.ALARM, require('./timer'))
    this.register(COMMANDS.SCREENSHOT, require('./capture'))
    this.register(COMMANDS.NOTE, require('./notes'))
    this.register(COMMANDS.CLIMA, require('./weather'))
    this.register(COMMANDS.TRANSLATE, require('./translate'))
  }

  register(name, handler) {
    this.handlers.set(name, handler)
  }

  get(commandName) {
    return this.handlers.get(commandName) || null
  }

  getAll() {
    return Array.from(this.handlers.keys())
  }
}

module.exports = new CommandRegistry()
