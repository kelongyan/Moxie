import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/renderer/src/styles/app.css', 'utf8')
const themes = readFileSync('src/renderer/src/themes.js', 'utf8')
const app = readFileSync('src/renderer/src/App.jsx', 'utf8')
const settings = readFileSync('src/renderer/src/components/SettingsView.jsx', 'utf8')
const statusBar = readFileSync('src/renderer/src/components/StatusBar.jsx', 'utf8')
const topbar = readFileSync('src/renderer/src/components/shell/Topbar.jsx', 'utf8')
const menuBar = readFileSync('src/renderer/src/components/shell/MenuBar.jsx', 'utf8')

function block(selector) {
  const start = css.indexOf(`${selector} {`)
  assert(start >= 0, `${selector} block should exist`)
  const end = css.indexOf('\n}', start)
  assert(end > start, `${selector} block should close`)
  return css.slice(start, end)
}

function expectTokens(selector, expected) {
  const cssBlock = block(selector)
  for (const [token, value] of Object.entries(expected)) {
    assert(
      cssBlock.includes(`${token}: ${value};`),
      `${selector} should set ${token} to ${value}`
    )
  }
}

assert(
  themes.includes('export function paletteSwatchForMode'),
  'themes.js should export paletteSwatchForMode for mode-aware previews'
)

const paletteLines = [
  "{ id: 'morandi', cls: 'theme-morandi', en: 'Morandi Sage', zh: '莫兰迪·灰绿', swatch: '#6f7f5d', darkSwatch: '#a5b88d' }",
  "{ id: 'morandi-rose', cls: 'theme-morandi-rose', en: 'Morandi Rose', zh: '莫兰迪·豆沙', swatch: '#9a746f', darkSwatch: '#d0a19a' }",
  "{ id: 'morandi-blue', cls: 'theme-morandi-blue', en: 'Morandi Mist', zh: '莫兰迪·雾蓝', swatch: '#6f899a', darkSwatch: '#9ab1c6' }"
]
for (const line of paletteLines) {
  assert(themes.includes(line), `THEME_PALETTES should include ${line}`)
}

expectTokens('body.theme-morandi', {
  '--bg': '#ecece6',
  '--bg-editor': '#fbfbf6',
  '--accent': '#6f7f5d',
  '--accent-strong': '#4f6042'
})
expectTokens('body.theme-morandi-rose', {
  '--bg': '#eee7e4',
  '--bg-editor': '#fbf7f5',
  '--accent': '#9a746f',
  '--accent-strong': '#724d49'
})
expectTokens('body.theme-morandi-blue', {
  '--bg': '#e7eaec',
  '--bg-editor': '#f8fafb',
  '--accent': '#6f899a',
  '--accent-strong': '#516b7b'
})
expectTokens('body.dark.theme-morandi', {
  '--bg': '#171a16',
  '--bg-editor': '#1f241d',
  '--accent': '#a5b88d',
  '--accent-strong': '#cad7b6'
})
expectTokens('body.dark.theme-morandi-rose', {
  '--bg': '#1d1917',
  '--bg-editor': '#28221f',
  '--accent': '#d0a19a',
  '--accent-strong': '#edc2bd'
})
expectTokens('body.dark.theme-morandi-blue', {
  '--bg': '#171b20',
  '--bg-editor': '#20262d',
  '--accent': '#9ab1c6',
  '--accent-strong': '#c2d4e4'
})

assert(app.includes('systemDark={systemDark}'), 'App should pass systemDark to theme preview surfaces')
assert(settings.includes('paletteSwatchForMode'), 'SettingsView should use paletteSwatchForMode')
assert(statusBar.includes('paletteSwatchForMode'), 'StatusBar should use paletteSwatchForMode')
assert(topbar.includes('systemDark'), 'Topbar should forward systemDark')
assert(menuBar.includes('paletteSwatchForMode'), 'MenuBar should use paletteSwatchForMode')
assert(menuBar.includes('systemDark'), 'MenuBar should receive systemDark')

console.log('morandi theme tokens and previews ok')
