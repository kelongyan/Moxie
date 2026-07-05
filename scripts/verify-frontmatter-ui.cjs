const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('C:/Users/Administrator/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright')

const cwd = path.resolve(__dirname, '..')
const outputDir = path.join(cwd, 'output', 'playwright')

async function launchWithMarkdown(markdown, basename) {
  const tempRoot = process.env.TEMP || 'C:/Windows/Temp'
  const profileDir = path.join(tempRoot, `moxie-frontmatter-${basename}-${Date.now()}`)
  const sampleDir = fs.mkdtempSync(path.join(tempRoot, `moxie-frontmatter-${basename}-`))
  const samplePath = path.join(sampleDir, `${basename}.md`)
  fs.writeFileSync(samplePath, markdown, 'utf8')

  const app = await electron.launch({
    executablePath: path.join(cwd, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [`--user-data-dir=${profileDir}`, '.', samplePath],
    cwd
  })

  return { app, profileDir, sampleDir }
}

async function inspect(mode, page, basename) {
  await page.evaluate((className) => {
    document.body.className = className
  }, mode === 'dark' ? 'dark theme-dracula' : 'light theme-dracula')
  await page.waitForTimeout(250)

  fs.mkdirSync(outputDir, { recursive: true })
  const shot = path.join(outputDir, `frontmatter-${basename}-${mode}-dracula.png`)
  await page.screenshot({ path: shot, fullPage: false })

  return page.evaluate(() => {
    const root = document.querySelector('.milkdown .ProseMirror')
    const card = root?.querySelector('.hm-frontmatter')
    const body = card?.querySelector('.hm-frontmatter-body')
    const header = card?.querySelector('.hm-frontmatter-summary')
    const toggle = card?.querySelector('.hm-frontmatter-toggle')
    const chip = card?.querySelector('.hm-frontmatter-chip')
    const fields = Array.from(card?.querySelectorAll('.hm-frontmatter-field') || []).map((field) => ({
      key: field.querySelector('.hm-frontmatter-key')?.textContent || '',
      value: field.querySelector('.hm-frontmatter-value')?.textContent || ''
    }))
    const style = card ? getComputedStyle(card) : null
    const bodyStyle = body ? getComputedStyle(body) : null
    return {
      hasCard: !!card,
      tag: card?.tagName.toLowerCase() || '',
      collapsed: card?.classList.contains('is-collapsed') || false,
      complex: card?.classList.contains('is-complex') || false,
      headerRole: header?.getAttribute('role') || '',
      headerTabIndex: header?.getAttribute('tabindex') || '',
      title: card?.querySelector('.hm-frontmatter-title')?.textContent || '',
      chip: chip?.textContent || '',
      count: card?.querySelector('.hm-frontmatter-count')?.textContent || '',
      preview: card?.querySelector('.hm-frontmatter-preview')?.textContent || '',
      toggleText: toggle?.textContent || '',
      bodyHidden: body?.hidden ?? null,
      fields,
      rawText: card?.querySelector('.hm-frontmatter-raw')?.textContent || '',
      borderRadius: style?.borderRadius || '',
      background: style?.backgroundColor || '',
      borderColor: style?.borderColor || '',
      bodyDisplay: bodyStyle?.display || ''
    }
  })
}

async function runCase({ basename, markdown, assertData }) {
  const { app, profileDir, sampleDir } = await launchWithMarkdown(markdown, basename)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.waitForSelector('.milkdown .ProseMirror', { state: 'attached', timeout: 30000 })
    await page.waitForSelector('.hm-frontmatter', { state: 'attached', timeout: 30000 })

    const initialLight = await inspect('light', page, basename)
    assertData(initialLight, 'light initial')

    await page.click('.hm-frontmatter-summary')
    await page.waitForFunction(() => !document.querySelector('.hm-frontmatter-body')?.hidden)
    const expandedLight = await inspect('light-expanded', page, basename)
    assert.equal(expandedLight.collapsed, false, `${basename}: click should expand the frontmatter card`)
    assert.equal(expandedLight.bodyHidden, false, `${basename}: expanded body should be visible`)

    await page.focus('.hm-frontmatter-summary')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('.hm-frontmatter-body')?.hidden)
    const collapsedAgain = await inspect('light-collapsed-keyboard', page, basename)
    assert.equal(collapsedAgain.collapsed, true, `${basename}: keyboard toggle should collapse the card`)

    const dark = await inspect('dark', page, basename)
    assertData(dark, 'dark')
    return { initialLight, expandedLight, collapsedAgain, dark }
  } finally {
    await app.evaluate(async ({ app }) => app.exit(0)).catch(() => {})
    try { fs.rmSync(profileDir, { recursive: true, force: true }) } catch {}
    try { fs.rmSync(sampleDir, { recursive: true, force: true }) } catch {}
  }
}

;(async () => {
  const simple = await runCase({
    basename: 'simple',
    markdown: [
      '---',
      'title: Moxie 软件介绍与语法渲染测试',
      'app: Moxie Markdown Editor',
      'version: 1.3.0',
      'purpose: 用于测试 Markdown、GFM、代码块、表格、公式、图表与主题渲染效果',
      'created: 2026-07-05',
      '---',
      '',
      '# Frontmatter UI'
    ].join('\n'),
    assertData(data, label) {
      assert.equal(data.hasCard, true, `simple ${label}: should render frontmatter card`)
      assert.equal(data.collapsed, true, `simple ${label}: should be collapsed by default`)
      assert.equal(data.complex, false, `simple ${label}: flat YAML should not use complex mode`)
      assert.equal(data.headerRole, 'button', `simple ${label}: header should be button-like`)
      assert.equal(data.headerTabIndex, '0', `simple ${label}: header should be keyboard focusable`)
      assert.equal(data.title, '文档元信息', `simple ${label}: should show localized metadata title`)
      assert.equal(data.chip, 'YAML', `simple ${label}: should show YAML chip`)
      assert.equal(data.count, '5 项', `simple ${label}: should show field count`)
      assert.match(data.preview, /title · app · version · purpose · created/, `simple ${label}: should preview field names`)
      assert.equal(data.toggleText, '展开', `simple ${label}: collapsed toggle should say 展开`)
      assert.equal(data.bodyHidden, true, `simple ${label}: body should be hidden by default`)
      assert.deepEqual(data.fields.map((field) => field.key), ['title', 'app', 'version', 'purpose', 'created'])
    }
  })

  const complex = await runCase({
    basename: 'complex',
    markdown: [
      '---',
      'title: Complex YAML',
      'tags:',
      '  - markdown',
      '  - editor',
      'author:',
      '  name: Moxie',
      '---',
      '',
      '# Complex Frontmatter UI'
    ].join('\n'),
    assertData(data, label) {
      assert.equal(data.hasCard, true, `complex ${label}: should render frontmatter card`)
      assert.equal(data.collapsed, true, `complex ${label}: should be collapsed by default`)
      assert.equal(data.complex, true, `complex ${label}: nested YAML should use complex mode`)
      assert.equal(data.chip, 'YAML', `complex ${label}: should show YAML chip`)
      assert.equal(data.count, '复杂', `complex ${label}: should label complex YAML`)
      assert.match(data.preview, /title · tags · author/, `complex ${label}: should preview top-level keys`)
      assert.match(data.rawText, /tags:\n  - markdown/, `complex ${label}: should preserve raw YAML text`)
    }
  })

  console.log(JSON.stringify({ simple, complex }, null, 2))
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
