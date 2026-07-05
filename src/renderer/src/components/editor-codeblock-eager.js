// Root-fix for issue #25 (code-block "page jump" on scroll/selection).
//
// Milkdown's code-block node view (CodeMirrorBlock in @milkdown/components/
// code-block) LAZY-MOUNTS its CodeMirror editor via a shared IntersectionObserver
// (rootMargin 200px): a plain <pre> placeholder while off-screen, the real
// CodeMirror EditorView only when the block scrolls into view, and a TEAR-DOWN
// after 5s off-screen. The placeholder↔mounted HEIGHT DELTA (measured ~127px on
// a 5-line block) is what scroll-anchoring can't absorb once the editor has a
// selection — Chromium disables overflow-anchor while a contenteditable has a
// selection (to protect it), so the delta surfaces as "scroll to a code block,
// stop, select → the page jumps". overflow-anchor:auto (base .editor-scroll)
// fixed the pure-scroll-stop case but NOT the selection case.
//
// ROOT FIX: make CodeMirrorBlock mount EAGERLY (no placeholder) and NEVER tear
// down, so every code block's height is stable at all times → no delta for
// anchoring (or the selection/anchor interaction) to mishandle → no jump, pure
// scroll OR selection.
//
// WHY A PROTOTYPE MODIFICATION (not a nodeView override): the clean path is
// architecturally blocked in this Milkdown version — `nodeViewCtx` can ADD new
// node views (html/frontmatter) but cannot OVERRIDE an existing component view
// (`code_block` is registered via `$view` and wins; verified empirically). And
// `editorViewOptionsCtx.nodeViews` is spread LAST into EditorView, so setting it
// would overwrite EVERY component node view (image-block, tables, lists) — not
// viable. CodeMirrorBlock IS exported, so we modify its prototype directly: a
// SURGICAL change to TWO lazy-mount methods, in our code, documented here — not
// the global IntersectionObserver hack, not a node_modules edit. If Milkdown
// later adds a config flag (or renames these methods), revisit.
//
// Trade-off: CodeMirror editors for every code block are created at parse time
// (one-time open cost). Fine for typical docs; the heavy-doc textarea fallback
// (>400k chars / >50k lines, paths.js isHeavyDoc) covers extreme cases. All
// CodeMirrorBlock behavior is preserved (language detection, copy button, mermaid
// renderPreview chain, in-block search) — only the mount lifecycle changes.
// `destroy()` cleans up directly (app.unmount + cm.destroy, NOT via teardown), so
// block deletion is unaffected.
import { CodeMirrorBlock } from '@milkdown/components/code-block'
import DOMPurify from 'dompurify'
import { Fragment, createApp, defineComponent, h, onMounted, ref, watch, watchEffect } from 'vue'

const LANGUAGE_ALIASES = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  rb: 'ruby',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps: 'powershell',
  ps1: 'powershell',
  md: 'markdown',
  mmd: 'mermaid',
  yml: 'yaml',
  txt: 'text',
  plain: 'text',
  plaintext: 'text',
  text: 'text'
}

export function normalizeCodeBlockLanguage(raw) {
  const value = String(raw || '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()

  if (!value) return 'text'
  return LANGUAGE_ALIASES[value] || value
}

function languageLabel(language) {
  const normalized = normalizeCodeBlockLanguage(language || 'text')
  return normalized === 'json' ? 'JSON' : normalized
}

async function copyCodeToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const element = document.createElement('textarea')
    const previousFocus = document.activeElement
    element.value = text
    element.setAttribute('readonly', '')
    element.style.contain = 'strict'
    element.style.position = 'absolute'
    element.style.left = '-9999px'
    element.style.fontSize = '12pt'

    const selection = document.getSelection()
    const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    document.body.appendChild(element)
    element.select()
    element.selectionStart = 0
    element.selectionEnd = text.length
    document.execCommand('copy')
    document.body.removeChild(element)

    if (originalRange && selection) {
      selection.removeAllRanges()
      selection.addRange(originalRange)
    }
    previousFocus?.focus?.()
  }
}

function sanitizeIcon(icon) {
  return icon ? DOMPurify.sanitize(String(icon).trim()) : ''
}

