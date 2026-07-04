import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appCss = readFileSync('src/renderer/src/styles/app.css', 'utf8')
const settingsView = readFileSync('src/renderer/src/components/SettingsView.jsx', 'utf8')
const editorArea = readFileSync('src/renderer/src/components/shell/EditorArea.jsx', 'utf8')

const getRule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return appCss.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\}`))?.[0] || ''
}

assert(settingsView.includes('className="settings-page tab-view-surface"'), 'SettingsView should use the shared tab-view motion surface')
assert(editorArea.includes('tab-view-surface'), 'EditorArea should use the shared tab-view motion surface')

const surfaceRule = getRule('.tab-view-surface')
assert(surfaceRule, 'shared tab-view motion surface rule should exist')
assert(surfaceRule.includes('animation: tabViewIn 0.2s var(--ease-smooth);'), 'tab-view surfaces should use the same 0.2s smooth timing as tab pills')
assert(surfaceRule.includes('will-change: opacity, transform;'), 'tab-view surfaces should hint only opacity and transform')

const keyframes = appCss.match(/@keyframes tabViewIn\s*\{[\s\S]*?\n\}/)?.[0] || ''
assert(keyframes, 'tabViewIn keyframes should exist')
assert(keyframes.includes('opacity: 0;'), 'tabViewIn should fade in from transparent')
assert(keyframes.includes('translateY(4px) scale(0.996)'), 'tabViewIn should enter with a subtle page lift')
assert(keyframes.includes('opacity: 1;'), 'tabViewIn should end fully visible')
assert(keyframes.includes('translateY(0) scale(1)'), 'tabViewIn should settle without scale drift')

const settingsRule = getRule('.settings-page')
assert(settingsRule, 'settings page rule should exist')
assert(!settingsRule.includes('menuFadeIn'), 'settings page should not use the old menu pop animation')
assert(!settingsRule.includes('0.18s var(--ease-out)'), 'settings page should not keep the old hard 0.18s easing')

const tabRule = getRule('.tab')
assert(tabRule.includes('transform 0.2s var(--ease-smooth)'), 'tab pill motion should remain the source timing')

console.log('settings motion ui ok')
