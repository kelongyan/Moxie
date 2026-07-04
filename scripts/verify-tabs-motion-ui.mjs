import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/renderer/src/styles/app.css', 'utf8')

const getRule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\}`))?.[0] || ''
}

const tabRule = getRule('.tab')
assert(tabRule, 'tab base rule should exist')
assert(tabRule.includes('background-color 0.2s'), 'tab background color should ease over 0.2s')
assert(tabRule.includes('transform 0.2s'), 'tab transform should use a calmer 0.2s transition')
assert(tabRule.includes('backface-visibility: hidden;'), 'tab should avoid subpixel transform flicker')

const pressedRule = getRule('.tab:active')
assert(pressedRule, 'tab pressed rule should exist')
assert(!pressedRule.includes('scale(0.97)'), 'tab press should not use the old heavy scale down')
assert(pressedRule.includes('scale(0.995)'), 'tab press should use a nearly invisible tactile scale')

const surfaceRule = getRule('.tab::before')
assert(surfaceRule, 'tab active surface should be animated by a persistent pseudo element')
assert(surfaceRule.includes('opacity: 0;'), 'tab active surface should start transparent')
assert(surfaceRule.includes('transform: scaleX(0.985) scaleY(0.94);'), 'tab active surface should start slightly tucked in')
assert(surfaceRule.includes('opacity 0.2s'), 'tab active surface opacity should transition smoothly')
assert(surfaceRule.includes('transform 0.2s'), 'tab active surface transform should transition smoothly')

const activeSurfaceRule = getRule('.tab.active::before')
assert(activeSurfaceRule.includes('opacity: 1;'), 'active tab surface should fade in')
assert(activeSurfaceRule.includes('transform: scaleX(1) scaleY(1);'), 'active tab surface should settle at full size')

const activeRule = getRule('.tab.active')
assert(activeRule, 'active tab rule should exist')
assert(!activeRule.includes('linear-gradient'), 'active tab should not snap a gradient background directly on the tab')
assert(!activeRule.includes('0 8px 18px rgba(0, 0, 0, 0.08)'), 'active tab shadow should move to the animated surface')
assert(activeRule.includes('transform: translateY(-0.5px);'), 'active tab lift should be subtle')
assert(!css.includes('.tab.active .tab-title,\n.tab.active.split-peer .tab-title'), 'tab titles should not shift when active state changes')
assert(!css.includes('.tab.active .tab-dirty-dot'), 'dirty indicators should not shift when active state changes')

const markerRule = getRule('.tab::after')
assert(markerRule, 'tab active marker should exist as a persistent pseudo element')
assert(markerRule.includes('opacity: 0;'), 'tab marker should start transparent')
assert(markerRule.includes('scaleY(0.4)'), 'tab marker should start compressed')
assert(markerRule.includes('opacity 0.18s'), 'tab marker opacity should transition')
assert(markerRule.includes('transform 0.2s'), 'tab marker transform should transition')

const activeMarkerRule = getRule('.tab.active::after')
assert(activeMarkerRule.includes('opacity: 1;'), 'active tab marker should fade in')
assert(activeMarkerRule.includes('scaleY(1)'), 'active tab marker should grow into place')

const splitMarkerRule = getRule('.tab.active.split-peer::after')
assert(splitMarkerRule.includes('opacity: 0.72;'), 'split peer marker should be visibly muted')
assert(splitMarkerRule.includes('scaleY(0.86)'), 'split peer marker should settle smaller than focused active marker')

console.log('tabs motion ui ok')
