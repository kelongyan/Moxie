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

const state = `(() => {
  const host = document.querySelector('.cm-host');
  const visible = document.elementFromPoint(600, 300)?.closest?.('.cm-editor')?.dataset.docId ?? 'none';
  const active = document.querySelector('.tab.selected')?.getAttribute('data-tab-id') ?? null;
  const shown = [...host.querySelectorAll('.cm-editor')].filter((el) => !el.hasAttribute('data-doc-hidden')).map((el) => el.dataset.docId);
  return { active, visible, shown: shown.join(','), ok: shown.length === 1 && shown[0] === active && visible === active };
})()`;

const check = async (label) => {
  const s = await evalJs(state);
  console.log((s.ok ? "  OK   " : "  FAIL ") + label + " -> " + JSON.stringify(s));
};

const click = (sel) => evalJs(`document.querySelector('${sel}')?.click(); 'clicked'`);
const clickTab = (id) => click(`[data-tab-id="${id}"]`);

await check("初始（doc-1 渲染模式）");
await click(".view-mode-toggle");
await sleep(800);
await check("点药丸（doc-1 → 源码）");
await clickTab("doc-2");
await sleep(800);
await check("切到 doc-2");
await clickTab("doc-1");
await sleep(800);
await check("切回 doc-1");
await clickTab("doc-4");
await sleep(800);
await check("切到 doc-4（脏文档）");
await clickTab("doc-3");
await sleep(800);
await check("切到 doc-3（大文件）");
await clickTab("doc-1");
await sleep(800);
await check("再切回 doc-1");

ws.close();
process.exit(0);