function sanitizePreview(value) {
  return DOMPurify.sanitize(String(value), {
    ADD_TAGS: ['foreignObject'],
    ADD_ATTR: ['xmlns'],
    HTML_INTEGRATION_POINTS: { foreignobject: true }
  })
}

function Icon({ icon }) {
  return h('span', {
    class: 'milkdown-icon',
    innerHTML: sanitizeIcon(icon)
  })
}

const MoxieLanguageInput = defineComponent({
  props: {
    language: { type: Object, required: true },
    getReadOnly: { type: Function, required: true },
    setLanguage: { type: Function, required: true }
  },
  setup(props) {
    const inputRef = ref()
    const draft = ref(languageLabel(props.language.value))

    watch(
      () => props.language.value,
      (value) => {
        if (document.activeElement === inputRef.value) return
        draft.value = languageLabel(value)
      }
    )

    const commit = () => {
      const normalized = normalizeCodeBlockLanguage(draft.value)
      const current = normalizeCodeBlockLanguage(props.language.value)
      draft.value = languageLabel(normalized)
      if (normalized !== current) props.setLanguage(normalized)
    }

    const updateDraft = (value) => {
      draft.value = value
      const normalized = normalizeCodeBlockLanguage(value)
      const current = normalizeCodeBlockLanguage(props.language.value)
      if (normalized !== current) props.setLanguage(normalized)
    }

    return () =>
      h('label', { class: 'hm-code-language-control' }, [
        h('input', {
          ref: inputRef,
          class: 'hm-code-language-input',
          value: draft.value,
          spellcheck: 'false',
          autocomplete: 'off',
          autocapitalize: 'off',
          disabled: props.getReadOnly(),
          'aria-label': 'Code language',
          title: 'Code language',
          onInput: (event) => {
            updateDraft(event.target.value)
          },
          onBlur: commit,
          onKeydown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              commit()
              event.target.blur()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              draft.value = languageLabel(props.language.value)
              event.target.blur()
            }
          },
          onPointerdown: (event) => event.stopPropagation(),
          onClick: (event) => event.stopPropagation()
        })
      ])
  }
})

const MoxieCopyButton = defineComponent({
  props: {
    copyText: { type: String, required: true },
    copyIcon: { type: String, required: true },
    onCopy: { type: Function, required: true },
    text: { type: String, required: true }
  },
  setup(props) {
    const onCopyCode = () => {
      copyCodeToClipboard(props.text)
        .then(() => props.onCopy(props.text))
        .catch(console.error)
    }

    return () =>
      h('button', { type: 'button', class: 'copy-button', onClick: onCopyCode }, [
        h(Icon, { icon: props.copyIcon }),
        props.copyText
      ])
  }
})

const MoxiePreviewPanel = defineComponent({
  props: {
    text: { type: Object, required: true },
    language: { type: Object, required: true },
    config: { type: Object, required: true },
    previewOnlyMode: { type: Object, required: true },
    preview: { type: Object, required: true }
  },
  setup(props) {
    const previewRef = ref()

    watchEffect(() => {
      const container = previewRef.value
      if (!container) return
      while (container.firstChild) container.removeChild(container.firstChild)

      const previewContent = props.preview.value
      if (typeof previewContent === 'string' || previewContent instanceof Element) {
        container.innerHTML = sanitizePreview(previewContent)
      }
    })

    return () => {
      if (!props.preview.value) return null
      return h('div', { class: 'preview-panel' }, [
        !props.previewOnlyMode.value
          ? h(Fragment, null, [
              h('div', { class: 'preview-divider' }),
              h('div', { class: 'preview-label' }, props.config.previewLabel)
            ])
          : null,
        h('div', { ref: previewRef, class: 'preview' })
      ])
    }
  }
})

