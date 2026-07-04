// Probe: macOS IME compositionend bypasses the guard's handleTextInput and
// corrupts a substitution marker. Verify the appendTransaction backstop
// (createSubstitutionLiveReconstructPlugin, mirrored here) restores it.
import { Schema } from 'prosemirror-model'
import { EditorState, Plugin, TextSelection } from 'prosemirror-state'
import { inputRules } from 'prosemirror-inputrules'
import { markRule } from '@milkdown/prose'
import { strikeInputWouldCorruptCriticMarkup } from '../src/renderer/src/strikeGuard.js'

const STRIKE_RE = /(?<![\w:\/])(~{1,2})(.+?)\1(?!\w|\/)/
const schema = new Schema({
  nodes: { doc: { content: 'block+' }, paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] }, text: {} },
  marks: { strike: { toDOM: () => ['del', 0], inclusive: true } }
})
const inputRulesPlugin = inputRules({ rules: [markRule(STRIKE_RE, schema.marks.strike)] })

function guardPlugin() {
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        const $f = view.state.doc.resolve(from)
        const tb = $f.parent.textBetween(Math.max(0, $f.parentOffset - 500), $f.parentOffset, null, '￼')
        if (!strikeInputWouldCorruptCriticMarkup(tb, text)) return false
        view.dispatch(view.state.tr.insertText(text, from, to))
        return true
      }
    }
  })
}

// Mirror of createSubstitutionLiveReconstructPlugin (the oldState-restore backstop).
function reconstructPlugin() {
  return new Plugin({
    appendTransaction(transs, oldState, newState) {
      if (!transs.some((tr) => tr.docChanged)) return null
      const touchedStrike = transs.some((t) => t.steps.some((s) => s.mark && s.mark.type && /strike|del/i.test(s.mark.type.name)))
      if (!touchedStrike) return null
      const toRestore = []
      const walk = (nNode, oNode, nStart, oStart) => {
        if (nNode.isTextblock) {
          const nPos = nStart - 1
          if (oNode && oNode.isTextblock) {
            let hasStrike = false
            nNode.forEach((c) => { if (c.marks.some((m) => /strike|del/i.test(m.type.name))) hasStrike = true })
            if (hasStrike) {
              const oldMarkers = oNode.textContent.match(/\{~~[\s\S]*?~~\}/g) || []
              if (oldMarkers.length && !oldMarkers.every((m) => nNode.textContent.includes(m))) {
                toRestore.push({ nPos, oPos: oStart - 1, oldNode: oNode })
              }
            }
          }
          return
        }
        const count = Math.min(nNode.childCount, oNode ? oNode.childCount : 0)
        let nOff = 0, oOff = 0
        for (let i = 0; i < nNode.childCount; i++) {
          const nc = nNode.child(i)
          const oc = i < count && oNode ? oNode.child(i) : null
          if (oc) { walk(nc, oc, nStart + nOff + 1, oStart + oOff + 1); oOff += oc.nodeSize }
          nOff += nc.nodeSize
        }
      }
      walk(newState.doc, oldState.doc, 0, 0)
      if (!toRestore.length) return null
      const tr = newState.tr
      toRestore.sort((a, b) => b.nPos - a.nPos)
      for (const { nPos, oPos, oldNode } of toRestore) {
        const size = newState.doc.nodeAt(nPos).nodeSize
        tr.replaceWith(nPos + 1, nPos + size - 1, oldNode.content)
        const head = oldState.selection.head
        if (head > oPos && head < oPos + oldNode.nodeSize) {
          tr.setSelection(TextSelection.create(tr.doc, nPos + (head - oPos)))
        }
      }
      return tr
    }
  })
}

function makeView(withReconstruct) {
  const plugins = withReconstruct
    ? [guardPlugin(), reconstructPlugin(), inputRulesPlugin]
    : [guardPlugin(), inputRulesPlugin]
  let state = EditorState.create({ schema, plugins, doc: schema.nodes.doc.create(null, schema.nodes.paragraph.create()) })
  return { get composing() { return false }, get state() { return state }, dispatch(tr) { state = state.apply(tr) } }
}
function docText(v) { return v.state.doc.textBetween(0, v.state.doc.content.size, '\n') }
function hasStrike(v) { let f = false; v.state.doc.descendants((n) => { if (n.marks && n.marks.some((m) => m.type.name === 'strike')) f = true; return !f }); return f }

let pass = 0, fail = 0
function check(name, ok, detail) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); ok ? pass++ : fail++ }

// Mac IME: literal marker, cursor mid-marker, then compositionend.
{
  const v = makeView(true)
  v.dispatch(v.state.tr.insertText('{~~旧~>新~~}', 1))
  const cursorPos = 1 + '{~~旧~>新'.length
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, cursorPos)))
  const ir = v.state.plugins.find((p) => p.spec.props && p.spec.props.handleDOMEvents && p.spec.props.handleDOMEvents.compositionend)
  ir.spec.props.handleDOMEvents.compositionend(v)
  await new Promise((r) => setTimeout(r, 20))
  const txt = docText(v)
  check('compositionend + reconstruct: marker restored, no strike', txt === '{~~旧~>新~~}' && !hasStrike(v), `doc=${JSON.stringify(txt)} strike=${hasStrike(v)}`)
}

// Regression: a legit toolbar strike on PLAIN text (no marker) must survive.
{
  const v = makeView(true)
  v.dispatch(v.state.tr.insertText('plain', 1))
  v.dispatch(v.state.tr.addMark(1, 6, schema.marks.strike.create())) // simulate Mod-Alt-X
  const txt = docText(v)
  check('REG legit strike on plain text survives reconstruct', txt === 'plain' && hasStrike(v), `doc=${JSON.stringify(txt)} strike=${hasStrike(v)}`)
}

// Regression: a legit strike ADJACENT to an intact marker must survive (no false revert).
{
  const v = makeView(true)
  v.dispatch(v.state.tr.insertText('{~~旧~>新~~} word', 1))
  // strike "word" (positions 9..13 within the paragraph content)
  const base = 1
  v.dispatch(v.state.tr.addMark(base + 9, base + 13, schema.marks.strike.create()))
  const txt = docText(v)
  check('REG strike adjacent to intact marker not reverted', /{~~旧~>新~~}/.test(txt) && hasStrike(v), `doc=${JSON.stringify(txt)} strike=${hasStrike(v)}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
