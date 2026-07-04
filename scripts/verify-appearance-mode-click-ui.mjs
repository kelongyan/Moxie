import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.jsx', 'utf8')
const statusBar = readFileSync('src/renderer/src/components/StatusBar.jsx', 'utf8')
const menuBar = readFileSync('src/renderer/src/components/shell/MenuBar.jsx', 'utf8')
const settings = readFileSync('src/renderer/src/components/SettingsView.jsx', 'utf8')

const pickAppearance = app.slice(
  app.indexOf('const pickAppearanceMode = useCallback'),
  app.indexOf('const t = useCallback', app.indexOf('const pickAppearanceMode = useCallback'))
)
assert(pickAppearance.includes('setAppearanceMode(id)'), 'appearance mode picker should update the selected mode')
assert(pickAppearance.includes('setCustomTheme(null)'), 'appearance mode picker should clear custom-theme overlays')

assert(menuBar.includes('type="button"'), 'menu bar buttons should use explicit button type')
assert(menuBar.includes('disabled={disabled}'), 'placeholder menu items should be native-disabled')
assert(menuBar.includes('if (disabled) return'), 'placeholder menu clicks should be guarded')
assert(menuBar.includes("setAppearanceMode: () => setAppearanceMode?.(item.args)"), 'top theme menu should dispatch appearance mode choices')

const themePicker = statusBar.slice(
  statusBar.indexOf('function ThemePicker'),
  statusBar.indexOf('function LangSwitch')
)
assert(themePicker.includes('const pickMode = (id) => {'), 'desktop theme picker should funnel mode clicks through a picker')
assert(themePicker.includes('setAppearanceMode(id)'), 'desktop theme picker should set the clicked mode')
assert(themePicker.includes('setOpen(false)'), 'desktop theme picker should close after mode selection')
assert(themePicker.includes('type="button"'), 'desktop theme picker buttons should use explicit button type')

const mobileMore = statusBar.slice(
  statusBar.indexOf('function MobileMore'),
  statusBar.indexOf('export default function StatusBar')
)
assert(mobileMore.includes('const pickMode = (id) => {'), 'mobile theme sheet should funnel mode clicks through a picker')
assert(mobileMore.includes('setAppearanceMode(id)'), 'mobile theme sheet should set the clicked mode')
assert(mobileMore.includes('setOpen(false)'), 'mobile theme sheet should close after mode selection')

assert(settings.includes('onClick={() => setAppearanceMode(mode.id)}'), 'settings appearance buttons should use the app-level picker prop')
assert(settings.includes('type="button"'), 'settings appearance controls should use explicit button type')

console.log('appearance mode click wiring ok')
