import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const winAssociations = packageJson.build?.win?.fileAssociations || []
const macAssociations = packageJson.build?.mac?.fileAssociations || []
const expectedIcon = 'build/file-icon.ico'
const expectedName = 'Moxie.Markdown'
const expectedDescription = 'Moxie Markdown Document'

assert(existsSync('build/file-icon.png'), 'source file icon should exist at build/file-icon.png')
assert(existsSync(expectedIcon), `Windows file icon should exist at ${expectedIcon}`)

for (const ext of ['md', 'markdown']) {
  const win = winAssociations.find((item) => item.ext === ext)
  assert(win, `Windows file association for .${ext} should exist`)
  assert.equal(win.name, expectedName, `Windows .${ext} association should use the stable Moxie ProgID`)
  assert.equal(win.description, expectedDescription, `Windows .${ext} association should use the Moxie document description`)
  assert.equal(win.icon, expectedIcon, `Windows .${ext} association should use the dedicated file icon`)
  assert.notEqual(win.icon, packageJson.build?.win?.icon, `Windows .${ext} file icon should differ from the app icon`)
}

for (const ext of ['md', 'markdown']) {
  const mac = macAssociations.find((item) => item.ext === ext)
  assert(mac, `macOS file association for .${ext} should exist`)
  assert.equal(mac.name, expectedDescription, `macOS .${ext} association should use the Moxie document name`)
}

const ico = readFileSync(expectedIcon)
assert(ico.length > 1024, 'Windows file icon should not be empty')
assert.equal(ico.readUInt16LE(0), 0, 'ICO reserved header should be 0')
assert.equal(ico.readUInt16LE(2), 1, 'ICO type should be icon')
assert(ico.readUInt16LE(4) >= 4, 'ICO should include multiple image sizes')

console.log('file association icons ok')
