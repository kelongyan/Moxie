import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { foldService } from "@codemirror/language";
import { EditorState, Extension } from "@codemirror/state";
import { EditorLanguage } from "../models/language";

const HEADING_RE = /^(#{1,6})\s+/;

export function markdownHeadingFoldRange(
  text: string,
  lineStart: number,
  lineEnd: number
): { from: number; to: number } | null {
  const lineText = text.slice(lineStart, lineEnd);
  const match = HEADING_RE.exec(lineText);
  if (!match) return null;
  const level = match[1].length;
  let last = lineEnd;
  let pos = lineEnd + 1;
  while (pos <= text.length) {
    const nl = text.indexOf("\n", pos);
    const end = nl === -1 ? text.length : nl;
    const nextText = text.slice(pos, end);
    const nextMatch = HEADING_RE.exec(nextText);
    if (nextMatch && nextMatch[1].length <= level) break;
    last = end;
    if (nl === -1) break;
    pos = nl + 1;
  }
  if (last <= lineEnd) return null;
  if (text.slice(lineEnd, last).trim() === "") return null;
  return { from: lineEnd, to: last };
}

const SCAN_LIMIT = 200_000;

export function jsonContainerFoldRange(
  text: string,
  lineStart: number,
  lineEnd: number
): { from: number; to: number } | null {
  const lineText = text.slice(lineStart, lineEnd);
  let openIndex = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < lineText.length; i++) {
    const c = lineText[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") {
      openIndex = i;
      break;
    }
  }
  if (openIndex < 0) return null;

  const openPos = lineStart + openIndex;
  const openChar = text[openPos];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  inString = false;
  escaped = false;
  let closePos = -1;
  const end = Math.min(text.length, openPos + SCAN_LIMIT);
  for (let p = openPos; p < end; p++) {
    const c = text[p];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) {
        closePos = p;
        break;
      }
    }
  }
  if (closePos < 0) return null;
  const closeLineStart = text.lastIndexOf("\n", closePos - 1) + 1;
  if (closeLineStart <= lineStart) return null;
  return { from: openPos + 1, to: closePos };
}

const markdownHeadingFold = foldService.of((state, lineStart, lineEnd) => {
  return markdownHeadingFoldRange(state.doc.toString(), lineStart, lineEnd);
});

const jsonContainerFold = foldService.of((state: EditorState, lineStart: number, lineEnd: number) => {
  return jsonContainerFoldRange(state.doc.toString(), lineStart, lineEnd);
});

export function languageExtensions(lang: EditorLanguage): Extension[] {
  switch (lang) {
    case "javascript":
      return [javascript()];
    case "typescript":
      return [javascript({ typescript: true, jsx: true })];
    case "json":
      return [json(), jsonContainerFold];
    case "html":
      return [html()];
    case "css":
      return [css()];
    case "python":
      return [python()];
    case "yaml":
      return [yaml()];
    case "sql":
      return [sql()];
    case "markdown":
      return [markdown(), markdownHeadingFold];
    case "ccpp":
      return [cpp()];
    default:
      return [];
  }
}

export function hasSyntax(lang: EditorLanguage): boolean {
  return languageExtensions(lang).length > 0;
}
