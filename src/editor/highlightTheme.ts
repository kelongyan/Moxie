import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

/**
 * 书写面配色：正文语法走"纸墨"色板（对齐 TizuMark 渲染规格——
 * 标题近黑分级、列表符号中性灰、链接 accent 无下划线），
 * 代码编辑器色板（--syn-*）只服务于围栏代码与降级源码模式。
 */
const lacHighlightStyle = HighlightStyle.define([
  // —— 代码（围栏内嵌语言 / 降级源码模式） ——
  {
    tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword],
    color: "var(--syn-keyword)",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp, tags.character],
    color: "var(--syn-string)",
  },
  {
    tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null],
    color: "var(--syn-number)",
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    color: "var(--syn-comment)",
    fontStyle: "italic",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName],
    color: "var(--syn-function)",
  },
  {
    tag: [tags.className, tags.typeName, tags.namespace, tags.tagName],
    color: "var(--syn-type)",
  },
  {
    tag: [tags.attributeName, tags.propertyName],
    color: "var(--syn-property)",
  },
  {
    tag: [tags.processingInstruction, tags.meta, tags.annotation],
    color: "var(--syn-meta)",
  },
  {
    tag: [tags.operator, tags.punctuation, tags.bracket, tags.separator],
    color: "var(--syn-punct)",
  },

  // —— Markdown 书写排版（对标 Typora 黄金比例字号梯队：h1 2.1 / h2 1.5 / h3 1.25 / h4 1.1 / h5 1.0 / h6 0.9） ——
  {
    tag: tags.heading1,
    color: "var(--lac-text)",
    fontWeight: "700",
    fontSize: "2.1em",
  },
  {
    tag: tags.heading2,
    color: "var(--lac-text)",
    fontWeight: "650",
    fontSize: "1.5em",
  },
  {
    tag: tags.heading3,
    color: "var(--lac-text)",
    fontWeight: "650",
    fontSize: "1.25em",
  },
  {
    tag: tags.heading4,
    color: "var(--lac-text)",
    fontWeight: "700",
    fontSize: "1.1em",
  },
  {
    tag: tags.heading5,
    color: "var(--lac-text-secondary)",
    fontWeight: "600",
    fontSize: "1.0em",
  },
  {
    tag: tags.heading6,
    color: "var(--lac-text-secondary)",
    fontWeight: "600",
    fontSize: "0.9em",
  },
  {
    tag: tags.heading,
    color: "var(--lac-text)",
    fontWeight: "700",
  },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  {
    tag: tags.strikethrough,
    textDecoration: "line-through",
    color: "var(--lac-text-secondary)",
  },
  {
    // 校样样张链接：墨字 + 校对红下划线（hover 语义交给渲染视图）
    tag: tags.link,
    color: "var(--lac-text)",
    textDecoration: "underline",
    textDecorationColor: "var(--lac-accent)",
    textUnderlineOffset: "3px",
  },
  {
    tag: tags.url,
    color: "var(--lac-text)",
    textDecoration: "underline",
    textDecorationColor: "var(--lac-accent)",
    textUnderlineOffset: "3px",
  },
  // 注意：不要给 tags.list 上色——@lezer/markdown 把该 tag 打在整个列表子树
  // （"OrderedList/... BulletList/..."），映射成灰色会把列表正文全部染灰；
  // 列表符号的中性灰由 livePreview 的 .md-bullet widget 自己负责。
  {
    tag: tags.quote,
    color: "var(--lac-text-secondary)",
  },
  // 行内代码：等宽 0.88em + 内嵌底色圆角片（TizuMark code 规格）
  {
    tag: tags.monospace,
    fontFamily: "var(--font-mono)",
    fontSize: "0.88em",
    color: "var(--lac-text)",
    backgroundColor: "var(--lac-bg-inset)",
    border: "1px solid var(--lac-border)",
    borderRadius: "4px",
    padding: "0 5px",
  },
]);

export function highlightExtension(): Extension {
  return syntaxHighlighting(lacHighlightStyle);
}
