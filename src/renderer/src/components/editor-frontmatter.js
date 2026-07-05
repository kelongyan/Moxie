// YAML front matter support (the `---` block at the top of a document, as in
// SKILL.md / Hugo / Jekyll). Milkdown doesn't recognize it by default, so it
// rendered as a horizontal rule + Setext headings. With `remark-frontmatter` the
// block parses to a `yaml` mdast node; this module adds a Milkdown block node for
// it that renders a structured key/value card (flat `key: value` → a definition
// grid; anything nested → a code box), and round-trips back to `---\n…\n---`.
import { $nodeSchema } from '@milkdown/utils'

export const frontmatterSchema = $nodeSchema('frontmatter', () => ({
  group: 'block',
  atom: true,
  isolating: true,
  defining: true,
  attrs: {
    value: { default: '' }
  },
  parseDOM: [
    {
      tag: 'div[data-type="frontmatter"]',
      getAttrs: (dom) => ({ value: dom.dataset.value || '' })
    }
  ],
  toDOM: (node) => {
    const card = buildCard(node.attrs.value || '')
    return ['div', { 'data-type': 'frontmatter', 'data-value': node.attrs.value || '' }, card]
  },
  parseMarkdown: {
    match: (node) => node.type === 'yaml',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value || '' })
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'frontmatter',
    runner: (state, node) => {
      // remark-frontmatter serializes a `yaml` node back to a `---` block.
      state.addNode('yaml', undefined, node.attrs.value || '')
    }
  }
}))

// Build the visible card. Flat `key: value` lines → a definition grid; if there's
// any complex YAML (lists, nesting, multiline), fall back to a code box so we
// never misrender.
function buildCard(value) {
  const card = document.createElement('div')
  card.className = 'hm-frontmatter'

  const lines = (value || '').split('\n')
  // "simple" = every non-blank line is a flat `key: value` (no indentation,
  // list markers, quotes-only, etc.).
  const simple = lines.every(
    (l) => l.trim() === '' || /^[A-Za-z0-9_.-]+:\s?.*$/.test(l)
  )
  const entries = simple ? parseFlatEntries(lines) : []
  const topLevelKeys = simple ? entries.map(([key]) => key) : parseTopLevelKeys(lines)
  const bodyId = `hm-frontmatter-${Math.random().toString(36).slice(2)}`

  card.classList.add('is-collapsed')
  if (!simple) card.classList.add('is-complex')

  const summary = document.createElement('div')
  summary.className = 'hm-frontmatter-summary'
  summary.setAttribute('role', 'button')
  summary.setAttribute('tabindex', '0')
  summary.setAttribute('aria-expanded', 'false')
  summary.setAttribute('aria-controls', bodyId)

  const titleGroup = document.createElement('div')
  titleGroup.className = 'hm-frontmatter-title-group'

  const title = document.createElement('span')
  title.className = 'hm-frontmatter-title'
  title.textContent = '文档元信息'
  titleGroup.appendChild(title)

  const chip = document.createElement('span')
  chip.className = 'hm-frontmatter-chip'
  chip.textContent = 'YAML'
  titleGroup.appendChild(chip)

  const count = document.createElement('span')
  count.className = 'hm-frontmatter-count'
  count.textContent = simple ? `${entries.length} 项` : '复杂'
  titleGroup.appendChild(count)

  summary.appendChild(titleGroup)

  const preview = document.createElement('span')
  preview.className = 'hm-frontmatter-preview'
  preview.textContent = topLevelKeys.length ? topLevelKeys.join(' · ') : 'empty'
  summary.appendChild(preview)

  const toggle = document.createElement('span')
  toggle.className = 'hm-frontmatter-toggle'
  toggle.textContent = '展开'
  summary.appendChild(toggle)
  card.appendChild(summary)

  const body = document.createElement('div')
  body.id = bodyId
  body.className = 'hm-frontmatter-body'
  body.hidden = true

  if (simple) {
    const grid = document.createElement('div')
    grid.className = 'hm-frontmatter-grid'
    for (const [key, value] of entries) {
      const field = document.createElement('div')
      field.className = 'hm-frontmatter-field'
      const keyNode = document.createElement('div')
      keyNode.className = 'hm-frontmatter-key'
      keyNode.textContent = key
      const valueNode = document.createElement('div')
      valueNode.className = 'hm-frontmatter-value'
      valueNode.textContent = value
      field.appendChild(keyNode)
      field.appendChild(valueNode)
      grid.appendChild(field)
    }
    if (grid.children.length) body.appendChild(grid)
    else body.appendChild(rawBlock(value))
  } else {
    body.appendChild(rawBlock(value))
  }
  card.appendChild(body)

  const setExpanded = (expanded) => {
    card.classList.toggle('is-collapsed', !expanded)
    body.hidden = !expanded
    summary.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    toggle.textContent = expanded ? '收起' : '展开'
  }

  summary.addEventListener('click', () => setExpanded(body.hidden))
  summary.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setExpanded(body.hidden)
  })

  return card
}

function parseFlatEntries(lines) {
  return lines
    .map((line) => line.match(/^([A-Za-z0-9_.-]+):\s?(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]])
}

function parseTopLevelKeys(lines) {
  return lines
    .map((line) => line.match(/^([A-Za-z0-9_.-]+):(?:\s?.*)?$/))
    .filter(Boolean)
    .map((match) => match[1])
}

const rawBlock = (value) => {
  const pre = document.createElement('pre')
  pre.className = 'hm-frontmatter-raw'
  pre.textContent = value || ''
  return pre
}

// Node view: render the card, display-only (contentEditable false). Registered
// through nodeViewCtx (the same channel Milkdown's $view uses) so it composes
// with the other component node views.
export function renderFrontmatterNodeView(node) {
  const dom = document.createElement('div')
  dom.className = 'hm-frontmatter-wrap'
  dom.setAttribute('data-type', 'frontmatter')
  dom.setAttribute('data-value', node.attrs.value || '')
  dom.contentEditable = 'false'
  dom.appendChild(buildCard(node.attrs.value || ''))
  return { dom, ignoreMutation: () => true, stopEvent: () => false }
}

// remark-frontmatter only recognizes a `---` block at the very START of the
// document. Anywhere else, commonmark turns `---\nkey: value\n---` into a
// thematicBreak + a Setext heading. This plugin reconstructs that mangled pair
// back into a `yaml` node, so front matter renders (and round-trips) no matter
// where it sits — which is what users expect when they paste one mid-document.
const headingText = (node) =>
  (node.children || []).map((c) => c.value || '').join('\n').trim()
const looksLikeYaml = (text) => !!text && /^[\w.-]+:\s?.*$/m.test(text)

export function remarkFrontmatterAnywhere() {
  return (tree) => {
    if (!Array.isArray(tree.children)) return
    const out = []
    for (let i = 0; i < tree.children.length; i++) {
      const node = tree.children[i]
      const next = tree.children[i + 1]
      if (
        node.type === 'thematicBreak' &&
        next &&
        next.type === 'heading' &&
        looksLikeYaml(headingText(next))
      ) {
        out.push({ type: 'yaml', value: headingText(next) })
        i++ // consume the heading too
      } else {
        out.push(node)
      }
    }
    tree.children = out
  }
}
