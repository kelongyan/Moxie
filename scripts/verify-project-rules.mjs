import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const path = 'RULE.md'
assert(existsSync(path), 'RULE.md should exist at the project root')

const text = readFileSync(path, 'utf8')
const required = [
  '修改完毕之后必须重新编译打包',
  '新的安装包放在桌面',
  '移除多余的安装包',
  '低内存编译',
  '不要保留兼容性尾巴',
  'PowerShell'
]

for (const phrase of required) {
  assert(text.includes(phrase), `RULE.md should include: ${phrase}`)
}

console.log('project rules ok')
