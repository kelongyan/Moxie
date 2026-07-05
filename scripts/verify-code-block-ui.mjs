import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/renderer/src/styles/app.css', 'utf8')
const editor = readFileSync('src/renderer/src/components/Editor.jsx', 'utf8')
const codeBlockPatch = readFileSync('src/renderer/src/components/editor-codeblock-eager.js', 'utf8')
const cmTheme = readFileSync('src/renderer/src/codemirror-theme.js', 'utf8')

const includesBlock = (selector, ...snippets) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))
  assert(match, `Missing CSS block: ${selector}`)
  const body = match[1]
  for (const snippet of snippets) {
    assert(
      body.includes(snippet),
      `${selector} should include: ${snippet}`
    )
  }
}

assert(
  /--font-mono:\s*'JetBrains Mono'[^;]*'Source Han Sans SC'[^;]*'Microsoft YaHei'[^;]*monospace;/.test(css),
  'code font stack should prefer JetBrains Mono and use Source Han Sans SC for CJK fallback'
)

assert(
  /body\.light\s*\{[\s\S]*--code-block-bg:\s*#f8f2e8;[\s\S]*--code-block-border:\s*#e1d6c4;/.test(css),
  'light mode should use a light code block surface'
)
assert(
  /body\.theme-dracula\s*\{[\s\S]*--code-block-bg:\s*#f7f0e3;[\s\S]*--code-block-border:\s*#ded1bf;/.test(css),
  'Dracula light mode should keep code blocks light and warm'
)
assert(
  /body\.dark\s*\{[\s\S]*--code-block-bg:\s*#11100e;/.test(css),
  'dark mode should keep a dark code block surface'
)
assert(
  /body\.dark\.theme-dracula\s*\{[\s\S]*--code-block-bg:\s*#1e1f29;/.test(css),
  'Dracula dark mode should keep a dark code block surface'
)
assert(
  /--code-token-keyword:\s*#[0-9a-f]{6};/i.test(css) &&
    /body\.dark\.theme-dracula\s*\{[\s\S]*--code-token-keyword:\s*#[0-9a-f]{6};/i.test(css),
  'code token colors should be CSS variables with separate light and dark Dracula values'
)
assert(
  /import\s+\{\s*moxieCodeMirrorTheme\s*\}\s+from\s+'..\/codemirror-theme\.js'/.test(editor) &&
    /theme:\s*moxieCodeMirrorTheme/.test(editor),
  'Editor should pass the Moxie CodeMirror theme instead of Crepe oneDark defaults'
)
assert(
  /HighlightStyle\.define/.test(cmTheme) &&
    /color:\s*'var\(--code-token-keyword\)'/.test(cmTheme) &&
    /color:\s*'var\(--code-token-comment\)'/.test(cmTheme),
  'Moxie CodeMirror theme should drive syntax tokens from CSS variables'
)

includesBlock(
  '.milkdown .milkdown-code-block',
  'background: var(--code-block-bg)',
  'border: 1px solid var(--code-block-border)',
  'border-radius: var(--radius-md)',
  'padding: 0 !important',
  'overflow: visible'
)

includesBlock(
  '.milkdown .cm-editor',
  'margin: 0',
  'border: none',
  'overflow: hidden',
  'font-family: var(--font-mono)'
)

includesBlock(
  '.milkdown .cm-editor .cm-scroller',
  'padding: 18px 20px',
  'font-family: var(--font-mono)'
)

includesBlock(
  '.milkdown .milkdown-code-block .tools',
  'position: absolute',
  'width: min(260px, calc(100% - 20px))',
  'opacity: 0',
  'pointer-events: none'
)

includesBlock(
  '.milkdown .milkdown-code-block .tools .hm-code-language-control',
  'position: relative',
  'display: inline-flex',
  'align-items: center'
)

includesBlock(
  '.milkdown .milkdown-code-block .tools .hm-code-language-input',
  'width: 86px',
  'min-height: 25px',
  'border-radius: var(--radius-sm)',
  'font-family: var(--font-ui)',
  'letter-spacing: 0',
  'text-transform: none'
)

assert(
  !css.includes('.milkdown .milkdown-code-block .language-picker') &&
    !css.includes('.milkdown .milkdown-code-block .list-wrapper') &&
    !css.includes('.milkdown .milkdown-code-block .language-list'),
  'code block language dropdown styles should be removed'
)

includesBlock(
  '.milkdown .milkdown-code-block .tools .milkdown-icon',
  'display: inline-grid',
  'place-items: center',
  'width: 13px',
  'height: 13px',
  'border: 0',
  'border-radius: 0',
  'background: transparent',
  'box-shadow: none'
)

assert(
  !css.includes('.expand-icon') && !codeBlockPatch.includes('class="language-picker"'),
  'code block language picker expand icon and dropdown markup should be removed'
)

includesBlock(
  '.milkdown .milkdown-code-block .tools .tools-button-group button:first-child,\n.milkdown .milkdown-code-block .tools .tools-button-group button:last-child',
  'border-radius: var(--radius-sm)'
)

includesBlock(
  '.milkdown .copy-button',
  'border-radius: var(--radius-sm)',
  'font-family: var(--font-ui)'
)

assert(
  /normalizeCodeBlockLanguage/.test(codeBlockPatch) &&
    /js:\s*'javascript'/.test(codeBlockPatch) &&
    /py:\s*'python'/.test(codeBlockPatch) &&
    /mmd:\s*'mermaid'/.test(codeBlockPatch) &&
    /text:\s*'text'/.test(codeBlockPatch),
  'code block language input should normalize common aliases'
)

assert(
  /CodeMirrorBlock\.prototype\.createApp\s*=\s*function moxieCreateCodeBlockApp/.test(codeBlockPatch),
  'CodeMirrorBlock should mount the Moxie code block app with manual language input'
)

console.log('code block UI styles ok')
