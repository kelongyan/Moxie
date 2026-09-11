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

const expr = String.raw`(() => {
  const parse = (c) => {
    const s = String(c);
    const m = s.match(/[\d.]+/g) || [0, 0, 0, 1];
    // color(srgb r g b / a) 的量纲是 0-1，需要换算到 0-255
    if (s.startsWith("color(srgb")) {
      return { r: +m[0] * 255, g: +m[1] * 255, b: +m[2] * 255, a: m[3] === undefined ? 1 : +m[3] };
    }
    return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] };
  };
  const lum = ({r,g,b}) => { const f = v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const ratio = (a,b) => { const l1=lum(a), l2=lum(b); const hi=Math.max(l1,l2), lo=Math.min(l1,l2); return +((hi+0.05)/(lo+0.05)).toFixed(2); };
  const isT = (c) => /rgba?\(0, 0, 0, 0\)|transparent/.test(String(c));
  const effectiveBg = (el) => {
    const chain = [];
    let n = el;
    while (n) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && !isT(bg)) { const c = parse(bg); chain.push(c); if (c.a >= 1) break; }
      n = n.parentElement;
    }
    let base = { r: 255, g: 255, b: 255 };
    for (let i = chain.length - 1; i >= 0; i--) {
      const c = chain[i];
      base = { r: c.a*c.r + (1-c.a)*base.r, g: c.a*c.g + (1-c.a)*base.g, b: c.a*c.b + (1-c.a)*base.b };
    }
    return base;
  };
  const out = {};
  const items = [
    ["view-mode-toggle", ".view-mode-toggle"],
    ["tool-button-active", ".tool-button.active"],
    ["tool-button-plain", ".tool-button:not(.active)"],
    ["tab-name-normal", ".tab:not(.selected) .tab-name"],
    ["row-subtitle", ".row-subtitle"],
    ["section-title", ".section-title"],
    ["status-bar", ".status-bar"],
    ["status-item", ".status-item"],
    ["bigfile-trigger", ".bigfile-trigger"]
  ];
  for (const [name, sel] of items) {
    const el = document.querySelector(sel);
    if (!el) { out[name] = null; continue; }
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = effectiveBg(el);
    const composited = { r: fg.a*fg.r + (1-fg.a)*bg.r, g: fg.a*fg.g + (1-fg.a)*bg.g, b: fg.a*fg.b + (1-fg.a)*bg.b };
    out[name] = {
      fg: cs.color,
      effBg: "rgb(" + [bg.r, bg.g, bg.b].map((v) => Math.round(v)).join(", ") + ")",
      ratio: ratio(composited, bg),
      size: cs.fontSize
    };
  }
  return out;
})()`;

console.log(JSON.stringify(await evalJs(expr), null, 2));
ws.close();
process.exit(0);
