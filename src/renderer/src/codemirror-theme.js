import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const moxieEditorTheme = EditorView.theme({
  '&': {
    color: 'var(--code-token-text)',
    backgroundColor: 'var(--code-block-bg)'
  },
  '.cm-content': {
    caretColor: 'var(--accent)'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)'
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--accent-soft)'
  },
  '.cm-panels': {
    color: 'var(--text)',
    backgroundColor: 'var(--bg-elevated)'
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--accent-soft)',
    outline: '1px solid var(--accent)'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--accent-glow)'
  },
  '.cm-selectionMatch': {
    backgroundColor: 'var(--accent-soft)'
  },
  '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: 'var(--accent-soft)'
  },
  '.cm-gutters': {
    color: 'var(--faint)',
    backgroundColor: 'transparent',
    border: 'none'
  },
  '.cm-foldPlaceholder': {
    color: 'var(--muted)',
    backgroundColor: 'transparent',
    border: 'none'
  },
  '.cm-tooltip': {
    color: 'var(--text)',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border)'
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    color: 'var(--accent-strong)',
    backgroundColor: 'var(--accent-soft)'
  }
})

const moxieHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--code-token-keyword)' },
  {
    tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName],
    color: 'var(--code-token-name)'
  },
  {
    tag: [tags.function(tags.variableName), tags.labelName],
    color: 'var(--code-token-function)'
  },
  {
    tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
    color: 'var(--code-token-constant)'
  },
  {
    tag: [tags.definition(tags.name), tags.separator],
    color: 'var(--code-token-text)'
  },
  {
    tag: [
      tags.typeName,
      tags.className,
      tags.number,
      tags.changed,
      tags.annotation,
      tags.modifier,
      tags.self,
      tags.namespace
    ],
    color: 'var(--code-token-type)'
  },
  {
    tag: [
      tags.operator,
      tags.operatorKeyword,
      tags.url,
      tags.escape,
      tags.regexp,
      tags.link,
      tags.special(tags.string)
    ],
    color: 'var(--code-token-operator)'
  },
  { tag: [tags.meta, tags.comment], color: 'var(--code-token-comment)' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  {
    tag: tags.link,
    color: 'var(--code-token-comment)',
    textDecoration: 'underline'
  },
  {
    tag: tags.heading,
    fontWeight: 'bold',
    color: 'var(--code-token-name)'
  },
  {
    tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
    color: 'var(--code-token-constant)'
  },
  {
    tag: [tags.processingInstruction, tags.string, tags.inserted],
    color: 'var(--code-token-string)'
  },
  { tag: tags.invalid, color: 'var(--code-token-invalid)' }
])

export const moxieCodeMirrorTheme = [moxieEditorTheme, syntaxHighlighting(moxieHighlightStyle)]
