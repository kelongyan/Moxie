import { readFile } from 'node:fs/promises'

const checks = []
const add = (name, pass, detail = '') => checks.push({ name, pass, detail })
const read = (path) => readFile(path, 'utf8')

const themes = await read('src/renderer/src/themes.js')
add('themes.js exports APPEARANCE_MODES', themes.includes('export const APPEARANCE_MODES'))
add('themes.js exports THEME_PALETTES', themes.includes('export const THEME_PALETTES'))
add('themes.js exports DEFAULT_APPEARANCE_MODE', themes.includes('export const DEFAULT_APPEARANCE_MODE'))
add('themes.js exports DEFAULT_THEME_PALETTE', themes.includes('export const DEFAULT_THEME_PALETTE'))
add('themes.js exports resolveAppearanceMode', themes.includes('export function resolveAppearanceMode'))
add('themes.js exports resolveThemeClasses', themes.includes('export function resolveThemeClasses'))
add('themes.js keeps legacyThemeToAppearance', themes.includes('export function legacyThemeToAppearance'))
add('themes.js keeps appearanceToLegacyTheme', themes.includes('export function appearanceToLegacyTheme'))

const app = await read('src/renderer/src/App.jsx')
add('App.jsx stores appearanceMode state', app.includes('const [appearanceMode, setAppearanceMode]'))
add('App.jsx stores themePalette state', app.includes('const [themePalette, setThemePalette]'))
add('App.jsx applies theme with mode and palette', app.includes('applyTheme(appearanceMode, themePalette'))
add('App.jsx listens for system mode changes', app.includes('matchMedia') && app.includes('prefers-color-scheme'))
add('App.jsx persists appearanceMode', app.includes('appearanceMode,'))
add('App.jsx persists themePalette', app.includes('themePalette,'))

const lifecycle = await read('src/renderer/src/hooks/useAppLifecycle.js')
add('useAppLifecycle receives appearanceMode', lifecycle.includes('appearanceMode,'))
add('useAppLifecycle receives themePalette', lifecycle.includes('themePalette,'))

const settings = await read('src/renderer/src/components/SettingsView.jsx')
add('SettingsView imports APPEARANCE_MODES', settings.includes('APPEARANCE_MODES'))
add('SettingsView imports THEME_PALETTES', settings.includes('THEME_PALETTES'))
add('SettingsView renders appearance mode control', settings.includes('settings-mode-toggle'))
add('SettingsView renders palette grid', settings.includes('settings-palette-grid'))
add('SettingsView does not map THEMES for appearance', !settings.includes('THEMES.map'))

const statusBar = await read('src/renderer/src/components/StatusBar.jsx')
add('StatusBar imports APPEARANCE_MODES', statusBar.includes('APPEARANCE_MODES'))
add('StatusBar imports THEME_PALETTES', statusBar.includes('THEME_PALETTES'))
add('StatusBar shows appearance controls', statusBar.includes('theme-mode-row'))
add('StatusBar lists palettes', statusBar.includes('THEME_PALETTES.map'))
add('StatusBar does not map THEMES', !statusBar.includes('THEMES.map'))

const menuBar = await read('src/renderer/src/components/shell/MenuBar.jsx')
add('MenuBar imports APPEARANCE_MODES', menuBar.includes('APPEARANCE_MODES'))
add('MenuBar imports THEME_PALETTES', menuBar.includes('THEME_PALETTES'))
add('MenuBar builds appearance mode items', menuBar.includes("command: 'setAppearanceMode'"))
add('MenuBar builds palette items', menuBar.includes("command: 'setThemePalette'"))
add('MenuBar does not map THEMES', !menuBar.includes('THEMES.map'))

const menuConfig = await read('src/renderer/src/components/shell/menuConfig.js')
add('menuConfig has appearance mode section', menuConfig.includes("dynamic: 'appearance-modes'"))
add('menuConfig has palette section', menuConfig.includes("dynamic: 'theme-palettes'"))

const css = await read('src/renderer/src/styles/app.css')
add('CSS has settings mode toggle styles', css.includes('.settings-mode-toggle'))
add('CSS has settings palette grid styles', css.includes('.settings-palette-grid'))
add('CSS has dark palette variants', css.includes('body.dark.theme-morandi'))

const failed = checks.filter((check) => !check.pass)
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.pass ? '' : ` (${check.detail})`}`)
}

if (failed.length) {
  console.error(`\n${failed.length}/${checks.length} appearance checks failed`)
  process.exit(1)
}

console.log(`\n${checks.length}/${checks.length} appearance checks passed`)
