const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('C:/Users/Administrator/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright')

const cwd = path.resolve(__dirname, '..')
const outputDir = path.join(cwd, 'output', 'playwright')

function changedEnough(before, after, delta = 36) {
  return Math.abs(after - before) >= delta
}

;(async () => {
  const tempRoot = process.env.TEMP || 'C:/Windows/Temp'
  const profileDir = path.join(tempRoot, `moxie-table-resize-${Date.now()}`)
  const sampleDir = fs.mkdtempSync(path.join(tempRoot, 'moxie-table-resize-sample-'))
  const samplePath = path.join(sampleDir, 'table-resize.md')

  fs.writeFileSync(
    samplePath,
    [
      '# Table Resize',
      '',
      '| Account | Token | Notes |',
      '| --- | --- | --- |',
      '| primary | `sk-abc1234567890abcdefghijklmnopqrstuvwxyz` | first row |',
      '| backup | `sk-def1234567890abcdefghijklmnopqrstuvwxyz` | second row |',
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
    await page.waitForSelector('.milkdown-table-block .table-wrapper table.children', {
      state: 'attached',
      timeout: 30000
    })
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('.milkdown-table-block .table-wrapper table.children')).some((table) => {
        const rect = table.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
    )
    fs.mkdirSync(outputDir, { recursive: true })

    await page.evaluate(() => {
      document.body.className = 'dark theme-dracula'
    })

    const tableIndex = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.milkdown-table-block .table-wrapper table.children')).findIndex((table) => {
        const rect = table.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
    )
    assert(tableIndex >= 0, 'a visible markdown table should exist')
    await page.evaluate((index) => {
      document.querySelectorAll('.milkdown-table-block .table-wrapper table.children')[index]?.scrollIntoView({
        block: 'center',
        inline: 'nearest'
      })
    }, tableIndex)

    const before = await page.evaluate((index) => {
      const table = document.querySelectorAll('.milkdown-table-block .table-wrapper table.children')[index]
      const firstRow = table?.querySelector('tr')
      const cells = Array.from(firstRow?.children || []).filter((el) => el.matches('th, td'))
      const first = cells[0]
      const second = cells[1]
      const col = table?.querySelector('colgroup col')
      const tableRect = table?.getBoundingClientRect()
      const firstRect = first?.getBoundingClientRect()
      const secondRect = second?.getBoundingClientRect()
      return {
        tableWidth: tableRect?.width || 0,
        firstWidth: firstRect?.width || 0,
        secondWidth: secondRect?.width || 0,
        firstRight: firstRect?.right || 0,
        firstMidY: firstRect ? firstRect.top + firstRect.height / 2 : 0,
        colWidth: col ? parseFloat(getComputedStyle(col).width) || 0 : 0,
        colCount: table?.querySelectorAll('colgroup col').length || 0,
        dataColwidth: first?.getAttribute('data-colwidth') || ''
      }
    }, tableIndex)

    assert(before.firstWidth > 40, 'first column should be visible before dragging')

    await page.mouse.move(before.firstRight - 2, before.firstMidY)
    await page.waitForTimeout(250)

    const hover = await page.evaluate((index) => {
      const table = document.querySelectorAll('.milkdown-table-block .table-wrapper table.children')[index]
      const editor = table?.closest('.ProseMirror')
      const handle = table?.querySelector('.column-resize-handle') || editor?.querySelector('.column-resize-handle')
      const rect = handle?.getBoundingClientRect()
      const style = handle ? getComputedStyle(handle) : null
      return {
        hasHandle: Boolean(handle),
        handleWidth: rect?.width || 0,
        handleHeight: rect?.height || 0,
        handleBackground: style?.backgroundColor || '',
        resizeCursor: editor?.classList.contains('resize-cursor') || false
      }
    }, tableIndex)

    assert.equal(hover.hasHandle, true, 'hovering a column boundary should reveal a resize handle')
    assert(hover.handleWidth >= 5, 'resize handle should use the themed wider hit visual')
    assert(hover.handleHeight > 20, 'resize handle should span the cell height')
    assert(/^(rgb|rgba|color)\(/.test(hover.handleBackground), 'resize handle should have a resolved themed color')
    assert.equal(hover.resizeCursor, true, 'editor should enter resize-cursor state on column boundary hover')

    const dragStartX = before.firstRight - 2
    const dragY = before.firstMidY
    const dragEndX = dragStartX + 96
    await page.mouse.move(dragStartX, dragY)
    await page.mouse.down()
    await page.mouse.move(dragEndX, dragY, { steps: 8 })
    await page.waitForTimeout(80)
    await page.mouse.up()
    await page.waitForTimeout(600)

    const after = await page.evaluate((index) => {
      const table = document.querySelectorAll('.milkdown-table-block .table-wrapper table.children')[index]
      const firstRow = table?.querySelector('tr')
      const cells = Array.from(firstRow?.children || []).filter((el) => el.matches('th, td'))
      const first = cells[0]
      const second = cells[1]
      const col = table?.querySelector('colgroup col')
      const tableRect = table?.getBoundingClientRect()
      const firstRect = first?.getBoundingClientRect()
      const secondRect = second?.getBoundingClientRect()
      return {
        tableWidth: tableRect?.width || 0,
        firstWidth: firstRect?.width || 0,
        secondWidth: secondRect?.width || 0,
        colWidth: col ? parseFloat(getComputedStyle(col).width) || 0 : 0,
        colCount: table?.querySelectorAll('colgroup col').length || 0,
        dataColwidth: first?.getAttribute('data-colwidth') || '',
        allDataColwidth: Array.from(table?.querySelectorAll('[data-colwidth]') || []).map((el) =>
          el.getAttribute('data-colwidth')
        )
      }
    }, tableIndex)

    const shot = path.join(outputDir, 'table-column-resize-dark-dracula.png')
    await page.screenshot({ path: shot, fullPage: false })

    assert(
      changedEnough(before.firstWidth, after.firstWidth) ||
        changedEnough(before.colWidth, after.colWidth) ||
        after.allDataColwidth.some(Boolean),
      'dragging a column boundary should change the rendered column width or write data-colwidth'
    )
    assert(after.firstWidth > before.firstWidth + 30, 'first column should grow after dragging to the right')
    assert(after.colCount >= 3, 'resizable table should keep a colgroup for stable visual widths')

    console.log(JSON.stringify({ before, hover, after, shot }, null, 2))
  } finally {
    await app.evaluate(async ({ app }) => app.exit(0)).catch(() => {})
    try { fs.rmSync(profileDir, { recursive: true, force: true }) } catch {}
    try { fs.rmSync(sampleDir, { recursive: true, force: true }) } catch {}
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
