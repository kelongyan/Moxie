const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('C:/Users/Administrator/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright')

const cwd = path.resolve(__dirname, '..')
const outputDir = path.join(cwd, 'output', 'playwright')

function rgbLike(value) {
  return typeof value === 'string' && /^(rgb|rgba|color)\(/.test(value)
}

;(async () => {
  const tempRoot = process.env.TEMP || 'C:/Windows/Temp'
  const profileDir = path.join(tempRoot, `moxie-table-ui-${Date.now()}`)
  const sampleDir = fs.mkdtempSync(path.join(tempRoot, 'moxie-table-sample-'))
  const samplePath = path.join(sampleDir, 'table-ui.md')

  fs.writeFileSync(
    samplePath,
    [
      '# Gmail 邮箱',
      '',
      '| 序号 | 邮箱 | API Key | 备注 |',
      '| --- | --- | --- | --- |',
      '| 1 | `yankelong0720@gmail.com` | `sk-5ebe296e171a4f02d1a20cc42bb210f36f011d160ad0ed82fb98fb3cf3fc66f38` | 主要账号 |',
      '| 2 | `3999146840@qq.com` | `sk-fbfb8ce737d3cfcd9170bf575c0791eb8c5f96aac7b760944c16227578a288f` | 备用账号 |',
      '| 3 | `kelong_yan@qq.com` | `sk-e1c8aa4902bbf50dc8b37d46364bad49601c5a18b9f7f5450998dca9f6d0f031` | 长密钥换行检查 |',
      '',
      '下面是另一张普通表格。',
      '',
      '| 参数 | 当前值 | 说明 |',
      '| --- | --- | --- |',
      '| mode | `dracula` | 主题名称 |',
      '| status | ready | UI 验证样例 |',
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
    await page.setViewportSize({ width: 1366, height: 820 })
    await page.waitForSelector('.milkdown-table-block .table-wrapper table', { state: 'attached', timeout: 30000 })
    fs.mkdirSync(outputDir, { recursive: true })

    async function inspect(mode) {
      await page.evaluate((className) => {
        document.body.className = className
      }, mode === 'dark' ? 'dark theme-dracula' : 'light theme-dracula')

      const visibleIndex = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.milkdown-table-block')).findIndex((el) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
      )
      assert(visibleIndex >= 0, `${mode}: visible table block should exist`)

      const block = page.locator('.milkdown-table-block').nth(visibleIndex)
      await block.scrollIntoViewIfNeeded()
      await block.hover({ force: true })
      await page.waitForTimeout(300)

      const shot = path.join(outputDir, `table-ui-${mode}-dracula.png`)
      await page.screenshot({ path: shot, fullPage: false })

      const metrics = await page.evaluate((index) => {
        const tableBlock = document.querySelectorAll('.milkdown-table-block')[index]
        const wrapper = tableBlock?.querySelector('.table-wrapper')
        const table = wrapper?.querySelector('table.children')
        const th = table?.querySelector('th')
        const firstCode = table?.querySelector('td code')
        const row = table?.querySelector('tbody tr')
        const addButton = tableBlock?.querySelector('.line-handle .add-button')
        const cellHandle = tableBlock?.querySelector('.cell-handle')
        const buttonGroup = tableBlock?.querySelector('.cell-handle .button-group')
        const styleOf = (el) => {
          const s = getComputedStyle(el)
          return {
            background: s.backgroundColor,
            borderTop: s.borderTopColor,
            borderRight: s.borderRightColor,
            borderBottom: s.borderBottomColor,
            borderRadius: s.borderRadius,
            boxShadow: s.boxShadow,
            color: s.color,
            display: s.display,
            fontSize: s.fontSize,
            lineHeight: s.lineHeight,
            overflow: s.overflow,
            padding: s.padding,
            tableLayout: s.tableLayout
          }
        }
        const rowRect = row?.getBoundingClientRect()
        const tableRect = table?.getBoundingClientRect()
        const wrapperRect = wrapper?.getBoundingClientRect()
        const editorRect = tableBlock?.closest('.ProseMirror')?.getBoundingClientRect()
        return {
          tableCount: Array.from(document.querySelectorAll('.milkdown-table-block')).filter((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0 && el.querySelector('table.children')
          }).length,
          wrapper: styleOf(wrapper),
          table: styleOf(table),
          th: styleOf(th),
          code: styleOf(firstCode),
          addButton: styleOf(addButton),
          cellHandle: styleOf(cellHandle),
          buttonGroup: styleOf(buttonGroup),
          rowHeight: rowRect?.height || 0,
          tableWidth: tableRect?.width || 0,
          wrapperWidth: wrapperRect?.width || 0,
          editorWidth: editorRect?.width || 0
        }
      }, visibleIndex)

      assert(metrics.tableCount >= 2, `${mode}: should render both markdown tables`)
      assert.equal(metrics.wrapper.overflow, 'auto', `${mode}: table wrapper should scroll instead of breaking layout`)
      assert.equal(metrics.table.tableLayout, 'fixed', `${mode}: table layout should be fixed for stable columns`)
      assert.equal(metrics.wrapper.borderRadius, '8px', `${mode}: wrapper should keep app radius`)
      assert.equal(metrics.code.display, 'inline', `${mode}: table inline code should not render as bulky pills`)
      assert.equal(metrics.code.fontSize, '13.6px', `${mode}: table inline code should be compact`)
      assert(metrics.rowHeight > 34 && metrics.rowHeight < 110, `${mode}: row height should stay compact but readable`)
      assert(metrics.tableWidth >= 520, `${mode}: table should keep a usable minimum width`)
      assert(metrics.wrapperWidth <= metrics.editorWidth + 1, `${mode}: wrapper should stay inside editor column`)
      assert(metrics.tableWidth <= metrics.wrapperWidth + 1, `${mode}: table should not overflow its wrapper at desktop width`)
      assert(rgbLike(metrics.wrapper.background), `${mode}: wrapper should have a resolved background color`)
      assert(rgbLike(metrics.th.background), `${mode}: table header should have a resolved background color`)
      assert(rgbLike(metrics.addButton.background), `${mode}: add button should be themed`)
      assert(rgbLike(metrics.cellHandle.background), `${mode}: cell handle should be themed`)
      assert.notEqual(metrics.th.background, metrics.wrapper.background, `${mode}: header should separate from body`)

      return { shot, metrics }
    }

    const light = await inspect('light')
    const dark = await inspect('dark')
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
