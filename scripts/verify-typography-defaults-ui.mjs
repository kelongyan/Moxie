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
  "export const DEFAULT_CHINESE_FONT = 'Source Han Sans SC'",
  "export const DEFAULT_ENGLISH_FONT = 'Helvetica Neue'",
  'export const DEFAULT_TYPOGRAPHY_SETTINGS = {'
]) {
  assert(settings.includes(token), `settings should include ${token}`)
}

const defaultTypographyBlock = settings.match(/export const DEFAULT_TYPOGRAPHY_SETTINGS = \{[\s\S]*?\n\}/)?.[0] || ''
for (const token of [
  'pageWidth: DEFAULT_PAGE_WIDTH',
  'fontSize: DEFAULT_FONT_SIZE',
  'lineHeight: DEFAULT_LINE_HEIGHT',
  'paragraphSpacing: DEFAULT_PARA_SPACING',
  'chineseFontFamily: DEFAULT_CHINESE_FONT',
  'englishFontFamily: DEFAULT_ENGLISH_FONT'
]) {
  assert(defaultTypographyBlock.includes(token), `default typography settings should include ${token}`)
}

assert(view.includes('DEFAULT_TYPOGRAPHY_SETTINGS'), 'SettingsView should import the shared default typography settings')
assert(view.includes('function SectionHead({ kicker, title, action })'), 'SectionHead should support a compact action slot')
assert(view.includes('{action && <div className="settings-section-action">{action}</div>}'), 'SectionHead should render the action slot')
assert(view.includes('onUpdateSettings(DEFAULT_TYPOGRAPHY_SETTINGS)'), 'Default button should restore the full typography settings')
assert(view.includes("settings.typographyDefault"), 'Default button should use localized text')

const typographySection = view.slice(view.indexOf('id="settings-typography"'), view.indexOf('id="settings-appearance"'))
const typographyControls = view.slice(view.indexOf('function TypographyControls'), view.indexOf('function FontField'))
assert(typographySection.includes('className="settings-default-btn"'), 'Typography card should contain the default pill button')
assert(!typographySection.includes('title={t(\'settings.typography\')}'), 'Typography SectionHead should not duplicate the title on the right')
assert(typographyControls.includes('settings-font-panel'), 'Typography controls should include the document font panel')
assert(typographyControls.includes('settings-font-preview'), 'Typography controls should include a live font preview')
assert(typographyControls.includes("onUpdateSettings({ chineseFontFamily:"), 'Chinese font input should update typography settings')
assert(typographyControls.includes("onUpdateSettings({ englishFontFamily:"), 'English font input should update typography settings')
assert(
  view.includes("const ENGLISH_FONT_PRESETS = ['Helvetica Neue', 'Segoe UI', 'Arial', 'Times New Roman']"),
  'English presets should include Times New Roman and stay at four options'
)
assert(!view.includes("'Georgia']"), 'Georgia should not occupy the fourth English preset slot')

const appearanceSection = view.slice(view.indexOf('id="settings-appearance"'), view.indexOf('<div className="settings-grid">'))
assert(!appearanceSection.includes('title={t(\'settings.appearance\')}'), 'Appearance card should not duplicate the title on the right')
assert(!appearanceSection.includes('settings-default-btn'), 'Appearance card should not contain the typography default button')

for (const token of [
  "'settings.typographyDefault': 'Default'",
  "'settings.typographyDefault': '默认'",
  "'settings.documentFonts': 'Document fonts'",
  "'settings.documentFonts': '文档字体'",
  "'settings.chineseFont': 'Chinese font'",
  "'settings.chineseFont': '中文字体'",
  "'settings.englishFont': 'English font'",
  "'settings.englishFont': '英文字体'"
]) {
  assert(i18n.includes(token), `i18n should include ${token}`)
}

for (const token of [
  'applyDocumentFonts(settings.chineseFontFamily, settings.englishFontFamily)',
  '--editor-font-chinese',
  '--editor-font-english'
]) {
  assert(settings.includes(token) || css.includes(token) || readFileSync('src/renderer/src/App.jsx', 'utf8').includes(token), `project should include ${token}`)
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

const fontPanelRule = getRule('.settings-font-panel')
assert(fontPanelRule.includes('display: grid;'), 'font panel should use grid layout')

const fontFieldsRule = getRule('.settings-font-fields')
assert(fontFieldsRule.includes('grid-template-columns: repeat(2'), 'font fields should sit in two columns on desktop')
assert(fontFieldsRule.includes('align-items: start;'), 'font field columns should align from the same top edge')

const fontFieldRule = getRule('.settings-font-field')
assert(fontFieldRule.includes('grid-template-rows:'), 'font field rows should keep labels, inputs, and presets aligned')

const fontPresetsRule = getRule('.settings-font-presets')
assert(fontPresetsRule.includes('flex-wrap: nowrap;'), 'font presets should stay on one row')
assert(fontPresetsRule.includes('overflow: hidden;'), 'font presets should stay compact without expanding the layout')

const fontPresetButtonRule = getRule('.settings-font-presets button')
assert(fontPresetButtonRule.includes('flex: 0 1 auto;'), 'font preset buttons should size to their text instead of forcing equal columns')
assert(fontPresetButtonRule.includes('height: 20px;'), 'font preset buttons should be compact')
assert(fontPresetButtonRule.includes('font-size: 9.5px;'), 'font preset buttons should use smaller text')

const fontPreviewRule = getRule('.settings-font-preview')
assert(fontPreviewRule.includes('font-family: var(--font-write);'), 'font preview should use the document font stack')

console.log('typography defaults ui ok')
