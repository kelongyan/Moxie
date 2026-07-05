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
const sourceBundle = [css, themes, app, settings, statusBar, topbar, menuBar].join('\n')

const oldRefs = ['theme-morandi', 'Morandi Sage', '莫兰迪·灰绿']

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
    if (/\.(css|jsx?|mjs|cjs|json|md|txt)$/i.test(current)) files.push(current)
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
  themes.includes("{ id: 'catppuccin', cls: 'theme-catppuccin', en: 'Catppuccin', zh: '卡布奇诺', swatch: '#8839ef', darkSwatch: '#cba6f7' }"),
  'THEME_PALETTES should include Catppuccin'
)
assert(!sourceBundle.includes("{ id: 'morandi'"), 'runtime source should not keep old morandi palette id')

const staleRefs = projectTextFiles('.')
  .flatMap((file) => {
    if (file.endsWith('verify-catppuccin-theme.mjs')) return []
    const text = readFileSync(file, 'utf8')
    const normalized = text.replaceAll('theme-morandi-blue', 'theme_morandi_blue')
    return oldRefs
      .filter((needle) => normalized.includes(needle))
      .map((needle) => `${file}: ${needle}`)
  })
assert.deepEqual(staleRefs, [], 'project should not keep old Morandi gray-green ids or labels')

expectTokens('body.theme-catppuccin', {
  '--bg': '#eff1f5',
  '--bg-elevated': '#f9fafc',
  '--bg-sidebar': '#e6e9ef',
  '--bg-editor': '#f5f6fb',
  '--bg-activity': '#dce0e8',
  '--text': '#3c405a',
  '--text-strong': '#181825',
  '--muted': '#5f6379',
  '--faint': '#7d8194',
  '--border': '#c5cbd8',
  '--accent': '#8839ef',
  '--accent-strong': '#6c21d9',
  '--code-block-bg': '#eeeaf8',
  '--code-block-border': '#cfc7e2',
  '--code-token-text': '#3c405a',
  '--code-token-comment': '#7d8194',
  '--table-head-bg': '#e9ecf5',
  '--table-grid': '#d6dbea',
  '--table-border': '#c5cbd8',
  '--table-row-alt': 'rgba(136, 57, 239, 0.04)',
  '--code-token-keyword': '#8839ef',
  '--code-token-string': '#40a02b',
  '--danger': '#d20f39',
  '--success': '#40a02b'
})

expectTokens('body.dark.theme-catppuccin', {
  '--bg': '#1e1e2e',
  '--bg-elevated': '#282839',
  '--bg-sidebar': '#181825',
  '--bg-editor': '#1e1e2e',
  '--bg-activity': '#11111b',
  '--text': '#cdd6f4',
  '--text-strong': '#f5e0dc',
  '--muted': '#a6adc8',
  '--faint': '#7f849c',
  '--border': '#45475a',
  '--accent': '#cba6f7',
  '--accent-strong': '#f5c2e7',
  '--code-block-bg': '#11111b',
  '--code-token-keyword': '#cba6f7',
  '--code-token-string': '#a6e3a1',
  '--danger': '#f38ba8',
  '--success': '#a6e3a1'
})

assert(
  /body\.dark\.theme-catppuccin\s+\.milkdown\s+\.ProseMirror\s+pre[\s\S]*?background:\s*var\(--code-block-bg\)\s*!important/.test(css),
  'Catppuccin dark code block wrapper should use the dark code block surface'
)
assert(
  /body\.dark\.theme-catppuccin\s+\.milkdown\s+\.milkdown-code-block[\s\S]*?background:\s*var\(--code-block-bg\)\s*!important/.test(css),
  'Catppuccin dark Milkdown code block shell should use the dark code block surface'
)

assert(themes.includes('paletteSwatchForMode'), 'themes.js should keep mode-aware palette swatches')
assert(app.includes('systemDark={systemDark}'), 'App should pass systemDark to theme preview surfaces')
assert(settings.includes('paletteSwatchForMode'), 'SettingsView should use paletteSwatchForMode')
assert(statusBar.includes('paletteSwatchForMode'), 'StatusBar should use paletteSwatchForMode')
assert(topbar.includes('systemDark'), 'Topbar should forward systemDark')
assert(menuBar.includes('paletteSwatchForMode'), 'MenuBar should use paletteSwatchForMode')

console.log('catppuccin theme tokens and registrations ok')
