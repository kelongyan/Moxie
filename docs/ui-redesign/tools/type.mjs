// 阶段 3 排版一致性实测：源码 vs 渲染的字号/行高/行宽对照
const CDP = "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === "page" && !t.url.includes("view="));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) =>
  new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
await new Promise((r) => ws.addEventListener("open", r));
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description };
  return r.result?.result?.value;
};

const RENDER = String.raw`(() => {
  const d = document.querySelector('.preview-iframe')?.contentDocument;
  if (!d) return { error: 'no preview doc' };
  const cs = (sel) => { const el = d.querySelector(sel); if (!el) return null; const c = d.defaultView.getComputedStyle(el); const r = el.getBoundingClientRect(); return { fontSize: c.fontSize, lineHeight: c.lineHeight, fontWeight: c.fontWeight, color: c.color, background: c.backgroundColor, border: c.borderLeftWidth + '/' + c.borderLeftColor, borderBottom: c.borderBottomWidth, padding: c.padding, width: Math.round(r.width), box: Math.round(r.width) + 'x' + Math.round(r.height) }; };
  const p = d.querySelector('article p');
  const pr = p ? p.getBoundingClientRect() : null;
  const art = d.querySelector('article');
  const ar = art ? art.getBoundingClientRect() : null;
  return {
    body: cs('body'),
    article: cs('article'),
    p: cs('article p'),
    textColumnWidth: pr && ar ? Math.round(pr.width) : null,
    textLeft: pr && ar ? Math.round(pr.left - ar.left) : null,
    h1: cs('h1'),
    h2: cs('h2'),
    code: cs('code'),
    pre: cs('pre'),
    blockquote: cs('blockquote'),
    th: cs('th'),
    pill: (() => { const el = document.querySelector('.view-mode-toggle'); if (!el) return null; const c = getComputedStyle(el); return { color: c.color, background: c.backgroundColor, border: c.borderWidth, boxShadow: c.boxShadow === 'none' ? 'none' : 'has-shadow', height: c.height, radius: c.borderRadius }; })()
  };
})()`;

const SOURCE = String.raw`(() => {
  const root = document.querySelector('.cm-host .cm-editor:not([data-doc-hidden])') ?? document;
  const content = root.querySelector('.cm-content');
  const scroller = root.querySelector('.cm-scroller');
  const gutters = root.querySelector('.cm-gutters');
  const lineNum = root.querySelector('.cm-lineNumbers .cm-gutterElement');
  const pill = document.querySelector('.view-mode-toggle');
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), width: Math.round(b.width), box: Math.round(b.width) + 'x' + Math.round(b.height) }; };
  const c = content ? getComputedStyle(content) : null;
  const s = scroller ? getComputedStyle(scroller) : null;
  const g = gutters ? getComputedStyle(gutters) : null;
  const ln = lineNum ? getComputedStyle(lineNum) : null;
  const p = pill ? getComputedStyle(pill) : null;
  const cb = content ? content.getBoundingClientRect() : null;
  const sb = scroller ? scroller.getBoundingClientRect() : null;
  const gb = gutters ? gutters.getBoundingClientRect() : null;
  return {
    content: c ? { fontSize: c.fontSize, lineHeight: c.lineHeight, padding: c.padding, width: Math.round(cb.width) } : null,
    scroller: s ? { paddingInline: s.paddingInline, fontFamily: s.fontFamily } : null,
    gutters: g ? { borderRight: g.borderRightWidth, color: g.color, box: r(gutters) } : null,
    lineNumber: ln ? { fontSize: ln.fontSize, minWidth: ln.minWidth, color: ln.color } : null,
    // 正文列宽 = 内容区宽度 - 左右 padding（内容 padding 为 0，直接取 content 宽度）
    textColumnWidth: cb ? Math.round(cb.width) : null,
    scrollerWidth: sb ? Math.round(sb.width) : null,
    gutterLeft: gb ? Math.round(gb.left) : null,
    pill: p ? { color: p.color, background: p.backgroundColor, border: p.borderWidth, boxShadow: p.boxShadow === 'none' ? 'none' : 'has-shadow', height: p.height } : null
  };
})()`;

const out = {};
console.log("=== 1. 渲染模式（doc-1 markdown）===");
out.render = await evalJs(RENDER);
console.log(JSON.stringify(out.render, null, 1));

console.log("\n=== 2. 切到源码模式（同一文档）===");
await evalJs(`document.querySelector('.view-mode-toggle')?.click()`);
await sleep(900);
out.source = await evalJs(SOURCE);
console.log(JSON.stringify(out.source, null, 1));

console.log("\n=== 3. 代码文件（doc-2 typescript）===");
await evalJs(`document.querySelector('[data-tab-id="doc-2"]')?.click()`);
await sleep(900);
out.codeFile = await evalJs(SOURCE);
console.log(JSON.stringify(out.codeFile, null, 1));

console.log("\n=== 对照 ===");
const rw = out.render?.article?.width ? out.render.article.width - 64 : undefined; const sw = out.source?.textColumnWidth;
console.log("渲染正文列宽:", rw, "| 源码正文列宽:", sw, "| 差:", rw && sw ? Math.abs(rw - sw) + "px" : "n/a");
console.log("渲染字号/行高:", out.render?.body?.fontSize, "/", out.render?.body?.lineHeight);
console.log("源码字号/行高:", out.source?.content?.fontSize, "/", out.source?.content?.lineHeight);
console.log("代码文件列宽（应全宽）:", out.codeFile?.textColumnWidth, "of scroller", out.codeFile?.scrollerWidth);
ws.close();
process.exit(0);
