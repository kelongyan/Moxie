import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/renderer/src/styles/app.css', 'utf8')
const themes = readFileSync('src/renderer/src/themes.js', 'utf8')

function block(selector) {
  const start = css.indexOf(`${selector} {`)
  assert(start >= 0, `${selector} block should exist`)
  const end = css.indexOf('\n}', start)
  assert(end > start, `${selector} block should close`)
  return css.slice(start, end)
}

const light = block('body.light')
const dark = block('body.dark')

const lightExpected = {
  '--bg': '#f0eee6',
  '--bg-elevated': '#fbfaf7',
  '--bg-sidebar': '#e7e2d8',
  '--bg-editor': '#fffdf8',
  '--bg-activity': '#d8d1c3',
  '--text': '#2b261f',
  '--text-strong': '#17130f',
  '--accent': '#b86f52',
  '--accent-strong': '#8f4f38'
}

const darkExpected = {
  '--bg': '#171412',
  '--bg-elevated': '#211d1a',
  '--bg-sidebar': '#1b1714',
  '--bg-editor': '#1f1b18',
  '--bg-activity': '#120f0d',
  '--text': '#d8d0c3',
  '--text-strong': '#f4eadc',
  '--accent': '#df9276',
  '--accent-strong': '#f1b59d'
}

for (const [token, value] of Object.entries(lightExpected)) {
  assert(light.includes(`${token}: ${value};`), `light warm theme should set ${token} to ${value}`)
}

for (const [token, value] of Object.entries(darkExpected)) {
  assert(dark.includes(`${token}: ${value};`), `dark warm theme should set ${token} to ${value}`)
}

assert(themes.includes("{ id: 'warm', cls: '', en: 'Anthropic Warm', zh: '人文暖灰', swatch: '#b86f52', darkSwatch: '#df9276' }"), 'warm palette should be renamed and use Anthropic-style swatches')
assert(themes.includes("en: 'Anthropic Light'"), 'legacy light theme label should reflect Anthropic style')
assert(themes.includes("zh: '人文浅色'"), 'legacy light theme zh label should reflect Anthropic style')
assert(themes.includes("en: 'Anthropic Dark'"), 'legacy dark theme label should reflect Anthropic style')
assert(themes.includes("zh: '人文深色'"), 'legacy dark theme zh label should reflect Anthropic style')

console.log('anthropic warm theme tokens ok')
