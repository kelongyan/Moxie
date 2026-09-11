const CDP = "http://127.0.0.1:9222";
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

const out = await evalJs(String.raw`(() => {
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: +b.left.toFixed(1), right: +b.right.toFixed(1), top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const overlap = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const bar = document.querySelector('.tab-bar');
  const scroll = document.querySelector('.tab-scroll');
  const end = document.querySelector('.tab-end-zone');
  const plus = document.querySelector('.tab-new-button');
  const tools = [...document.querySelectorAll('.tool-button')];
  const endRect = rect(end);
  const barRect = rect(bar);
  const hits = tools.map((t) => ({ label: t.getAttribute('aria-label'), rect: rect(t) }))
    .filter((t) => overlap(endRect, t.rect))
    .map((t) => t.label);
  const endCenter = endRect ? document.elementFromPoint(endRect.left + endRect.w / 2, endRect.top + endRect.h / 2) : null;
  const scrollable = scroll ? scroll.scrollWidth > scroll.clientWidth + 1 : null;
  return {
    bar: barRect,
    scroll: rect(scroll),
    endZone: endRect,
    plus: rect(plus),
    endZoneInsideBar: !!(endRect && barRect && endRect.right <= barRect.right + 0.5 && endRect.left >= barRect.left - 0.5),
    endZoneOverlapsToolButtons: hits,
    elementAtEndZoneCenter: endCenter ? (endCenter.className || endCenter.tagName) + ' drag=' + endCenter.hasAttribute('data-tauri-drag-region') : null,
    tabCount: document.querySelectorAll('.tab').length,
    tabWidth: rect(document.querySelector('.tab'))?.w,
    tabStripScrollable: scrollable,
    endZoneDragRegion: end ? end.hasAttribute('data-tauri-drag-region') : null
  };
})()`);

console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
