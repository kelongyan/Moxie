const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('C:/Users/Administrator/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright')

const cwd = path.resolve(__dirname, '..')
const outputDir = path.join(cwd, 'output', 'playwright')

async function inspect(page, mode) {
  await page.evaluate((className) => {
    document.body.className = className
  }, mode === 'dark' ? 'dark theme-catppuccin' : 'light theme-catppuccin')
  await page.waitForTimeout(300)

  fs.mkdirSync(outputDir, { recursive: true })
  const shot = path.join(outputDir, `catppuccin-${mode}-runtime.png`)
  await page.screenshot({ path: shot, fullPage: false })

  const data = await page.evaluate(() => {
    const readVar = (name) => getComputedStyle(document.body).getPropertyValue(name).trim()
    const editor = document.querySelector('.milkdown .ProseMirror')
    const codeBlock = document.querySelector('.milkdown-code-block')
    const table = document.querySelector('.milkdown-table-block .table-wrapper table.children')
    const frontmatter = document.querySelector('.hm-frontmatter')
    const codeStyle = codeBlock ? getComputedStyle(codeBlock) : null
    const tableStyle = table ? getComputedStyle(table) : null
    const frontmatterStyle = frontmatter ? getComputedStyle(frontmatter) : null
    return {
      bodyClass: document.body.className,
      bg: readVar('--bg'),
      editorBg: readVar('--bg-editor'),
      text: readVar('--text'),
      muted: readVar('--muted'),
      faint: readVar('--faint'),
      accent: readVar('--accent'),
      codeBlockBg: readVar('--code-block-bg'),
      codeBlockBorder: readVar('--code-block-border'),
      codeTokenText: readVar('--code-token-text'),
      tableHeadBg: readVar('--table-head-bg'),
      tableGrid: readVar('--table-grid'),
      tableBg: readVar('--table-bg'),
      tableBorder: readVar('--table-border'),
      tableRowAlt: readVar('--table-row-alt'),
      hasEditor: Boolean(editor),
      hasCodeBlock: Boolean(codeBlock),
      hasTable: Boolean(table),
      hasFrontmatter: Boolean(frontmatter),
      codeBlockBackground: codeStyle?.backgroundColor || '',
      tableBackground: tableStyle?.backgroundColor || '',
      frontmatterBorderRadius: frontmatterStyle?.borderRadius || '',
      frontmatterTitle: frontmatter?.querySelector('.hm-frontmatter-title')?.textContent || '',
      frontmatterCount: frontmatter?.querySelector('.hm-frontmatter-count')?.textContent || '',
      themeButtonText: document.querySelector('button[title="主题"]')?.textContent || ''
    }
  })

  return { shot, data }
}

;(async () => {
  const tempRoot = process.env.TEMP || 'C:/Windows/Temp'
  const profileDir = path.join(tempRoot, `moxie-catppuccin-${Date.now()}`)
  const sampleDir = fs.mkdtempSync(path.join(tempRoot, 'moxie-catppuccin-sample-'))
  const samplePath = path.join(sampleDir, 'catppuccin-theme.md')
  fs.writeFileSync(
    samplePath,
    [
      '---',
      'title: Catppuccin Runtime',
      'theme: catppuccin',
      'flavor: latte-mocha',
      '---',
      '',
      '# Catppuccin Runtime',
      '',
      '**中文开头加粗**，普通正文，`inline code`。',
      '',
      '```json',
      '{',
      '  "theme": "catppuccin",',
      '  "mode": "latte-mocha"',
      '}',
      '```',
      '',
      '| Token | Value |',
      '| --- | --- |',
      '| accent | mauve |',
      '| string | green |',
      ''
    ].join('\n'),
    'utf8'
  )

  const app = await electron.launch({
    executablePath: path.join(cwd, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [`--user-data-dir=${profileDir}`, '.', samplePath],
    cwd
  })

  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.waitForSelector('.milkdown .ProseMirror', { state: 'attached', timeout: 30000 })
    await page.waitForSelector('.hm-frontmatter', { state: 'attached', timeout: 30000 })
    await page.waitForSelector('.milkdown-code-block', { state: 'attached', timeout: 30000 })
    await page.waitForSelector('.milkdown-table-block .table-wrapper table.children', { state: 'attached', timeout: 30000 })

    await page.click('button[title="主题"]')
    await page.waitForSelector('.theme-menu', { state: 'visible', timeout: 5000 })
    await page.click('.theme-menu .block-menu-item:has-text("卡布奇诺")')
    await page.waitForFunction(() => document.body.classList.contains('theme-catppuccin'))

    const light = await inspect(page, 'light')
    assert.equal(light.data.bodyClass, 'light theme-catppuccin')
    assert.equal(light.data.bg, '#eff1f5')
    assert.equal(light.data.editorBg, '#f5f6fb')
    assert.equal(light.data.text, '#3c405a')
    assert.equal(light.data.muted, '#5f6379')
    assert.equal(light.data.faint, '#7d8194')
    assert.equal(light.data.accent, '#8839ef')
    assert.equal(light.data.codeBlockBg, '#eeeaf8')
    assert.equal(light.data.codeBlockBorder, '#cfc7e2')
    assert.equal(light.data.codeTokenText, '#3c405a')
    assert.equal(light.data.tableBg, '#f5f6fb')
    assert.equal(light.data.tableHeadBg, '#e9ecf5')
    assert.equal(light.data.tableGrid, '#d6dbea')
    assert.equal(light.data.tableBorder, '#c5cbd8')
    assert.equal(light.data.tableRowAlt, 'rgba(136, 57, 239, 0.04)')
    assert.equal(light.data.hasCodeBlock, true)
    assert.equal(light.data.hasTable, true)
    assert.equal(light.data.hasFrontmatter, true)
    assert.equal(light.data.frontmatterTitle, '文档元信息')
    assert.equal(light.data.frontmatterCount, '3 项')
    assert.match(light.data.themeButtonText, /浅色 · 卡布奇诺/)

    const dark = await inspect(page, 'dark')
    assert.equal(dark.data.bodyClass, 'dark theme-catppuccin')
    assert.equal(dark.data.bg, '#1e1e2e')
    assert.equal(dark.data.editorBg, '#1e1e2e')
    assert.equal(dark.data.text, '#cdd6f4')
    assert.equal(dark.data.accent, '#cba6f7')
    assert.equal(dark.data.codeBlockBg, '#11111b')
    assert.equal(dark.data.tableBg, '#242437')
    assert.match(dark.data.codeBlockBackground, /rgb\(17,\s*17,\s*27\)|color\(srgb 0\.0666667 0\.0666667 0\.105882\)/)
    assert.match(dark.data.themeButtonText, /浅色 · 卡布奇诺/)

    console.log(JSON.stringify({ light, dark }, null, 2))
  } finally {
    await app.evaluate(async ({ app }) => app.exit(0)).catch(() => {})
    try { fs.rmSync(profileDir, { recursive: true, force: true }) } catch {}
    try { fs.rmSync(sampleDir, { recursive: true, force: true }) } catch {}
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