const MoxieCodeBlock = defineComponent({
  props: {
    text: { type: Object, required: true },
    selected: { type: Object, required: true },
    getReadOnly: { type: Function, required: true },
    codemirror: { type: Object, required: true },
    language: { type: Object, required: true },
    getAllLanguages: { type: Function, required: true },
    setLanguage: { type: Function, required: true },
    config: { type: Object, required: true }
  },
  setup(props) {
    const previewOnlyMode = ref(props.config.previewOnlyByDefault ?? props.getReadOnly())
    const codemirrorHostRef = ref()
    const preview = ref(null)

    onMounted(() => {
      while (codemirrorHostRef.value?.firstChild) {
        codemirrorHostRef.value.removeChild(codemirrorHostRef.value.firstChild)
      }
      codemirrorHostRef.value?.appendChild(props.codemirror.dom)
    })

    watch(
      () => [props.text.value, props.language.value],
      () => {
        const result = props.config.renderPreview(
          props.language.value,
          props.text.value,
          (value) => {
            preview.value = value
          }
        )

        if (result) preview.value = result
        if (result === undefined && !preview.value) preview.value = sanitizePreview(props.config.previewLoading)
        if (result === null) preview.value = null
      },
      { immediate: true }
    )

    const empty = () => {}

    return () =>
      h(Fragment, null, [
        h('div', { class: 'tools' }, [
          h(MoxieLanguageInput, {
            language: props.language,
            setLanguage: props.setLanguage,
            getReadOnly: props.getReadOnly
          }),
          h('div', { class: 'tools-button-group' }, [
            h(MoxieCopyButton, {
              copyIcon: props.config.copyIcon,
              copyText: props.config.copyText,
              onCopy: props.config.onCopy ?? empty,
              text: props.text.value
            }),
            preview.value
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'preview-toggle-button',
                    onClick: () => {
                      previewOnlyMode.value = !previewOnlyMode.value
                    }
                  },
                  [h(Icon, { icon: props.config.previewToggleButton(previewOnlyMode.value) })]
                )
              : null
          ])
        ]),
        h('div', {
          ref: codemirrorHostRef,
          class: ['codemirror-host', preview.value && previewOnlyMode.value ? 'hidden' : '']
        }),
        h(MoxiePreviewPanel, {
          text: props.text,
          language: props.language,
          config: props.config,
          previewOnlyMode,
          preview
        })
      ])
  }
})

// Guard against Milkdown API drift: if a future @milkdown/components bump
// renames/removes these hooks, the patch silently stops applying (lazy-mount
// returns) — surface that so a version bump doesn't quietly re-introduce #25.
if (
  typeof CodeMirrorBlock?.prototype?.renderPlaceholder !== 'function' ||
  typeof CodeMirrorBlock?.prototype?.initializeCodeMirror !== 'function' ||
  typeof CodeMirrorBlock?.prototype?.scheduleTeardown !== 'function'
) {
  // eslint-disable-next-line no-console
  console.warn('[moxie] code-block eager-mount patch: CodeMirrorBlock API changed — #25 jump may return.')
}

const proto = CodeMirrorBlock.prototype

CodeMirrorBlock.prototype.createApp = function moxieCreateCodeBlockApp() {
  return createApp(MoxieCodeBlock, {
    text: this.text,
    selected: this.selected,
    codemirror: this.cm,
    language: this.language,
    getAllLanguages: this.getAllLanguages,
    getReadOnly: () => !this.view.editable,
    setLanguage: this.setLanguage,
    config: this.config
  })
}

// (1) Mount the CodeMirror editor EAGERLY at construction instead of showing a
//     placeholder + waiting for the IntersectionObserver. renderPlaceholder() is
//     called exactly once, in the constructor, AFTER node/view/config/loader/
//     languageConf/readOnlyConf/forwardUpdate are all assigned — so
//     initializeCodeMirror() (idempotent via its `initialized` guard) is safe to
//     call here, and the observer's later "isIntersecting" callback is a no-op.
proto.renderPlaceholder = function eagerRenderPlaceholder() {
  this.createApp = CodeMirrorBlock.prototype.createApp
  this.initializeCodeMirror()
}

// (2) Never tear the editor down once mounted → its height never reverts to the
//     placeholder (the source of the delta). destroy() still cleans up directly,
//     so this doesn't leak on block deletion.
proto.scheduleTeardown = function noOpTeardown() {
  /* intentional no-op — keep mounted so height stays stable (#25) */
}
