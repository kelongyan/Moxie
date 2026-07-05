import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const menuBar = readFileSync('src/renderer/src/components/shell/MenuBar.jsx', 'utf8')

assert(
  menuBar.includes('onMouseDown={hasChildren ? undefined : (event) => {'),
  'menu commands should run on mouse down so theme changes cannot drop the later click event'
)
assert(
  menuBar.includes('event.preventDefault()'),
  'menu command mouse down should prevent focus/drag side effects before executing'
)
assert(
  menuBar.includes('onClick={() => {') && menuBar.includes('setSubOpen((v) => !v)'),
  'submenu parent buttons should keep click toggling behavior'
)
assert(
  menuBar.includes('onMouseDown={hasChildren ? undefined :'),
  'submenu parent buttons should not execute menu commands on mouse down'
)

console.log('menubar theme click stability wiring ok')
