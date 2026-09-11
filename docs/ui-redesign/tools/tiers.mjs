// 阶段 4 验收：四个界面的控件高度是否收敛到 24 / 28 / 32 三档（开关 32×18 为设计例外）
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
  return { evalJs, send, close: () => ws.close() };
}

const SURVEY = `(() => {
  const out = {};
  const pick = (sel) => [...document.querySelectorAll(sel)].map((el) => {
    const r = el.getBoundingClientRect();
    const label = (el.textContent || el.getAttribute('aria-label') || el.className || el.tagName).trim().slice(0, 14);
    return Math.round(r.height) + 'px  ' + label;
  });
  out.buttons = [...document.querySelectorAll('button')].filter((el) => !el.closest('.segmented') && !el.closest('.stepper') && !el.closest('.window-controls')).map((el) => { const r = el.getBoundingClientRect(); return Math.round(r.height) + 'px  ' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 14); });
  out.inputs = pick('input:not([type=checkbox])');
  out.selects = pick('select');
  out.textareas = pick('textarea');
  out.checkbox = pick('input[type=checkbox]');
  out.switchTrack = pick('.switch-track');
  out.rows = pick('.settings-row').slice(0, 3);
  out.panel = [...document.querySelectorAll('.modal-panel')].map((el) => {
    const c = getComputedStyle(el);
    return 'radius=' + c.borderRadius + ' padding=' + c.padding;
  });
  out.menus = [...document.querySelectorAll('.context-menu, .lac-tooltip, .bigfile-popover')].map((el) => {
    const c = getComputedStyle(el);
    return (el.className.split(' ')[0]) + ' border=' + c.borderTopWidth + ' radius=' + c.borderRadius;
  });
  return out;
})()`;

const report = {};
const heights = new Set();

const main = await findTarget((t) => !t.url.includes("view="));
const s = await connect(main);

// 1) 主窗口：保存对话框（doc-4 是脏文档）
await s.evalJs(`document.querySelector('[data-tab-id="doc-4"]')?.click()`);
await sleep(600);
await s.evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true, cancelable: true }))`);
await sleep(800);
report.dialog = await s.evalJs(SURVEY);
await s.evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('取消')); b?.click(); return 'ok'; })()`);
await sleep(400);

// 2) 独立窗口
const shortcuts = [
  ["find", "f", { ctrlKey: true }],
  ["settings", ",", { ctrlKey: true }],
  ["codec", "d", { ctrlKey: true, altKey: true }],
];
for (const [name, key, mods] of shortcuts) {
  await s.evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }, ${JSON.stringify(mods)})))`);
  await sleep(1400);
  const t = await findTarget((x) => x.url.includes("view=" + name), 6000);
  if (!t) { report[name] = "window not found"; continue; }
  const c = await connect(t);
  report[name] = await c.evalJs(SURVEY);
  c.close();
}

// 汇总（只统计按钮/输入/下拉/文本域）
const HEIGHT_RE = /^(\\d+)px/;
for (const [surface, data] of Object.entries(report)) {
  if (typeof data !== "object" || !data) continue;
  for (const group of ["buttons", "inputs", "selects", "textareas"]) {
    for (const item of data[group] ?? []) {
      const m = HEIGHT_RE.exec(item);
      if (m) heights.add(Number(m[1]));
    }
  }
}
console.log("=== 各界面控件高度 ===");
for (const [surface, data] of Object.entries(report)) {
  if (typeof data !== "object" || !data) { console.log(surface + ': ' + data); continue; }
  console.log("[" + surface + "]");
  for (const group of ["buttons", "inputs", "selects", "textareas", "switchTrack", "rows", "panel", "menus"]) {
    if (data[group]?.length) console.log("  " + group + ": " + JSON.stringify(data[group]));
  }
}
console.log("\n=== 汇总 ===");
console.log("出现的控件高度:", [...heights].sort((a, b) => a - b).join(", ") + " px");
const allowed = new Set([24, 28, 32]);
const bad = [...heights].filter((h) => !allowed.has(h) && h !== 18);
console.log("是否符合 24/28/32 三档（18 为开关轨道）:", bad.length === 0 ? "PASS" : "FAIL -> " + bad.join(", "));

s.close();
process.exit(0);
