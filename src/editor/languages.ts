import { markdown } from "@codemirror/lang-markdown";
import { foldService, LanguageDescription } from "@codemirror/language";
import { GFM } from "@lezer/markdown";
import { Extension } from "@codemirror/state";

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

const markdownHeadingFold = foldService.of((state, lineStart, lineEnd) => {
  return markdownHeadingFoldRange(state.doc.toString(), lineStart, lineEnd);
});

/**
 * 围栏代码的嵌入式高亮（别名集合与 preview/highlight.ts 对齐）。
 * load 走动态 import，CodeMirror 只在视口里出现对应语言的围栏时才加载。
 */
const CODE_LANGUAGES: LanguageDescription[] = [
  LanguageDescription.of({
    name: "javascript",
    alias: ["js", "jsx", "mjs", "cjs", "node"],
    async load() {
      return (await import("@codemirror/lang-javascript")).javascript({ jsx: true });
    },
  }),
  LanguageDescription.of({
    name: "typescript",
    alias: ["ts", "tsx"],
    async load() {
      return (await import("@codemirror/lang-javascript")).javascript({
        jsx: true,
        typescript: true,
      });
    },
  }),
  LanguageDescription.of({
    name: "json",
    alias: ["json5"],
    async load() {
      return (await import("@codemirror/lang-json")).json();
    },
  }),
  LanguageDescription.of({
    name: "css",
    alias: ["scss", "less"],
    async load() {
      return (await import("@codemirror/lang-css")).css();
    },
  }),
  LanguageDescription.of({
    name: "html",
    alias: ["htm", "xml", "svg", "vue"],
    async load() {
      return (await import("@codemirror/lang-html")).html();
    },
  }),
  LanguageDescription.of({
    name: "python",
    alias: ["py", "python3"],
    async load() {
      return (await import("@codemirror/lang-python")).python();
    },
  }),
  LanguageDescription.of({
    name: "sql",
    alias: ["mysql", "pgsql", "sqlite", "plsql"],
    async load() {
      return (await import("@codemirror/lang-sql")).sql();
    },
  }),
  LanguageDescription.of({
    name: "yaml",
    alias: ["yml"],
    async load() {
      return (await import("@codemirror/lang-yaml")).yaml();
    },
  }),
  LanguageDescription.of({
    name: "cpp",
    alias: ["c", "c++", "cc", "cxx", "h", "hpp", "hxx"],
    async load() {
      return (await import("@codemirror/lang-cpp")).cpp();
    },
  }),
];

/** Markdown 语法高亮（含 GFM：表格/任务清单/删除线）+ 围栏代码嵌入高亮 + 按标题层级折叠 */
export function markdownExtensions(): Extension[] {
  return [markdown({ codeLanguages: CODE_LANGUAGES, extensions: [GFM] }), markdownHeadingFold];
}
