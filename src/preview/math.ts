import katex from "katex";

/** markdown-it 实例的最小结构类型（避免依赖其 export= 的类型导出） */
interface MarkdownItLike {
  inline: {
    ruler: { before(name: string, ruleName: string, rule: unknown): void };
  };
  block: {
    ruler: {
      before(name: string, ruleName: string, rule: unknown, options?: { alt?: string[] }): void;
    };
  };
  renderer: { rules: { [name: string]: unknown } };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** KaTeX 渲染；失败时回退为带标记的原文 */
export function renderKatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: "html",
    });
  } catch {
    return `<span class="math-error">${escapeHtml(tex)}</span>`;
  }
}

// 行内 $...$：不换行、内容不以空白开头/结尾（降低把价格符号误判为公式的概率）
function mathInline(state: { src: string; pos: number; push: (type: string, tag: string, nesting: number) => { content: string; markup: string } }, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x24) return false;
  if (src.charCodeAt(start + 1) === 0x24) return false;
  let end = start + 1;
  let close = -1;
  while (end < src.length) {
    const code = src.charCodeAt(end);
    if (code === 0x0a) break;
    if (code === 0x24 && src.charCodeAt(end - 1) !== 0x5c) {
      close = end;
      break;
    }
    end += 1;
  }
  if (close < 0) return false;
  const content = src.slice(start + 1, close);
  if (content.trim() === "" || /^\s/.test(content) || /\s$/.test(content)) return false;
  if (!silent) {
    const token = state.push("math_inline", "", 0);
    token.content = content;
    token.markup = "$";
  }
  state.pos = close + 1;
  return true;
}

// 块级 $$...$$：支持单行 $$x$$ 与跨行形式
function mathBlock(
  state: {
    src: string;
    bMarks: number[];
    eMarks: number[];
    tShift: number[];
    line: number;
    push: (type: string, tag: string, nesting: number) => { content: string; markup: string; block: boolean; map: [number, number] | null };
  },
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  const src = state.src;
  const pos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (pos + 2 > max) return false;
  if (src.slice(pos, pos + 2) !== "$$") return false;
  if (silent) return true;

  const restFirst = src.slice(pos + 2, max);
  const sameLineClose = restFirst.indexOf("$$");
  if (sameLineClose >= 0) {
    const token = state.push("math_block", "", 0);
    token.block = true;
    token.content = restFirst.slice(0, sameLineClose).trim();
    token.map = [startLine, startLine + 1];
    token.markup = "$$";
    state.line = startLine + 1;
    return true;
  }

  let nextLine = startLine;
  let closeLine = -1;
  for (;;) {
    nextLine += 1;
    if (nextLine >= endLine) break;
    const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
    const lineMax = state.eMarks[nextLine];
    if (src.slice(lineStart, lineMax).trim().startsWith("$$")) {
      closeLine = nextLine;
      break;
    }
  }

  const token = state.push("math_block", "", 0);
  token.block = true;
  token.markup = "$$";
  if (closeLine >= 0) {
    token.content = src
      .slice(pos + 2, state.bMarks[closeLine] + state.tShift[closeLine])
      .trim();
    token.map = [startLine, closeLine + 1];
    state.line = closeLine + 1;
  } else {
    token.content = src.slice(pos + 2, state.eMarks[nextLine - 1]).trim();
    token.map = [startLine, nextLine];
    state.line = nextLine;
  }
  return true;
}

export function mathPlugin(md: MarkdownItLike): void {
  md.inline.ruler.before("text", "math_inline", mathInline);
  md.block.ruler.before("fence", "math_block", mathBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.renderer.rules.math_inline = (tokens: { content: string }[], idx: number) =>
    renderKatex(tokens[idx].content, false);
  md.renderer.rules.math_block = (
    tokens: { content: string; map: [number, number] | null }[],
    idx: number,
    _options: unknown,
    env: unknown
  ) => {
    const token = tokens[idx];
    const offset = Number((env as { __lineOffset?: unknown } | undefined)?.__lineOffset ?? 0);
    const dataLine = token.map ? ` data-line="${token.map[0] + offset}"` : "";
    return `<div class="math-block"${dataLine}>${renderKatex(token.content, true)}</div>\n`;
  };
}
