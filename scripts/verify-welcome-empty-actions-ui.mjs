import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const welcome = readFileSync('src/renderer/src/components/Welcome.jsx', 'utf8')
const sidebar = readFileSync('src/renderer/src/components/Sidebar.jsx', 'utf8')
const css = readFileSync('src/renderer/src/styles/app.css', 'utf8')

assert(
  welcome.includes('className="welcome-action is-primary"'),
  'welcome primary action should use a scoped compact class'
)
assert(
  (welcome.match(/<button className="welcome-action/g) || []).length === 3,
  'welcome should render three scoped compact action buttons'
)
assert(
  !welcome.includes('className="btn-primary"'),
  'welcome actions should not use the global btn-primary class'
)

assert(
  sidebar.includes('className="sidebar-empty-action"'),
  'sidebar empty state should use a scoped compact action'
)
assert(
  sidebar.includes('<Icon name="folder" size={13} />'),
  'sidebar empty action should use a compact folder icon'
)
assert(
  !sidebar.includes('className="btn-primary"'),
  'sidebar empty state should not use the global btn-primary class'
)

for (const selector of [
  '.welcome-action {',
  'height: 32px;',
  '.welcome-action.is-primary {',
  '.sidebar-empty-action {',
  'height: 28px;',
  '.sidebar-empty p {'
]) {
  assert(css.includes(selector), `CSS should include ${selector}`)
}

assert(
  !css.includes('.welcome-actions button,\n.btn-primary'),
  'welcome styles should not be coupled to global btn-primary'
)
assert(
  !css.includes('.btn-primary,\n.welcome-actions .btn-primary'),
  'primary welcome styles should not be coupled to global btn-primary'
)
assert(
  css.includes('.sidebar-empty p {\n  margin: 0;\n  padding: 0;'),
  'sidebar empty text should not keep large shared empty-state padding'
)

console.log('welcome and sidebar empty action ui wiring ok')
