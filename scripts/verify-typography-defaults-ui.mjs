import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const settings = readFileSync('src/renderer/src/settings.js', 'utf8')
const view = readFileSync('src/renderer/src/components/SettingsView.jsx', 'utf8')
const css = readFileSync('src/renderer/src/styles/app.css', 'utf8')
const i18n = readFileSync('src/renderer/src/i18n.jsx', 'utf8')

const getRule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\}`))?.[0] || ''
}

for (const token of [
  'export const DEFAULT_PAGE_WIDTH = 1140',
  'export const DEFAULT_FONT_SIZE = 16',
  'export const DEFAULT_LINE_HEIGHT = 1.6',
  'export const DEFAULT_PARA_SPACING = 0.4',
  'export const DEFAULT_TYPOGRAPHY_SETTINGS = {'
]) {
  assert(settings.includes(token), `settings should include ${token}`)
}

const defaultTypographyBlock = settings.match(/export const DEFAULT_TYPOGRAPHY_SETTINGS = \{[\s\S]*?\n\}/)?.[0] || ''
for (const token of [
  'pageWidth: DEFAULT_PAGE_WIDTH',
  'fontSize: DEFAULT_FONT_SIZE',
  'lineHeight: DEFAULT_LINE_HEIGHT',
  'paragraphSpacing: DEFAULT_PARA_SPACING'
]) {
  assert(defaultTypographyBlock.includes(token), `default typography settings should include ${token}`)
}

assert(view.includes('DEFAULT_TYPOGRAPHY_SETTINGS'), 'SettingsView should import the shared default typography settings')
assert(view.includes('function SectionHead({ kicker, title, action })'), 'SectionHead should support a compact action slot')
assert(view.includes('{action && <div className="settings-section-action">{action}</div>}'), 'SectionHead should render the action slot')
assert(view.includes('onUpdateSettings(DEFAULT_TYPOGRAPHY_SETTINGS)'), 'Default button should restore the four typography settings')
assert(view.includes("settings.typographyDefault"), 'Default button should use localized text')

const typographySection = view.slice(view.indexOf('id="settings-typography"'), view.indexOf('id="settings-appearance"'))
assert(typographySection.includes('className="settings-default-btn"'), 'Typography card should contain the default pill button')
assert(!typographySection.includes('title={t(\'settings.typography\')}'), 'Typography SectionHead should not duplicate the title on the right')

const appearanceSection = view.slice(view.indexOf('id="settings-appearance"'), view.indexOf('<div className="settings-grid">'))
assert(!appearanceSection.includes('title={t(\'settings.appearance\')}'), 'Appearance card should not duplicate the title on the right')
assert(!appearanceSection.includes('settings-default-btn'), 'Appearance card should not contain the typography default button')

for (const token of [
  "'settings.typographyDefault': 'Default'",
  "'settings.typographyDefault': '默认'"
]) {
  assert(i18n.includes(token), `i18n should include ${token}`)
}

const actionRule = getRule('.settings-section-action')
assert(actionRule.includes('flex: 0 0 auto;'), 'settings section action should stay compact')

const buttonRule = getRule('.settings-default-btn')
assert(buttonRule.includes('border-radius: 999px;'), 'default button should use a restrained pill shape')
assert(buttonRule.includes('height: 26px;'), 'default button should be compact')
assert(buttonRule.includes('background: color-mix'), 'default button should use a soft filled surface')
assert(buttonRule.includes('transition:'), 'default button should have polished hover/press transitions')

const buttonHoverRule = getRule('.settings-default-btn:hover')
assert(buttonHoverRule.includes('transform: translateY(-0.5px);'), 'default button hover should be subtle')

console.log('typography defaults ui ok')
