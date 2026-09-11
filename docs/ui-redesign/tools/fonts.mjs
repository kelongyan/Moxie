// 验证：界面 / 编辑器 / 预览 iframe 三处中文实际渲染用的字体
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

await send("DOM.enable");
await send("CSS.enable");

// 1) 主文档：字体是否可用 + 中文元素的实际平台字体
console.log("字体已加载（document.fonts.check）:", await evalJs(`JSON.stringify({
  frex: document.fonts.check('16px "Frex Sans GB"'),
  noto: document.fonts.check('16px "Noto Sans SC"'),
  status: document.fonts.status
})`));

const doc = await send("DOM.getDocument", { depth: -1, pierce: true });
const rootId = doc.result.root.nodeId;

function findByClass(node, cls) {
  if (node.nodeName === "#text") return null;
  const attrs = node.attributes ?? [];
  for (let i = 0; i < attrs.length; i += 2) {
    if (attrs[i] === "class" && String(attrs[i + 1]).split(" ").includes(cls)) return node;
  }
  for (const child of node.children ?? []) {
    const hit = findByClass(child, cls);
    if (hit) return hit;
  }
  return null;
}
function findIframeContentDoc(node) {
  if (node.nodeName === "IFRAME" && node.contentDocument) return node.contentDocument;
  for (const child of node.children ?? []) {
    const hit = findIframeContentDoc(child);
    if (hit) return hit;
  }
  return null;
}

async function platformFonts(nodeId, label) {
  const r = await send("CSS.getPlatformFontsForNode", { nodeId });
  const fonts = r.result?.fonts ?? [];
  console.log(`  ${label}:`, fonts.map((f) => `${f.familyName} × ${f.glyphCount} 字形`).join(" | ") || "（无）");
}

console.log("\n主窗口：");
for (const cls of ["section-title", "row-title", "status-item"]) {
  const node = findByClass(doc.result.root, cls);
  if (node) await platformFonts(node.nodeId, "." + cls);
}

// 编辑器（源码模式）：切到源码模式后取 .cm-line
await evalJs(`document.querySelector('.view-mode-toggle')?.click()`);
await sleep(1000);
const doc2 = await send("DOM.getDocument", { depth: -1, pierce: true });
const cmNode = findByClass(doc2.result.root, "cm-content");
if (cmNode) await platformFonts(cmNode.nodeId, ".cm-content（编辑器正文）");

// 切回渲染模式，取预览 iframe 内的正文
await evalJs(`document.querySelector('.view-mode-toggle')?.click()`);
await sleep(1400);
const doc3 = await send("DOM.getDocument", { depth: -1, pierce: true });
const iframeDoc = findIframeContentDoc(doc3.result.root);
if (iframeDoc) {
  const q = await send("DOM.querySelector", { nodeId: iframeDoc.nodeId, selector: "article p" });
  if (q.result?.nodeId) await platformFonts(q.result.nodeId, "预览 iframe 的 article p");
  const q2 = await send("DOM.querySelector", { nodeId: iframeDoc.nodeId, selector: "article h1" });
  if (q2.result?.nodeId) await platformFonts(q2.result.nodeId, "预览 iframe 的 h1");
} else {
  console.log("  未找到预览 iframe 的内容文档");
}

ws.close();
process.exit(0);
