import { decodeString } from 'micromark-util-decode-string'

const PUNCT_BEFORE_CLOSE_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{P}\p{S}]$/u
const LETTER_AFTER_CLOSE_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{L}\p{N}]/u
const DELIM_CHARS = new Set(['*', '_', '~'])
const ESCAPABLE_RE = /[!-/:-@[-`{-~]/
const CHARACTER_REFERENCE_RE = /^&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/i

function isEscaped(value, index) {
  let slashCount = 0
  for (let i = index - 1; i >= 0 && value[i] === '\\'; i--) slashCount += 1
  return slashCount % 2 === 1
}

function isInlineCodeAt(value, index) {
  let inCode = false
  for (let i = 0; i < index; i++) {
    if (value[i] === '`' && !isEscaped(value, i)) inCode = !inCode
  }
  return inCode
}

function canOpen(value, start, marker) {
  if (isEscaped(value, start) || isInlineCodeAt(value, start)) return false
  if (DELIM_CHARS.has(value[start - 1])) return false
  const next = value[start + marker.length]
  return !!next && !/\s/u.test(next) && !DELIM_CHARS.has(next)
}

function canClose(value, close, marker) {
  if (isEscaped(value, close) || isInlineCodeAt(value, close)) return false
  const before = value.slice(close - 1, close)
  const after = value.slice(close + marker.length, close + marker.length + 1)
  if (!before || !after) return false
  if (!LETTER_AFTER_CLOSE_RE.test(after)) return false
  return PUNCT_BEFORE_CLOSE_RE.test(before)
}

function findClose(value, contentStart, marker) {
  let close = value.indexOf(marker, contentStart)
  while (close >= 0) {
    if (canClose(value, close, marker)) return close
    close = value.indexOf(marker, close + marker.length)
  }
  return -1
}

function makePoint(basePoint, offset) {
  if (!basePoint) return undefined
  return {
    line: basePoint.line,
    column: basePoint.column + offset,
    offset: basePoint.offset == null ? undefined : basePoint.offset + offset
  }
}

function makePosition(basePoint, start, end) {
  const startPoint = makePoint(basePoint, start)
  const endPoint = makePoint(basePoint, end)
  if (!startPoint || !endPoint) return undefined
  return { start: startPoint, end: endPoint }
}

function codePointAt(value, index) {
  if (index >= value.length) return ''
  return String.fromCodePoint(value.codePointAt(index))
}

function buildSourceToValueMap(sourceValue, value) {
  const map = new Array(sourceValue.length + 1)
  let sourceIndex = 0
  let valueIndex = 0

  const advance = (sourceEnd, decodedText) => {
    const nextValueIndex = valueIndex + decodedText.length
    for (let i = sourceIndex; i < sourceEnd; i++) map[i] = valueIndex
    map[sourceEnd] = nextValueIndex
    sourceIndex = sourceEnd
    valueIndex = nextValueIndex
  }

  while (sourceIndex < sourceValue.length) {
    map[sourceIndex] = valueIndex

    const escaped = sourceValue[sourceIndex] === '\\' && ESCAPABLE_RE.test(sourceValue[sourceIndex + 1] || '')
    if (escaped && value.startsWith(sourceValue[sourceIndex + 1], valueIndex)) {
      advance(sourceIndex + 2, sourceValue[sourceIndex + 1])
      continue
    }

    const referenceMatch = CHARACTER_REFERENCE_RE.exec(sourceValue.slice(sourceIndex))?.[0]
    if (referenceMatch) {
      const decodedReference = decodeString(referenceMatch)
      if (decodedReference && value.startsWith(decodedReference, valueIndex)) {
        advance(sourceIndex + referenceMatch.length, decodedReference)
        continue
      }
    }

    const sourceChar = codePointAt(sourceValue, sourceIndex)
    const valueChar = codePointAt(value, valueIndex)
    if (!sourceChar) break
    advance(sourceIndex + sourceChar.length, value.startsWith(sourceChar, valueIndex) ? sourceChar : valueChar)
  }

  map[sourceValue.length] = valueIndex
  for (let i = 0, last = 0; i < map.length; i++) {
    if (map[i] == null) map[i] = last
    else last = map[i]
  }
  return map
}

function splitCjkInlineMarksInText(value, sourceValue = value, basePoint = null) {
  const out = []
  let sourceIndex = 0
  const sourceToValue = buildSourceToValueMap(sourceValue, value)

  const decodedSlice = (start, end) => value.slice(sourceToValue[start] || 0, sourceToValue[end] || 0)

  const pushText = (text, start = null, end = null) => {
    if (!text) return
    const last = out[out.length - 1]
    const position = start == null || end == null ? undefined : makePosition(basePoint, start, end)
    if (last?.type === 'text') {
      last.value += text
      if (last.position && position) last.position.end = position.end
    } else {
      out.push({ type: 'text', value: text, ...(position ? { position } : {}) })
    }
  }

  const pushSourceText = (start, end) => pushText(decodedSlice(start, end), start, end)

  while (sourceIndex < sourceValue.length) {
    const candidates = [
      { marker: '**', type: 'strong' },
      { marker: '__', type: 'strong' },
      { marker: '~~', type: 'delete' },
      { marker: '*', type: 'emphasis' },
      { marker: '_', type: 'emphasis' }
    ]
      .map((item) => ({ ...item, start: sourceValue.indexOf(item.marker, sourceIndex) }))
      .filter((item) => item.start >= 0)
      .sort((a, b) => a.start - b.start || b.marker.length - a.marker.length)

    const next = candidates.find((item) => canOpen(sourceValue, item.start, item.marker))
    if (!next) {
      pushSourceText(sourceIndex, sourceValue.length)
      break
    }

    const contentStart = next.start + next.marker.length
    const close = findClose(sourceValue, contentStart, next.marker)
    if (close < 0) {
      pushSourceText(sourceIndex, sourceValue.length)
      break
    }

    const sourceContent = sourceValue.slice(contentStart, close)
    const valueContent = decodedSlice(contentStart, close)
    if (!valueContent.trim()) {
      pushSourceText(sourceIndex, close + next.marker.length)
      sourceIndex = close + next.marker.length
      continue
    }

    pushSourceText(sourceIndex, next.start)
    const position = makePosition(basePoint, next.start, close + next.marker.length)
    out.push({
      type: next.type,
      ...(position ? { position } : {}),
      children: splitCjkInlineMarksInText(valueContent, sourceContent, makePoint(basePoint, contentStart) || null)
    })
    sourceIndex = close + next.marker.length
  }

  return out
}

function visitInline(node, file) {
  if (!Array.isArray(node.children)) return
  for (const child of node.children) visitInline(child, file)

  const next = []
  for (const child of node.children) {
    if (child.type !== 'text' || typeof child.value !== 'string') {
      next.push(child)
      continue
    }
    const sourceValue =
      typeof file?.value === 'string' &&
      child.position?.start?.offset != null &&
      child.position?.end?.offset != null
        ? file.value.slice(child.position.start.offset, child.position.end.offset)
        : child.value
    const split = splitCjkInlineMarksInText(child.value, sourceValue, child.position?.start || null)
    next.push(...split)
  }
  node.children = next
}

export function remarkCjkInlineMarks() {
  return (tree, file) => {
    visitInline(tree, file)
    return tree
  }
}
