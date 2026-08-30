import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const lacHighlightStyle = HighlightStyle.define([
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
    tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6],
    color: "var(--syn-heading)",
    fontWeight: "600",
  },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  {
    tag: tags.link,
    color: "var(--syn-link)",
    textDecoration: "underline",
  },
  {
    tag: [tags.processingInstruction, tags.meta, tags.annotation],
    color: "var(--syn-meta)",
  },
  {
    tag: [tags.operator, tags.punctuation, tags.bracket, tags.separator],
    color: "var(--syn-punct)",
  },
  {
    tag: [tags.list],
    color: "var(--syn-keyword)",
  },
  {
    tag: [tags.quote],
    color: "var(--syn-comment)",
  },
]);

export function highlightExtension(): Extension {
  return syntaxHighlighting(lacHighlightStyle);
}
