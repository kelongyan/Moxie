const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('C:/Users/Administrator/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright')

const cwd = path.resolve(__dirname, '..')
const outputDir = path.join(cwd, 'output', 'playwright')

async function waitForFileContent(filePath, expected) {
  const started = Date.now()
  while (Date.now() - started < 6000) {
    const content = fs.readFileSync(filePath, 'utf8')
    if (content.includes(expected)) return content
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${expected} in ${filePath}`)
}

;(async () => {
  const profileDir = path.join(process.env.TEMP || 'C:/Windows/Temp', `moxie-code-language-input-${Date.now()}`)
  const sampleDir = fs.mkdtempSync(path.join(process.env.TEMP || 'C:/Windows/Temp', 'moxie-sample-'))
  const samplePath = path.join(sampleDir, 'code-language-input.md')
  fs.writeFileSync(
    samplePath,
    [
      '# Code language input',
      '',
      '```json',
      '{',
      '  "name": "Moxie",',
      '  "theme": "dracula"',
      '}',
      '```',
      ''
    ].join('\n'),
    'utf8'
  )

  const app = await electron.launch({
    executablePath: path.join(cwd, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [`--user-data-dir=${profileDir}`, '.', samplePath],
    cwd
  })
  let closed = false

  try {
    console.log('launched')
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForSelector('.milkdown-code-block .hm-code-language-input', { state: 'attached', timeout: 30000 })
    console.log('input attached')
    await page.evaluate(() => {
      document.body.className = 'dark theme-dracula'
    })

    const visibleIndex = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.milkdown-code-block')).findIndex((el) => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
    )
    assert(visibleIndex >= 0, 'visible code block not found')

    const block = page.locator('.milkdown-code-block').nth(visibleIndex)
    await block.scrollIntoViewIfNeeded()
    await block.hover({ force: true })
    await page.waitForTimeout(250)
    console.log('block visible')

    const before = await page.evaluate((index) => {
      const blockEl = document.querySelectorAll('.milkdown-code-block')[index]
      const input = blockEl.querySelector('.hm-code-language-input')
      const copy = blockEl.querySelector('.copy-button')
      const styleOf = (el) => {
        const s = getComputedStyle(el)
        return {
          display: s.display,
          width: s.width,
          height: s.height,
          borderRadius: s.borderRadius,
          background: s.backgroundColor,
          color: s.color,
          outline: s.outline,
          textTransform: s.textTransform
        }
      }
      return {
        languagePickerCount: blockEl.querySelectorAll('.language-picker').length,
        languageButtonCount: blockEl.querySelectorAll('.language-button').length,
        expandIconCount: blockEl.querySelectorAll('.expand-icon').length,
        inputValue: input.value,
        inputStyle: styleOf(input),
        copyStyle: styleOf(copy),
        toolsHtml: blockEl.querySelector('.tools')?.outerHTML || ''
      }
    }, visibleIndex)

    assert.equal(before.languagePickerCount, 0, 'language picker dropdown should not exist')
    assert.equal(before.languageButtonCount, 0, 'old language button should not exist')
    assert.equal(before.expandIconCount, 0, 'old expand icon should not exist')
    assert.equal(before.inputValue, 'JSON', 'language input should display JSON in uppercase')
    assert.notEqual(before.inputStyle.textTransform, 'lowercase', 'language input should not visually force JSON to lowercase')
    assert.equal(before.inputStyle.borderRadius, '5px', 'language input should use compact rectangular radius')
    assert.equal(before.copyStyle.borderRadius, '5px', 'copy button should use compact rectangular radius')
    console.log('initial dom checked')

    fs.mkdirSync(outputDir, { recursive: true })
    const hoverShot = path.join(outputDir, 'code-block-language-input-hover.png')
    await page.screenshot({ path: hoverShot, fullPage: false })

    const input = page.locator('.milkdown-code-block .hm-code-language-input').nth(visibleIndex)
    await input.fill('py')
    await input.press('Enter')
    console.log('py entered')
    const pyDomValue = await input.inputValue()
    console.log(`py dom value: ${pyDomValue}`)
    await page.waitForTimeout(600)
    await app.evaluate(async ({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('menu', 'save')
    })
    console.log('save requested after py')
    const pyMarkdown = await waitForFileContent(samplePath, '```python')
    console.log('py file checked')

    const afterPy = await page.evaluate((index) => ({
      inputValue: document.querySelectorAll('.milkdown-code-block')[index]?.querySelector('.hm-code-language-input')?.value,
      languagePickerCount: document.querySelectorAll('.milkdown-code-block')[index]?.querySelectorAll('.language-picker').length
    }), visibleIndex)
    assert.equal(afterPy.inputValue, 'python', 'py should normalize to python in the input')
    assert.equal(afterPy.languagePickerCount, 0, 'language picker should stay absent after editing')
    assert(pyMarkdown.includes('```python'), 'py should normalize to python in markdown')

    await input.fill('js')
    const jsDraftValue = await input.inputValue()
    assert.equal(jsDraftValue, 'js', 'draft language should remain editable until committed')
    await app.evaluate(async ({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('menu', 'save')
    })
    console.log('save requested after js draft')
    const jsMarkdown = await waitForFileContent(samplePath, '```javascript')
    console.log('js draft file checked')
    assert(jsMarkdown.includes('```javascript'), 'focused language draft should commit before saving')

    await input.fill('mmd')
    await input.press('Enter')
    console.log('mmd entered')
    const mmdDomValue = await input.inputValue()
    console.log(`mmd dom value: ${mmdDomValue}`)
    await page.waitForTimeout(600)
    await app.evaluate(async ({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('menu', 'save')
    })
    console.log('save requested after mmd')
    const mmdMarkdown = await waitForFileContent(samplePath, '```mermaid')
    console.log('mmd file checked')
    const afterMmd = await page.evaluate((index) => ({
      inputValue: document.querySelectorAll('.milkdown-code-block')[index]?.querySelector('.hm-code-language-input')?.value,
      previewPanelCount: document.querySelectorAll('.milkdown-code-block .preview-panel').length
    }), visibleIndex)
    assert.equal(afterMmd.inputValue, 'mermaid', 'mmd should normalize to mermaid in the input')
    assert(mmdMarkdown.includes('```mermaid'), 'mmd should normalize to mermaid in markdown')

    const editedShot = path.join(outputDir, 'code-block-language-input-edited.png')
    await page.screenshot({ path: editedShot, fullPage: false })

    console.log(JSON.stringify({ hoverShot, editedShot, before, afterPy, afterMmd }, null, 2))
  } finally {
    if (!closed) {
      await app.evaluate(async ({ app }) => app.exit(0)).catch(() => {})
      closed = true
    }
    try { fs.rmSync(profileDir, { recursive: true, force: true }) } catch {}
    try { fs.rmSync(sampleDir, { recursive: true, force: true }) } catch {}
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
