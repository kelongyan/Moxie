import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.jsx', 'utf8')
const topbar = readFileSync('src/renderer/src/components/shell/Topbar.jsx', 'utf8')
const handlers = readFileSync('src/renderer/src/lib/menuHandlers.js', 'utf8')
const css = readFileSync('src/renderer/src/styles/app.css', 'utf8')

const topbarCall = app.slice(app.indexOf('<Topbar'), app.indexOf('/>', app.indexOf('<Topbar')) + 2)
for (const prop of [
  'handlers={handlers}',
  'theme={theme}',
  'setTheme={pickBuiltinTheme}',
  'customTheme={customTheme}',
  'customThemes={customThemes}',
  'onPickCustom={setCustomTheme}',
  'onRefreshThemes={refreshThemes}',
  'onOpenSettings={openSettingsTab}',
  'onNotice={(msg) => fireToast(msg)}',
  'lang={lang}'
]) {
  assert(topbarCall.includes(prop), `Topbar call should include ${prop}`)
}

assert(topbar.includes('<MenuBar'), 'Topbar should render MenuBar')
assert(topbar.includes('className="top-chrome"'), 'Topbar should own the top-chrome wrapper')

assert(handlers.includes('setBlock:'), 'menu handlers should expose setBlock for paragraph menu')
assert(handlers.includes('editorApis.current[targetId]?.setBlock?.(id)'), 'setBlock should target the focused editable pane')

for (const selector of [
  '--menubar-h: 28px',
  '--tabbar-h: 38px',
  '.top-chrome',
  '.menubar-row',
  '.menubar-trigger',
  '.menubar-dropdown',
  '.menubar-menu-item',
  '.menubar-dropdown-sub',
  '.app.is-mobile {',
  '--topbar-h: 40px',
  '.app.is-mobile .top-chrome'
]) {
  assert(css.includes(selector), `CSS should include ${selector}`)
}

assert(css.includes('height: var(--menubar-h);'), 'window controls should use the menu row height')
assert(!css.includes('.topbar {\n  grid-column: 2;'), 'topbar should no longer be the grid item')

console.log('menubar ui wiring ok')
