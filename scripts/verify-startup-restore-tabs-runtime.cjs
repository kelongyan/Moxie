const assert = require('node:assert/strict')
const cp = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { _electron: electron } = require('C:/Users/Administrator/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright')

const cwd = path.resolve(__dirname, '..')
const electronExe = path.join(cwd, 'node_modules', 'electron', 'dist', 'electron.exe')

function rmSoon(target) {
  for (let i = 0; i < 5; i++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
    }
  }
}

function writeMd(dir, name, body = '') {
  const file = path.join(dir, name)
  fs.writeFileSync(file, `# ${name}\n\n${body}\n`, 'utf8')
  return file
}

async function launch(profileDir, extraArgs = []) {
  const app = await electron.launch({
    executablePath: electronExe,
    args: [`--user-data-dir=${profileDir}`, '.', ...extraArgs],
    cwd
  })
  return app
}

async function seedProfile(profileDir, { session, settings }) {
  const app = await launch(profileDir)
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.welcome-card', { state: 'visible', timeout: 30000 })
    await page.evaluate(({ session, settings }) => {
      localStorage.setItem('moxie.onboarded.v1', '1')
      if (session) localStorage.setItem('moxie.session.v1', JSON.stringify(session))
      if (settings) localStorage.setItem('moxie.settings.v1', JSON.stringify(settings))
    }, { session, settings })
  } finally {
    await closeApp(app)
  }
}

async function readState(page) {
  await page.waitForTimeout(400)
  return page.evaluate(() => ({
    hasWelcome: !!document.querySelector('.welcome-card'),
    tabText: Array.from(document.querySelectorAll('.tab-title')).map((el) => el.textContent || ''),
    activeTabText: document.querySelector('.tab.active .tab-title')?.textContent || '',
    editorVisible: !!document.querySelector(
      '.editor-area:not([style*="display: none"]) .editor-scroll .milkdown, .editor-area:not([style*="display: none"]) .source-editor'
    )
  }))
}

async function closeApp(app) {
  await app.evaluate(async ({ app }) => app.exit(0)).catch(() => {})
}

async function testRestoreOffFileLaunchStartsClean(root) {
  const profile = path.join(root, 'restore-off-profile')
  const sample = path.join(root, 'restore-off-files')
  fs.mkdirSync(profile, { recursive: true })
  fs.mkdirSync(sample, { recursive: true })
  const oldFile = writeMd(sample, 'old-session.md')
  const launchFile = writeMd(sample, 'fresh-launch.md')
  await seedProfile(profile, {
    settings: { restoreTabsOnStartup: false },
    session: {
      lang: 'zh',
      openPaths: [oldFile],
      activePath: oldFile
    }
  })
  const app = await launch(profile, [launchFile])
  try {
    const page = await app.firstWindow()
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.tab-title')).some((el) => el.textContent?.includes('fresh-launch.md')),
      null,
      { timeout: 30000 }
    )
    const state = await readState(page)
    assert.deepEqual(state.tabText, ['fresh-launch.md'], 'restore off: file launch should not revive old tabs')
    assert.equal(state.activeTabText, 'fresh-launch.md', 'restore off: launched file should be active')
    assert.equal(state.hasWelcome, false, 'restore off: explicit file launch should leave home')
  } finally {
    await closeApp(app)
  }
}

async function testRestoreOnDirectLaunchRestoresSession(root) {
  const profile = path.join(root, 'restore-on-profile')
  const sample = path.join(root, 'restore-on-files')
  fs.mkdirSync(profile, { recursive: true })
  fs.mkdirSync(sample, { recursive: true })
  const first = writeMd(sample, 'restore-a.md')
  const second = writeMd(sample, 'restore-b.md')
  await seedProfile(profile, {
    settings: { restoreTabsOnStartup: true },
    session: {
      lang: 'zh',
      openPaths: [first, second],
      activePath: second
    }
  })
  const app = await launch(profile)
  try {
    const page = await app.firstWindow()
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.tab-title')).filter((el) => /restore-[ab]\.md/.test(el.textContent || '')).length === 2,
      null,
      { timeout: 30000 }
    )
    const state = await readState(page)
    assert.deepEqual(state.tabText, ['restore-a.md', 'restore-b.md'], 'restore on: direct launch should restore saved tabs')
    assert.equal(state.activeTabText, 'restore-b.md', 'restore on: direct launch should restore previous active tab')
    assert.equal(state.hasWelcome, false, 'restore on: restored tabs should leave home')
  } finally {
    await closeApp(app)
  }
}

