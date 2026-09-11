// 阶段 5：键盘焦点环 / Tab 顺序抽查
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

const describe = `(() => {
  const el = document.activeElement;
  if (!el) return 'none';
  const cs = getComputedStyle(el);
  const label = (el.getAttribute && (el.getAttribute('aria-label') || el.textContent || '')).trim().replace(/\\s+/g, ' ').slice(0, 16);
  return {
    el: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').slice(0, 2).join('.') : ''),
    label,
    focusVisible: el.matches ? el.matches(':focus-visible') : null,
    outlineWidth: cs.outlineWidth,
    outlineColor: cs.outlineColor,
    outlineStyle: cs.outlineStyle,
    outlineOffset: cs.outlineOffset
  };
})()`;

// 从 body 开始，按 Tab 走查前 14 个可聚焦元素
await evalJs(`document.body.focus(); document.activeElement?.blur?.(); 'reset'`);
await sleep(200);
console.log("Tab 顺序与焦点环（浅色主题）：");
for (let i = 1; i <= 14; i++) {
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await sleep(120);
  const d = await evalJs(describe);
  if (typeof d === "string") { console.log(`  ${String(i).padStart(2)}. ${d}`); continue; }
  console.log(`  ${String(i).padStart(2)}. ${d.el.padEnd(30)} ${String(d.label).padEnd(18)} focus-visible=${d.focusVisible} outline=${d.outlineStyle} ${d.outlineWidth} ${d.outlineColor} offset=${d.outlineOffset}`);
}

ws.close();
process.exit(0);
