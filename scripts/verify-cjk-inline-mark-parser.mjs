import assert from 'node:assert/strict'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

import { remarkCjkInlineMarks } from '../src/renderer/src/components/editor-cjk-inline-marks.js'

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkCjkInlineMarks)

function inlineTypes(markdown) {
  return processor.runSync(processor.parse(markdown), markdown).children[0].children.map((node) => node.type)
}

function firstInline(markdown, type) {
  return processor.runSync(processor.parse(markdown), markdown).children[0].children.find((node) => node.type === type)
}

const userParagraph =
  '**以“互补”为笔，需在人与自然的和谐共生上谋突破，实现绿色发展。**能否做到人与自然的和谐共生，事关“既要金山银山，也要绿水青山”到“绿水青山就是金山银山”的观念转变。'

assert.deepEqual(inlineTypes(userParagraph), ['strong', 'text'])
assert.equal(
  firstInline(userParagraph, 'strong').children[0].value,
  '以“互补”为笔，需在人与自然的和谐共生上谋突破，实现绿色发展。'
)

assert.deepEqual(inlineTypes('这是**重点。**然后继续'), ['text', 'strong', 'text'])
assert.deepEqual(inlineTypes('这是*重点。*然后继续'), ['text', 'emphasis', 'text'])
assert.deepEqual(inlineTypes('这是~~重点。~~然后继续'), ['text', 'delete', 'text'])
assert.deepEqual(inlineTypes('这是__重点。__然后继续'), ['text', 'strong', 'text'])
assert.deepEqual(inlineTypes('这是_重点。_然后继续'), ['text', 'emphasis', 'text'])

assert.deepEqual(inlineTypes('这是**重点**然后继续'), ['text', 'strong', 'text'])
assert.deepEqual(inlineTypes('英文 **bold.** next'), ['text', 'strong', 'text'])
assert.deepEqual(inlineTypes('不要碰 `**代码。**然后` 这里'), ['text', 'inlineCode', 'text'])
assert.deepEqual(inlineTypes('转义 \\**不是加粗。**然后'), ['text'])

const escapedBeforeRecoveredStrong = processor.runSync(
  processor.parse('转义 \\*literal* 这是**重点。**然后'),
  '转义 \\*literal* 这是**重点。**然后'
).children[0].children
assert.deepEqual(escapedBeforeRecoveredStrong.map((node) => node.type), ['text', 'strong', 'text'])
assert.equal(escapedBeforeRecoveredStrong[0].value, '转义 *literal* 这是')
assert.equal(escapedBeforeRecoveredStrong[1].children[0].value, '重点。')
assert.equal(escapedBeforeRecoveredStrong[2].value, '然后')

console.log('cjk inline mark parser ok')
