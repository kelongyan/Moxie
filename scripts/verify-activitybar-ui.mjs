import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const activity = readFileSync('src/renderer/src/components/shell/ActivityBar.jsx', 'utf8')
const css = readFileSync('src/renderer/src/styles/app.css', 'utf8')

for (const token of [
  'activity-section activity-section-top',
  'activity-section activity-section-bottom',
  'activity-home',
  'activity-panel-toggle'
]) {
  assert(activity.includes(token), `ActivityBar should include ${token}`)
}

assert(!activity.includes('activity-brand'), 'Logo should not use the capsule brand class')

for (const token of [
  '--activity-bar-w: 56px',
  '.activity-section',
  'width: 40px;',
  'height: 36px;',
  'border-radius: 12px;',
  '.activity-item.active::after',
  'box-shadow: none;',
  '.activity-home .activity-logo',
  '.activity-panel-toggle'
]) {
  assert(css.includes(token), `ActivityBar CSS should include ${token}`)
}

assert(!css.includes('.activity-brand'), 'Logo should not have a dedicated capsule style')
const activeRule = css.match(/\.activity-item\.active\s*\{[\s\S]*?\}/)?.[0] || ''
assert(!activeRule.includes('0 8px 18px rgba(0, 0, 0, 0.08)'), 'Activity buttons should not keep the heavy capsule shadow')
assert(activeRule.includes('box-shadow: none;'), 'Activity active state should be flat')

const oldActiveRule = css.match(/\.activity-item\.active::before\s*\{[\s\S]*?\}/)?.[0] || ''
assert(!oldActiveRule.includes('left: 0;'), 'active state should not use the old outer left rail')

console.log('activity bar ui wiring ok')
