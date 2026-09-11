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

  // —— Markdown 书写排版（TizuMark 字号分级；行级留白与边框在 app.css 的 md-h* 行装饰） ——
  {
    tag: tags.heading1,
    color: "var(--lac-text)",
    fontWeight: "700",
    fontSize: "2em",
  },
  {
    tag: tags.heading2,
    color: "var(--lac-text)",
    fontWeight: "700",
    fontSize: "1.5em",
  },
  {
    tag: tags.heading3,
    color: "var(--lac-text)",
    fontWeight: "700",
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
    fontWeight: "700",
    fontSize: "1em",
  },
  {
    tag: tags.heading6,
    color: "var(--lac-text-secondary)",
    fontWeight: "700",
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
    // TizuMark：链接只着色，不画下划线（hover 语义交给渲染视图）
    tag: tags.link,
    color: "var(--lac-accent)",
  },
  {
    tag: tags.url,
    color: "var(--lac-accent)",
  },
  {
    // 列表符号中性灰（代码编辑器的 keyword 紫在书写面上是噪音）
    tag: tags.list,
    color: "var(--lac-text-secondary)",
  },
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
