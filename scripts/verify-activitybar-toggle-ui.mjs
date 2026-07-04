import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createMenuHandlers } from '../src/renderer/src/lib/menuHandlers.js'

function createHarness({ mode, open }) {
  let sidebarMode = mode
  let sidebarOpen = open
  const handlers = createMenuHandlers({
    pickEditableId: () => null,
    activeId: null,
    setHome: () => {},
    isMobile: false,
    sidebarMode,
    setSidebarOpen: (next) => {
      sidebarOpen = typeof next === 'function' ? next(sidebarOpen) : next
    },
    setSidebarMode: (next) => {
      sidebarMode = next
    },
    setPaletteOpen: () => {},
    newTab: () => {},
    openPaths: () => {},
    openFolder: () => {},
    saveTab: () => {},
    closeTab: () => {},
    toggleSource: () => {},
    cycleTheme: () => {},
    editorApis: { current: {} },
    tabs: [],
    tRef: { current: (key) => key },
    setFind: () => {},
    findInputRef: { current: null },
    replaceInputRef: { current: null },
    review: {
      applyReviewMarkupToActive: () => {},
      copyReviewPrompt: () => {},
      applyReviewDecisionToActive: () => {}
    }
  })

  return {
    handlers,
    state: () => ({ sidebarMode, sidebarOpen })
  }
}

let harness = createHarness({ mode: 'outline', open: true })
harness.handlers.toggleOutline()
assert.deepEqual(
  harness.state(),
  { sidebarMode: 'outline', sidebarOpen: false },
  'clicking the active outline button should collapse the sidebar'
)

harness = createHarness({ mode: 'files', open: true })
harness.handlers.toggleFiles()
assert.deepEqual(
  harness.state(),
  { sidebarMode: 'files', sidebarOpen: false },
  'clicking the active files button should collapse the sidebar'
)

harness = createHarness({ mode: 'files', open: true })
harness.handlers.toggleOutline()
assert.deepEqual(
  harness.state(),
  { sidebarMode: 'outline', sidebarOpen: true },
  'clicking another panel button should switch modes and keep the sidebar open'
)

harness = createHarness({ mode: 'outline', open: false })
harness.handlers.toggleOutline()
assert.deepEqual(
  harness.state(),
  { sidebarMode: 'outline', sidebarOpen: true },
  'clicking the current panel button while collapsed should open it'
)

const app = readFileSync('src/renderer/src/App.jsx', 'utf8')
const handlerCallStart = app.indexOf('handlers.current = createMenuHandlers({')
const handlerCall = app.slice(handlerCallStart, app.indexOf('  })', handlerCallStart) + 4)
assert(handlerCall.includes('sidebarMode,'), 'App should pass the current sidebarMode into createMenuHandlers')
assert(app.includes('const toggleSettingsTab = useCallback('), 'App should expose a left-rail settings toggle')
assert(app.includes('onSettings={toggleSettingsTab}'), 'ActivityBar settings button should toggle the active settings tab')

console.log('activity bar toggle behavior ok')
