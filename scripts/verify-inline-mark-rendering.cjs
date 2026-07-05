const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('C:/Users/Administrator/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright')

const cwd = path.resolve(__dirname, '..')
const outputDir = path.join(cwd, 'output', 'playwright')

function weightNumber(value) {
  if (value === 'bold') return 700
  if (value === 'normal') return 400
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

;(async () => {
  const tempRoot = process.env.TEMP || 'C:/Windows/Temp'
  const profileDir = path.join(tempRoot, `moxie-inline-marks-${Date.now()}`)
  const sampleDir = fs.mkdtempSync(path.join(tempRoot, 'moxie-inline-marks-sample-'))
  const samplePath = path.join(sampleDir, 'inline-marks.md')

  fs.writeFileSync(
    samplePath,
    [
      '# Inline marks',
      '',
      '**以“互补”为笔，需在人与自然的和谐共生上谋突破，实现绿色发展。**能否做到人与自然的和谐共生，事关“既要金山银山，也要绿水青山”到“绿水青山就是金山银山”的观念转变。',
      '',
      '*以“互补”为笔，需在人与自然的和谐共生上谋突破，实现绿色发展。*能否做到人与自然的和谐共生。',
      '',
      '~~以“互补”为笔，需在人与自然的和谐共生上谋突破，实现绿色发展。~~能否做到人与自然的和谐共生。',
      '',
      'Plain text for comparison.',
      '',
      '**bold asterisk** and __bold underscore__',
      '',
      '*italic asterisk* and _italic underscore_',
      '',
      '~~strike text~~',
      '',
      '<u>underline text</u> and <ins>insert underline</ins>',
      '',
      '<b>html bold</b> and <i>html italic</i> and <s>html strike</s>',
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
    await page.waitForFunction(() => document.querySelector('.milkdown .ProseMirror')?.textContent?.includes('bold asterisk'), null, {
      timeout: 30000
    })

    fs.mkdirSync(outputDir, { recursive: true })

    async function inspect(mode) {
      await page.evaluate((className) => {
        document.body.className = className
      }, mode === 'dark' ? 'dark theme-dracula' : 'light theme-dracula')
      await page.waitForTimeout(250)

      const shot = path.join(outputDir, `inline-marks-${mode}-dracula.png`)
      await page.screenshot({ path: shot, fullPage: false })

      const data = await page.evaluate(() => {
        const root = document.querySelector('.milkdown .ProseMirror')
        const styleOf = (selector, text) => {
          const candidates = Array.from(root.querySelectorAll(selector))
          const el = candidates.find((node) => (node.textContent || '').includes(text))
          if (!el) return null
          const s = getComputedStyle(el)
          return {
            tag: el.tagName.toLowerCase(),
            text: el.textContent,
            color: s.color,
            fontFamily: s.fontFamily,
            fontStyle: s.fontStyle,
            fontWeight: s.fontWeight,
            textDecorationLine: s.textDecorationLine,
            textDecorationStyle: s.textDecorationStyle,
            textDecorationThickness: s.textDecorationThickness,
            textDecorationColor: s.textDecorationColor
          }
        }
        return {
          html: root.innerHTML,
          plain: styleOf('p', 'Plain text'),
          chineseLeadingBold: styleOf('strong, b', '以“互补”为笔，需在人与自然的和谐共生上谋突破，实现绿色发展。'),
          chineseLeadingItalic: styleOf('em, i', '以“互补”为笔，需在人与自然的和谐共生上谋突破，实现绿色发展。'),
          chineseLeadingStrike: styleOf('del, s, strike', '以“互补”为笔，需在人与自然的和谐共生上谋突破，实现绿色发展。'),
          boldAsterisk: styleOf('strong, b', 'bold asterisk'),
          boldUnderscore: styleOf('strong, b', 'bold underscore'),
          italicAsterisk: styleOf('em, i', 'italic asterisk'),
          italicUnderscore: styleOf('em, i', 'italic underscore'),
          strike: styleOf('del, s, strike', 'strike text'),
          underline: styleOf('u, ins', 'underline text'),
          insertUnderline: styleOf('u, ins', 'insert underline'),
          htmlBold: styleOf('strong, b', 'html bold'),
          htmlItalic: styleOf('em, i', 'html italic'),
          htmlStrike: styleOf('del, s, strike', 'html strike')
        }
      })

      const missing = Object.entries(data)
        .filter(([key, value]) => key !== 'html' && !value)
        .map(([key]) => key)
      assert.deepEqual(missing, [], `${mode}: expected semantic inline mark elements for all samples`)

      const plainWeight = weightNumber(data.plain.fontWeight)
      for (const key of ['chineseLeadingBold', 'boldAsterisk', 'boldUnderscore', 'htmlBold']) {
        const weight = weightNumber(data[key].fontWeight)
        assert(weight >= 700, `${mode}: ${key} should compute to an obvious bold weight, got ${data[key].fontWeight}`)
        assert(weight >= plainWeight + 250, `${mode}: ${key} should be visibly heavier than plain text`)
      }

      for (const key of ['chineseLeadingItalic', 'italicAsterisk', 'italicUnderscore', 'htmlItalic']) {
        assert.equal(data[key].fontStyle, 'italic', `${mode}: ${key} should be italic`)
      }

      for (const key of ['chineseLeadingStrike', 'strike', 'htmlStrike']) {
        assert(
          data[key].textDecorationLine.includes('line-through'),
          `${mode}: ${key} should render line-through, got ${data[key].textDecorationLine}`
        )
      }

      for (const key of ['underline', 'insertUnderline']) {
        assert(
          data[key].textDecorationLine.includes('underline'),
          `${mode}: ${key} should render underline, got ${data[key].textDecorationLine}`
        )
      }

      return { shot, data }
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
