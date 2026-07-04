import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/renderer/src/styles/app.css', 'utf8')

const headingRule = css.match(/\.milkdown \.ProseMirror h1,[\s\S]*?\.milkdown \.ProseMirror h6\s*\{[\s\S]*?\}/)?.[0] || ''
assert(headingRule, 'base heading rule should exist')
assert(headingRule.includes('margin-top: var(--heading-margin-top, 1.35em);'), 'base heading top margin should use a level-aware variable')
assert(headingRule.includes('margin-bottom: var(--heading-margin-bottom, 0.38em);'), 'base heading bottom margin should use a level-aware variable')
assert(!headingRule.includes('margin-top: 1.8em;'), 'base heading top margin should not keep the old loose spacing')
assert(!headingRule.includes('margin-bottom: 0.6em;'), 'base heading bottom margin should not keep the old loose spacing')

const h1Rule = css.match(/\.milkdown \.ProseMirror h1\s*\{[\s\S]*?\}/)?.[0] || ''
assert(h1Rule.includes('padding-bottom: 0.24em;'), 'h1 underline padding should be tightened so h1 -> h2 feels closer')

const h2Rule = css.match(/\.milkdown \.ProseMirror h2\s*\{[\s\S]*?\}/)?.[0] || ''
assert(h2Rule.includes('--heading-margin-top: 1em;'), 'h2 after body text should be closer than h1')
assert(h2Rule.includes('--heading-margin-bottom: 0.36em;'), 'h2 bottom rhythm should be compact')

const h3Rule = css.match(/\.milkdown \.ProseMirror h3\s*\{[\s\S]*?\}/)?.[0] || ''
assert(h3Rule.includes('--heading-margin-top: 0.9em;'), 'h3 after body text should be tighter than h2')
assert(h3Rule.includes('--heading-margin-bottom: 0.34em;'), 'h3 bottom rhythm should be compact')

const h4Rule = css.match(/\.milkdown \.ProseMirror h4\s*\{[\s\S]*?\}/)?.[0] || ''
assert(h4Rule.includes('--heading-margin-top: 0.85em;'), 'h4 after body text should stay compact')
assert(h4Rule.includes('--heading-margin-bottom: 0.32em;'), 'h4 bottom rhythm should stay compact')

const minorHeadingRule = [...css.matchAll(/\.milkdown \.ProseMirror h5,[\s\S]*?\.milkdown \.ProseMirror h6\s*\{[\s\S]*?\}/g)]
  .map((match) => match[0])
  .find((rule) => rule.includes('font-size: 1em;')) || ''
assert(minorHeadingRule.includes('--heading-margin-top: 0.8em;'), 'h5/h6 after body text should not inherit large heading spacing')
assert(minorHeadingRule.includes('--heading-margin-bottom: 0.3em;'), 'h5/h6 bottom rhythm should stay compact')

const adjacentRule = css.match(/\.milkdown \.ProseMirror :is\(h1, h2, h3, h4, h5\) \+ :is\(h2, h3, h4, h5, h6\)\s*\{[\s\S]*?\}/)?.[0] || ''
assert(adjacentRule, 'adjacent heading rule should exist')
assert(adjacentRule.includes('margin-top: 0.72em;'), 'adjacent headings should use a compact top margin')

const mobileRule = css.match(/\.app\.is-mobile \.milkdown \.ProseMirror :is\(h1, h2, h3, h4, h5\) \+ :is\(h2, h3, h4, h5, h6\)\s*\{[\s\S]*?\}/)?.[0] || ''
assert(mobileRule, 'mobile adjacent heading rule should exist')
assert(mobileRule.includes('margin-top: 0.62em;'), 'mobile adjacent headings should stay compact too')

console.log('heading spacing ui ok')