async function testRestoreOnFileLaunchRestoresAndPrioritizesNewFile(root) {
  const profile = path.join(root, 'restore-on-file-profile')
  const sample = path.join(root, 'restore-on-file-files')
  fs.mkdirSync(profile, { recursive: true })
  fs.mkdirSync(sample, { recursive: true })
  const oldFile = writeMd(sample, 'remembered.md')
  const launchFile = writeMd(sample, 'latest-opened.md')
  await seedProfile(profile, {
    settings: { restoreTabsOnStartup: true },
    session: {
      lang: 'zh',
      openPaths: [oldFile],
      activePath: oldFile
    }
  })
  const app = await launch(profile, [launchFile])
  try {
    const page = await app.firstWindow()
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.tab-title')).some((el) => el.textContent?.includes('latest-opened.md')),
      null,
      { timeout: 30000 }
    )
    const state = await readState(page)
    assert.deepEqual(state.tabText, ['remembered.md', 'latest-opened.md'], 'restore on: file launch should keep restored and launched tabs')
    assert.equal(state.activeTabText, 'latest-opened.md', 'restore on: launched file should override restored active tab')
  } finally {
    await closeApp(app)
  }
}

async function testSecondFileOpenUsesSameWindowAndActivatesLatest(root) {
  const profile = path.join(root, 'second-open-profile')
  const sample = path.join(root, 'second-open-files')
  fs.mkdirSync(profile, { recursive: true })
  fs.mkdirSync(sample, { recursive: true })
  const first = writeMd(sample, 'first.md')
  const second = writeMd(sample, 'second.md')
  await seedProfile(profile, { settings: { restoreTabsOnStartup: false } })
  const app = await launch(profile, [first])
  try {
    const page = await app.firstWindow()
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.tab-title')).some((el) => el.textContent?.includes('first.md')),
      null,
      { timeout: 30000 }
    )
    await page.evaluate(() => window.api.windowMinimize())
    cp.spawn(electronExe, [`--user-data-dir=${profile}`, '.', second], { cwd, stdio: 'ignore' })
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.tab-title')).some((el) => el.textContent?.includes('second.md')),
      null,
      { timeout: 30000 }
    )
    const state = await readState(page)
    assert.deepEqual(state.tabText, ['first.md', 'second.md'], 'second open: both files should live in one window')
    assert.equal(state.activeTabText, 'second.md', 'second open: latest opened file should be active')
  } finally {
    await closeApp(app)
  }
}

async function testClosedTabDoesNotReviveWhenRestoreOn(root) {
  const profile = path.join(root, 'closed-tab-profile')
  const sample = path.join(root, 'closed-tab-files')
  fs.mkdirSync(profile, { recursive: true })
  fs.mkdirSync(sample, { recursive: true })
  const first = writeMd(sample, 'close-me.md')
  const second = writeMd(sample, 'keep-me.md')
  await seedProfile(profile, { settings: { restoreTabsOnStartup: true } })
  const app = await launch(profile, [first, second])
  try {
    const page = await app.firstWindow()
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.tab-title')).some((el) => el.textContent?.includes('keep-me.md')),
      null,
      { timeout: 30000 }
    )
    await page.locator('.tab', { hasText: 'close-me.md' }).locator('.tab-close').click()
    await page.waitForFunction(
      () => !Array.from(document.querySelectorAll('.tab-title')).some((el) => el.textContent?.includes('close-me.md')),
      null,
      { timeout: 30000 }
    )
    await page.evaluate(() => window.api.windowClose())
    await app.waitForEvent('close', { timeout: 30000 }).catch(() => closeApp(app))
  } finally {
    await closeApp(app)
  }

  const app2 = await launch(profile)
  try {
    const page = await app2.firstWindow()
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.tab-title')).some((el) => el.textContent?.includes('keep-me.md')),
      null,
      { timeout: 30000 }
    )
    const state = await readState(page)
    assert.deepEqual(state.tabText, ['keep-me.md'], 'restore on: closed tabs should not be persisted again')
    assert.equal(state.activeTabText, 'keep-me.md', 'restore on: remaining tab should be active')
  } finally {
    await closeApp(app2)
  }
}

;(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moxie-startup-restore-'))
  try {
    await testRestoreOffFileLaunchStartsClean(root)
    await testRestoreOnDirectLaunchRestoresSession(root)
    await testRestoreOnFileLaunchRestoresAndPrioritizesNewFile(root)
    await testSecondFileOpenUsesSameWindowAndActivatesLatest(root)
    await testClosedTabDoesNotReviveWhenRestoreOn(root)
    console.log('startup restore tab behavior ok')
  } finally {
    rmSoon(root)
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
