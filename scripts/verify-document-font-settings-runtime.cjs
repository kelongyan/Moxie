const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE_PATH,
    path.join(__dirname, '..', 'node_modules', 'playwright')
  ].filter(Boolean)

  const npxRoot = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    for (const entry of fs.readdirSync(npxRoot)) {
      candidates.push(path.join(npxRoot, entry, 'node_modules', 'playwright'))
    }
  }

  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch {}
  }

  throw new Error('Playwright module not found. Install playwright or set PLAYWRIGHT_MODULE_PATH to its module directory.')
}

const { _electron: electron } = loadPlaywright()

const cwd = path.resolve(__dirname, '..')
const outputDir = path.join(cwd, 'output', 'playwright')

async function readTypographyState(page) {
  return page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement)
    const preview = document.querySelector('.settings-font-preview')
    const previewStyle = preview ? getComputedStyle(preview) : null
    const read = (name) => rootStyle.getPropertyValue(name).trim()
    return {
      chineseInput: document.querySelector('[data-testid="settings-font-chinese"]')?.value || '',
      englishInput: document.querySelector('[data-testid="settings-font-english"]')?.value || '',
      chineseVar: read('--editor-font-chinese'),
      englishVar: read('--editor-font-english'),
      writeVar: read('--font-write'),
      fontSize: read('--editor-font-size'),
      lineHeight: read('--editor-line-height'),
      paragraphSpacing: read('--editor-para-spacing'),
      pageWidth: read('--editor-max-width'),
      previewText: preview?.textContent || '',
      previewFontFamily: previewStyle?.fontFamily || '',
      layout: (() => {
        const chineseInput = document.querySelector('[data-testid="settings-font-chinese"]')
        const englishInput = document.querySelector('[data-testid="settings-font-english"]')
        const chinesePresets = Array.from(chineseInput?.closest('.settings-font-field')?.querySelectorAll('.settings-font-presets button') || [])
        const englishPresets = Array.from(englishInput?.closest('.settings-font-field')?.querySelectorAll('.settings-font-presets button') || [])
        const compact = (buttons) => ({
          count: buttons.length,
          tops: [...new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top)))],
          heights: buttons.map((button) => Math.round(button.getBoundingClientRect().height)),
          texts: buttons.map((button) => button.textContent?.trim() || '')
        })
        return {
          inputTopDelta: Math.abs(
            Math.round((chineseInput?.getBoundingClientRect().top || 0) - (englishInput?.getBoundingClientRect().top || 0))
          ),
          inputHeightDelta: Math.abs(
            Math.round((chineseInput?.getBoundingClientRect().height || 0) - (englishInput?.getBoundingClientRect().height || 0))
          ),
          chinesePresets: compact(chinesePresets),
          englishPresets: compact(englishPresets)
        }
      })()
    }
  })
}

;(async () => {
  const tempRoot = process.env.TEMP || 'C:/Windows/Temp'
  const profileDir = path.join(tempRoot, `moxie-font-settings-${Date.now()}`)
  const sampleDir = fs.mkdtempSync(path.join(tempRoot, 'moxie-font-settings-sample-'))
  const samplePath = path.join(sampleDir, 'font-settings.md')
  fs.writeFileSync(samplePath, '# Font Settings\n\n中文排版测试 Moxie Markdown 123\n', 'utf8')

  const app = await electron.launch({
    executablePath: path.join(cwd, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [`--user-data-dir=${profileDir}`, '.', samplePath],
    cwd
  })

  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1280, height: 820 })
    await page.waitForSelector('.milkdown .ProseMirror', { state: 'attached', timeout: 30000 })

    await page.click('button[title="设置"]')
    await page.waitForSelector('#settings-typography', { state: 'visible', timeout: 10000 })
    await page.waitForSelector('[data-testid="settings-font-chinese"]', { state: 'visible', timeout: 5000 })
    await page.waitForSelector('[data-testid="settings-font-english"]', { state: 'visible', timeout: 5000 })

    const initial = await readTypographyState(page)
    assert.equal(initial.chineseInput, 'Source Han Sans SC')
    assert.equal(initial.englishInput, 'Helvetica Neue')
    assert.equal(initial.chineseVar, '"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB"')
    assert.equal(initial.englishVar, '"Helvetica Neue", "Helvetica", "Arial", "Segoe UI"')
    assert.match(initial.previewText, /中文排版测试 Moxie Markdown 123/)
    assert.match(initial.previewFontFamily, /Helvetica Neue|Arial|Segoe UI/)
    assert.equal(initial.layout.inputTopDelta, 0)
    assert.equal(initial.layout.inputHeightDelta, 0)
    assert.equal(initial.layout.chinesePresets.count, 4)
    assert.equal(initial.layout.englishPresets.count, 4)
    assert.deepEqual(initial.layout.englishPresets.texts, ['Helvetica Neue', 'Segoe UI', 'Arial', 'Times New Roman'])
    assert.equal(initial.layout.chinesePresets.tops.length, 1)
    assert.equal(initial.layout.englishPresets.tops.length, 1)
    assert(initial.layout.chinesePresets.heights.every((height) => height <= 21), 'Chinese preset buttons should stay compact')
    assert(initial.layout.englishPresets.heights.every((height) => height <= 21), 'English preset buttons should stay compact')

    await page.fill('[data-testid="settings-font-chinese"]', 'Microsoft YaHei')
    await page.fill('[data-testid="settings-font-english"]', 'Georgia')
    await page.waitForFunction(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--editor-font-english').includes('Georgia')
    )
    const customized = await readTypographyState(page)
    assert.equal(customized.chineseInput, 'Microsoft YaHei')
    assert.equal(customized.englishInput, 'Georgia')
    assert.equal(customized.chineseVar, '"Microsoft YaHei", "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB"')
    assert.equal(customized.englishVar, '"Georgia", "Helvetica Neue", "Helvetica", "Arial", "Segoe UI"')
    assert.equal(
      customized.writeVar,
      '"Georgia", "Helvetica Neue", "Helvetica", "Arial", "Segoe UI", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif'
    )

    await page.click('.settings-default-btn')
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="settings-font-chinese"]')?.value === 'Source Han Sans SC' &&
      document.querySelector('[data-testid="settings-font-english"]')?.value === 'Helvetica Neue'
    )
    const reset = await readTypographyState(page)
    assert.equal(reset.chineseInput, 'Source Han Sans SC')
    assert.equal(reset.englishInput, 'Helvetica Neue')
    assert.equal(reset.fontSize, '16px')
    assert.equal(reset.lineHeight, '1.6')
    assert.equal(reset.paragraphSpacing, '0.4em')
    assert.equal(reset.pageWidth, '1140px')

    fs.mkdirSync(outputDir, { recursive: true })
    const shot = path.join(outputDir, 'document-font-settings-runtime.png')
    await page.screenshot({ path: shot, fullPage: false })
    console.log(JSON.stringify({ initial, customized, reset, shot }, null, 2))
  } finally {
    await app.evaluate(async ({ app }) => app.exit(0)).catch(() => {})
    try { fs.rmSync(profileDir, { recursive: true, force: true }) } catch {}
    try { fs.rmSync(sampleDir, { recursive: true, force: true }) } catch {}
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
