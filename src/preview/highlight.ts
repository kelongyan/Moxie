import { classHighlighter, highlightCode } from "@lezer/highlight";
import type { Language } from "@codemirror/language";
import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";

// 超长代码块不高亮，避免渲染阻塞（性能硬化在 M5 细化）
const MAX_HIGHLIGHT_CHARS = 60_000;

const cache = new Map<string, Language>();

function languageFor(key: string): Language | null {
  const cached = cache.get(key);
  if (cached) return cached;
  let support;
  switch (key) {
    case "js":
      support = javascript({ jsx: true });
      break;
    case "ts":
      support = javascript({ jsx: true, typescript: true });
      break;
    case "json":
      support = json();
      break;
    case "css":
      support = css();
      break;
    case "html":
      support = html();
      break;
    case "py":
      support = python();
      break;
    case "sql":
      support = sql();
      break;
    case "yaml":
      support = yaml();
      break;
    case "cpp":
      support = cpp();
      break;
    default:
      return null;
  }
  cache.set(key, support.language);
  return support.language;
}

const ALIASES: Record<string, string> = {
  js: "js",
  jsx: "js",
  javascript: "js",
  mjs: "js",
  cjs: "js",
  node: "js",
  ts: "ts",
  tsx: "ts",
  typescript: "ts",
  json: "json",
  json5: "json",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  htm: "html",
  xml: "html",
  svg: "html",
  vue: "html",
  py: "py",
  python: "py",
  python3: "py",
  sql: "sql",
  mysql: "sql",
  pgsql: "sql",
  sqlite: "sql",
  plsql: "sql",
  yml: "yaml",
  yaml: "yaml",
  c: "cpp",
  cpp: "cpp",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "cpp",
  hpp: "cpp",
  hxx: "cpp",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 依据围栏语言标注解析出 Lezer 语言，未识别返回 null */
export function languageKeyOf(info: string): string | null {
  const first = info.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return ALIASES[first] ?? null;
}

/**
 * 把代码块渲染为带 `tok-*` 类的 HTML。
 * 语言不支持或代码过长时返回 null，由调用方回退纯文本。
 */
export function highlightToHtml(code: string, info: string): string | null {
  const key = languageKeyOf(info);
  if (!key) return null;
  const language = languageFor(key);
  if (!language) return null;
  const trimmed = code.replace(/\n$/, "");
  if (trimmed.length > MAX_HIGHLIGHT_CHARS) return null;

  let html = "";
  highlightCode(
    trimmed,
    language.parser.parse(trimmed),
    classHighlighter,
    (text, classes) => {
      const escaped = escapeHtml(text);
      html += classes ? `<span class="${classes}">${escaped}</span>` : escaped;
    },
    () => {
      html += "\n";
    }
  );
  return html;
}
