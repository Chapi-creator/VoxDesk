const fs = require('fs')
const path = require('path')

const assetsDir = path.join(__dirname, '..', 'assets')
const pngPath = path.join(assetsDir, 'icon.png')
const icoPath = path.join(assetsDir, 'icon.ico')

const png = fs.readFileSync(pngPath)

// ICO header: reserved(2) + type(2) + count(2)
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)    // reserved
header.writeUInt16LE(1, 2)    // type: 1 = ICO
header.writeUInt16LE(1, 4)    // count: 1 image

// Directory entry: w(1) + h(1) + colors(1) + reserved(1) + planes(2) + bpp(2) + size(4) + offset(4)
const dir = Buffer.alloc(16)
dir.writeUInt8(0, 0)          // width (0 = 256)
dir.writeUInt8(0, 1)          // height (0 = 256)
dir.writeUInt8(0, 2)          // colors
dir.writeUInt8(0, 3)          // reserved
dir.writeUInt16LE(1, 4)       // planes
dir.writeUInt16LE(32, 6)      // bpp
dir.writeUInt32LE(png.length, 8)  // image size
dir.writeUInt32LE(22, 12)      // offset (6 + 16 = 22)

const ico = Buffer.concat([header, dir, png])
fs.writeFileSync(icoPath, ico)
console.log('ICO generado:', icoPath)
