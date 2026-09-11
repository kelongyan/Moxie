// 验证独立窗口（设置 / 查找 / 编解码）里的中文实际字体
const CDP = "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget(match, timeoutMs = 8000) {
  const start = Date.now();
  for (;;) {
    const list = await (await fetch(`${CDP}/json/list`)).json();
    const t = list.find((x) => x.type === "page" && match(x));
    if (t) return t;
    if (Date.now() - start > timeoutMs) return null;
    await sleep(250);
  }
}
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
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
  return { send, evalJs, close: () => ws.close() };
}

const main = await findTarget((t) => !t.url.includes("view="));
const s = await connect(main);
const keys = [["settings", ",", { ctrlKey: true }], ["find", "f", { ctrlKey: true }], ["codec", "d", { ctrlKey: true, altKey: true }]];

for (const [name, key, mods] of keys) {
  await s.evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }, ${JSON.stringify(mods)})))`);
  await sleep(1500);
  const t = await findTarget((x) => x.url.includes("view=" + name), 6000);
  if (!t) { console.log(name + ": 窗口未找到"); continue; }
  const c = await connect(t);
  await c.send("DOM.enable");
  await c.send("CSS.enable");
  const check = await c.evalJs(`JSON.stringify({ frex: document.fonts.check('16px "Frex Sans GB"'), status: document.fonts.status })`);
  const doc = await c.send("DOM.getDocument", { depth: -1, pierce: true });
  const rootId = doc.result.root.nodeId;
  // 取一段中文元素的平台字体：优先标题类，否则取 body 下的第一个元素
  const sel = name === "settings" ? ".settings-title" : name === "find" ? ".check-label" : ".codec-pane-title";
  const q = await c.send("DOM.querySelector", { nodeId: rootId, selector: sel });
  let fonts = "（未找到元素）";
  if (q.result?.nodeId) {
    const r = await c.send("CSS.getPlatformFontsForNode", { nodeId: q.result.nodeId });
    fonts = (r.result?.fonts ?? []).map((f) => `${f.familyName} × ${f.glyphCount}`).join(" | ") || "（无）";
  }
  console.log(`[${name}] 字体可用=${check.frex}  ${sel}: ${fonts}`);
  c.close();
}

s.close();
process.exit(0);
