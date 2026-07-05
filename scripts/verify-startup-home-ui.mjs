import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.jsx', 'utf8')
const lifecycle = readFileSync('src/renderer/src/hooks/useAppLifecycle.js', 'utf8')
const welcome = readFileSync('src/renderer/src/components/Welcome.jsx', 'utf8')

assert(
  app.includes('const [home, setHome] = useState(true)'),
  'app should start on the home screen instead of an editor tab'
)

assert(
  !welcome.includes('welcome-recents') &&
    !welcome.includes('recent-item') &&
    !welcome.includes('onOpenRecent') &&
    !welcome.includes('onRemoveRecent'),
  'welcome screen should not render or wire recent-file rows'
)

assert(
  !app.includes('recents={recents}') &&
    !app.includes('onOpenRecent=') &&
    !app.includes('onRemoveRecent='),
  'App should not pass recent-file UI props into Welcome'
)

assert(
  lifecycle.includes('settings.restoreTabsOnStartup'),
  'startup lifecycle should gate tab restore behind the Startup Restore setting'
)

assert(
  lifecycle.includes("if (!restorePaths.length && !startupFiles.length) setActiveId(created[0].id)"),
  'startup lifecycle should only focus restored untitled tabs when Startup Restore is enabled and no launch file wins focus'
)

assert(
  lifecycle.includes('setHome(true)'),
  'startup lifecycle should explicitly leave the app on home'
)

assert(
  !lifecycle.includes('welcomeDoc') && !lifecycle.includes('setActiveId(id)'),
  'startup lifecycle should not create a hidden onboarding document tab'
)

console.log('startup home and welcome recent removal wiring ok')
