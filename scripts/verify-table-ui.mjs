import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/renderer/src/styles/app.css', 'utf8')
const editor = readFileSync('src/renderer/src/components/Editor.jsx', 'utf8')

function block(selector) {
  const start = css.indexOf(`${selector} {`)
  assert(start >= 0, `Missing CSS block: ${selector}`)
  const end = css.indexOf('\n}', start)
  assert(end > start, `CSS block should close: ${selector}`)
  return css.slice(start, end)
}

function includesBlock(selector, ...snippets) {
  const cssBlock = block(selector)
  for (const snippet of snippets) {
    assert(cssBlock.includes(snippet), `${selector} should include: ${snippet}`)
  }
}

includesBlock(
  '.milkdown .milkdown-table-block',
  'position: relative',
  'margin: 1.25em 0',
  'border-radius: var(--radius-md)'
)

includesBlock(
  '.milkdown .milkdown-table-block .table-wrapper',
  'overflow: auto',
  'border: 1px solid var(--table-border)',
  'border-radius: var(--radius-md)',
  'background: var(--table-bg)'
)

includesBlock(
  '.milkdown .ProseMirror table',
  'border-collapse: separate',
  'border-spacing: 0',
  'table-layout: fixed',
  'margin: 0'
)

includesBlock(
  '.milkdown .ProseMirror th,\n.milkdown .ProseMirror td',
  'border-right: 1px solid var(--table-grid)',
  'border-bottom: 1px solid var(--table-grid)',
  'padding: 8px 12px',
  'overflow-wrap: anywhere'
)

includesBlock(
  '.milkdown .milkdown-table-block td code:not(pre code)',
  'display: inline',
  'padding: 1px 4px',
  'font-size: 0.85em',
  'overflow-wrap: anywhere',
  'word-break: break-word'
)

includesBlock(
  '.milkdown .milkdown-table-block .cell-handle',
  'background: var(--table-control-bg)',
  'border: 1px solid var(--table-control-border)',
  'box-shadow: var(--shadow-sm)'
)

includesBlock(
  '.milkdown .milkdown-table-block .line-handle',
  'background: var(--table-handle-line)'
)

includesBlock(
  '.milkdown .milkdown-table-block .line-handle .add-button',
  'background: var(--table-control-bg)',
  'color: var(--accent-strong)',
  'border: 1px solid var(--table-control-border)'
)

includesBlock(
  '.milkdown .milkdown-table-block .cell-handle .button-group',
  'background: var(--table-menu-bg)',
  'border: 1px solid var(--table-control-border)',
  'box-shadow: var(--shadow-float)'
)

includesBlock(
  '.milkdown .milkdown-table-block .selectedCell::after',
  'background: var(--table-selection)',
  'opacity: 1'
)

includesBlock(
  '.milkdown .milkdown-table-block .drag-preview table',
  'min-width: 0',
  'width: 100%',
  'margin: 0'
)

assert(
  /import\s+\{[^}]*\bcolumnResizingPlugin\b[^}]*\}\s+from\s+['"]@milkdown\/kit\/preset\/gfm['"]/.test(editor),
  'Editor should import columnResizingPlugin from @milkdown/kit/preset/gfm'
)

assert(
  /import\s+\{[^}]*\bTableNodeView\b[^}]*\}\s+from\s+['"]@milkdown\/kit\/component\/table-block['"]/.test(editor),
  'Editor should import TableNodeView so the Crepe table view can be adapted for column resizing'
)

assert(
  /import\s+\{[^}]*\bupdateColumnsOnResize\b[^}]*\}\s+from\s+['"]@milkdown\/kit\/prose\/tables['"]/.test(editor),
  'Editor should import updateColumnsOnResize to sync table colgroups'
)

assert(
  editor.includes('class MoxieTableNodeView extends TableNodeView'),
  'Editor should adapt Crepe table node view instead of replacing table UI'
)

assert(
  editor.includes('isTableColumnResizeGesture(event, this.view)') &&
    editor.includes("return false") &&
    editor.includes('updateColumnsOnResize(node, colgroup, table, TABLE_DEFAULT_CELL_MIN_WIDTH)'),
  'Moxie table view should let resize gestures through and keep colgroup widths in sync'
)

assert(
  /crepe\.editor\.use\(\s*columnResizingPlugin\s*\)/.test(editor),
  'Editor should register columnResizingPlugin before create()'
)

assert(
  /crepe\.editor\.use\(\s*moxieTableBlockView\s*\)/.test(editor),
  'Editor should register the Moxie table node view adapter'
)

assert(
  editor.indexOf('crepe.editor.use(columnResizingPlugin)') > 0 &&
    editor.indexOf('crepe.editor.use(columnResizingPlugin)') < editor.indexOf('.create()'),
  'columnResizingPlugin should be registered before crepe.create()'
)

assert(
  editor.indexOf('crepe.editor.use(moxieTableBlockView)') > editor.indexOf('crepe.editor.use(columnResizingPlugin)') &&
    editor.indexOf('crepe.editor.use(moxieTableBlockView)') < editor.indexOf('.create()'),
  'Moxie table node view adapter should be registered after columnResizingPlugin and before create()'
)

includesBlock(
  '.milkdown .ProseMirror .column-resize-handle',
  'right: -3px',
  'width: 6px',
  'background: var(--table-resize-handle)'
)

includesBlock(
  '.milkdown .ProseMirror.resize-cursor',
  'cursor: col-resize'
)

includesBlock(
  'body.theme-dracula',
  '--table-bg: #fffaf1',
  '--table-head-bg: #f2eadb',
  '--table-row-alt: rgba(100, 74, 201, 0.035)',
  '--table-control-bg: #fffaf1',
  '--table-resize-handle: rgba(100, 74, 201, 0.72)'
)

includesBlock(
  'body.dark.theme-dracula',
  '--table-bg: #242633',
  '--table-head-bg: #2c2e3b',
  '--table-row-alt: rgba(189, 147, 249, 0.055)',
  '--table-control-bg: #2c2e3b',
  '--table-resize-handle: rgba(189, 147, 249, 0.82)'
)

console.log('table UI styles ok')
