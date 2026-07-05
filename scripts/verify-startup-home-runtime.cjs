const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('C:/Users/Administrator/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright')

const cwd = path.resolve(__dirname, '..')
const outputDir = path.join(cwd, 'output', 'playwright')

async function launchWithProfile(profileDir, extraArgs = [], initSession = null) {
  const app = await electron.launch({
    executablePath: path.join(cwd, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [`--user-data-dir=${profileDir}`, '.', ...extraArgs],
    cwd
  })
  if (initSession) {
    await app.context().addInitScript((session) => {
      localStorage.setItem('moxie.onboarded.v1', '1')
      localStorage.setItem('moxie.session.v1', JSON.stringify(session))
    }, initSession)
  }
  return app
}

;(async () => {
  const tempRoot = process.env.TEMP || 'C:/Windows/Temp'
  const profileDir = path.join(tempRoot, `moxie-startup-home-${Date.now()}`)
  const sampleDir = fs.mkdtempSync(path.join(tempRoot, 'moxie-startup-home-sample-'))
  const oldPath = path.join(sampleDir, 'old-session.md')
  const launchPath = path.join(sampleDir, 'launch-file.md')

  fs.mkdirSync(profileDir, { recursive: true })
  fs.writeFileSync(oldPath, '# Old session\n\nThis should not open on normal launch.\n', 'utf8')
  fs.writeFileSync(launchPath, '# Launch file\n\nThis should open when passed by the OS.\n', 'utf8')

  const app1 = await launchWithProfile(profileDir, [], {
    lang: 'zh',
    sidebarMode: 'files',
    openPaths: [oldPath],
    activePath: oldPath,
    recents: [
      {
        path: oldPath,
        name: 'old-session.md',
        dir: oldPath.replace(/[\\/][^\\/]*$/, ''),
        openedAt: Date.now()
      }
    ]
  })
  try {
    const page = await app1.firstWindow()
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.waitForSelector('.welcome-card', { state: 'visible', timeout: 30000 })
    await page.waitForSelector('.welcome-action', { state: 'visible', timeout: 30000 })
    await page.waitForTimeout(500)
    fs.mkdirSync(outputDir, { recursive: true })
    const homeShot = path.join(outputDir, 'startup-home-no-recents.png')
    await page.screenshot({ path: homeShot, fullPage: false })

    const homeState = await page.evaluate(() => ({
      hasWelcome: !!document.querySelector('.welcome-card'),
      actionCount: document.querySelectorAll('.welcome-action').length,
      recentCount: document.querySelectorAll('.welcome-recents, .recent-item').length,
      activeTabCount: document.querySelectorAll('.tab.active').length,
      tabText: Array.from(document.querySelectorAll('.tab-title')).map((el) => el.textContent || ''),
      editorVisible: !!document.querySelector('.editor-area:not([style*="display: none"]) .editor-scroll .milkdown')
    }))

    assert.equal(homeState.hasWelcome, true, 'normal startup should show the home page')
    assert.equal(homeState.actionCount, 3, 'home page should keep the three quick actions')
    assert.equal(homeState.recentCount, 0, 'home page should not render recent files')
    assert.equal(homeState.activeTabCount, 0, 'normal startup should not activate the old session file')
    assert.equal(homeState.tabText.length, 0, 'normal startup should not create hidden document tabs')
    assert(!homeState.tabText.includes('old-session.md'), 'old session file should not be reopened as a tab')
    assert.equal(homeState.editorVisible, false, 'editor should stay hidden while home is active')

    console.log(JSON.stringify({ normalLaunch: homeState, homeShot }, null, 2))
  } finally {
    await app1.evaluate(async ({ app }) => app.exit(0)).catch(() => {})
  }

  const app2 = await launchWithProfile(profileDir, [launchPath])
  try {
    const page = await app2.firstWindow()
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.waitForSelector('.tab-title', { state: 'attached', timeout: 30000 })
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.tab-title')).some((el) => el.textContent?.includes('launch-file.md')),
      null,
      { timeout: 30000 }
    )
    await page.waitForSelector('.welcome-card', { state: 'detached', timeout: 30000 }).catch(() => {})

    const openedState = await page.evaluate(() => ({
      hasWelcome: !!document.querySelector('.welcome-card'),
      tabText: Array.from(document.querySelectorAll('.tab-title')).map((el) => el.textContent || ''),
      activeTabText: document.querySelector('.tab.active .tab-title')?.textContent || '',
      editorVisible: !!document.querySelector(
        '.editor-area:not([style*="display: none"]) .editor-scroll .milkdown, .editor-area:not([style*="display: none"]) .source-editor'
      )
    }))

    assert.equal(openedState.hasWelcome, false, 'explicit file launch should leave home')
    assert(openedState.tabText.includes('launch-file.md'), 'explicit launch file should open as a tab')
    assert.equal(openedState.activeTabText, 'launch-file.md', 'explicit launch file should become active')
    assert.equal(openedState.editorVisible, true, 'explicit launch file should show an editor')

    console.log(JSON.stringify({ explicitFileLaunch: openedState }, null, 2))
  } finally {
    await app2.evaluate(async ({ app }) => app.exit(0)).catch(() => {})
    try { fs.rmSync(profileDir, { recursive: true, force: true }) } catch {}
    try { fs.rmSync(sampleDir, { recursive: true, force: true }) } catch {}
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
