import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync('src/renderer/src/styles/app.css', 'utf8')
const themes = readFileSync('src/renderer/src/themes.js', 'utf8')
const app = readFileSync('src/renderer/src/App.jsx', 'utf8')
const settings = readFileSync('src/renderer/src/components/SettingsView.jsx', 'utf8')
const statusBar = readFileSync('src/renderer/src/components/StatusBar.jsx', 'utf8')
const topbar = readFileSync('src/renderer/src/components/shell/Topbar.jsx', 'utf8')
const menuBar = readFileSync('src/renderer/src/components/shell/MenuBar.jsx', 'utf8')
const lifecycle = readFileSync('src/renderer/src/hooks/useAppLifecycle.js', 'utf8')
const sourceBundle = [css, themes, app, settings, statusBar, topbar, menuBar].join('\n')

const oldId = ['morandi', 'rose'].join('-')
const oldZh = ['莫兰迪', '豆沙'].join('·')
const oldEn = ['Morandi', 'Rose'].join(' ')
const oldRoseAlias = '玫' + '瑰'

function projectTextFiles(root) {
  const files = []
  const stack = [root]
  const ignoredDirs = new Set([
    '.git',
    '.claude',
    '.omc',
    '.playwright-mcp',
    'dist',
    'dist-mobile',
    'node_modules',
    'out',
    'output'
  ])
  while (stack.length) {
    const current = stack.pop()
    const stat = statSync(current)
    if (stat.isDirectory()) {
      for (const name of readdirSync(current)) {
        if (ignoredDirs.has(name)) continue
        stack.push(join(current, name))
      }
      continue
    }
    if (/\.(css|jsx?|mjs|json|md|txt)$/i.test(current)) files.push(current)
  }
  return files
}

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
  themes.includes("{ id: 'dracula', cls: 'theme-dracula', en: 'Dracula', zh: '德古拉紫', swatch: '#644ac9', darkSwatch: '#bd93f9' }"),
  'THEME_PALETTES should include Dracula'
)
assert(!sourceBundle.includes(oldId), 'old palette id/class should be removed from runtime source')
assert(!sourceBundle.includes(oldZh), 'old Chinese palette label should be removed from runtime source')
assert(!sourceBundle.includes(oldEn), 'old English palette label should be removed from runtime source')

const staleRefs = projectTextFiles('.')
  .flatMap((file) => {
    const text = readFileSync(file, 'utf8')
    return [oldId, oldZh, oldEn, oldRoseAlias]
      .filter((needle) => text.includes(needle))
      .map((needle) => `${file}: ${needle}`)
  })
assert.deepEqual(staleRefs, [], 'project should not keep old palette ids or labels')

assert(!themes.includes('LEGACY_THEME_MAP'), 'themes.js should not keep old single-theme compatibility map')
assert(!themes.includes('export const THEMES'), 'themes.js should not keep legacy THEMES registry')
assert(!themes.includes('legacyThemeToAppearance'), 'themes.js should not expose legacy theme migration')
assert(!themes.includes('appearanceToLegacyTheme'), 'themes.js should not write legacy theme ids')
assert(!/session\.theme(?!Palette)/.test(app), 'App should read appearanceMode/themePalette directly')
assert(!app.includes('appearanceToLegacyTheme'), 'App should not persist a legacy theme field')
assert(!lifecycle.includes('theme,'), 'session lifecycle should not accept a legacy theme field')

expectTokens('body.theme-dracula', {
  '--bg': '#f3eefb',
  '--bg-sidebar': '#ece5f8',
  '--bg-editor': '#fff9e8',
  '--text': '#2f2b35',
  '--muted': '#6b6570',
  '--border': '#d8d0e9',
  '--accent': '#644ac9',
  '--accent-strong': '#5638b4',
  '--code-bg': '#f4eddd',
  '--danger': '#cb3a2a',
  '--success': '#14710a'
})
expectTokens('body.dark.theme-dracula', {
  '--bg': '#191a22',
  '--bg-sidebar': '#20212b',
  '--bg-editor': '#282a36',
  '--text': '#e9e4f0',
  '--muted': '#b7b1c9',
  '--border': '#3f4154',
  '--accent': '#bd93f9',
  '--accent-strong': '#d6bcff',
  '--code-bg': '#303241',
  '--danger': '#ff6b6b',
  '--success': '#62f58a'
})

assert(
  /body\.dark\.theme-dracula\s+\.milkdown\s+\.ProseMirror\s+pre[\s\S]*?background:\s*var\(--code-block-bg\)\s*!important/.test(css),
  'Dracula dark code block wrapper should use the dark code block surface'
)
assert(
  /body\.dark\.theme-dracula\s+\.milkdown\s+\.milkdown-code-block[\s\S]*?background:\s*var\(--code-block-bg\)\s*!important/.test(css),
  'Dracula dark Milkdown code block shell should use the dark code block surface'
)

assert(themes.includes('paletteSwatchForMode'), 'themes.js should keep mode-aware palette swatches')
assert(app.includes('systemDark={systemDark}'), 'App should pass systemDark to theme preview surfaces')
assert(settings.includes('paletteSwatchForMode'), 'SettingsView should use paletteSwatchForMode')
assert(statusBar.includes('paletteSwatchForMode'), 'StatusBar should use paletteSwatchForMode')
assert(topbar.includes('systemDark'), 'Topbar should forward systemDark')
assert(menuBar.includes('paletteSwatchForMode'), 'MenuBar should use paletteSwatchForMode')

console.log('dracula theme tokens and registrations ok')
