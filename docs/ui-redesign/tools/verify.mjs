import fs from "node:fs";

// usage: node verify.mjs <outJson>
const outFile = process.argv[2];
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
const main = await findTarget((t) => !t.url.includes("view="));
if (!main) { console.error("main window not found"); process.exit(1); }
const ws = new WebSocket(main.webSocketDebuggerUrl);
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
const keydown = (key, mods = {}) =>
  `(() => { window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }, ${JSON.stringify(mods)}))); return 'sent'; })()`;

const HELPERS = `
  const parse = (c) => { const m = String(c).match(/[\\d.]+/g) || [0,0,0,1]; return { r:+m[0], g:+m[1], b:+m[2], a:m[3] === undefined ? 1 : +m[3] }; };
  const lum = ({r,g,b}) => { const f = v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const ratio = (a,b) => { const l1 = lum(parse(a)), l2 = lum(parse(b)); const hi = Math.max(l1,l2), lo = Math.min(l1,l2); return +((hi+0.05)/(lo+0.05)).toFixed(2); };
  const isTransparent = (c) => /rgba?\\(0, 0, 0, 0\\)|transparent/.test(String(c));
  const effBg = (el) => { let n = el; while (n) { const bg = getComputedStyle(n).backgroundColor; if (bg && !isTransparent(bg)) return bg; n = n.parentElement; } return 'rgb(255,255,255)'; };
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); };
`;

const result = {};

result.geometry = await evalJs(`
(() => {
  ${HELPERS}
  const q = (s) => document.querySelector(s);
  const header = q('.title-toolbar');
  const tabBar = q('.tab-bar');
  const endZone = q('.tab-end-zone');
  const status = q('.status-bar');
  const sidebar = q('.sidebar');
  const cs = (s) => { const el = q(s); return el ? getComputedStyle(el) : null; };
  const h = (s) => { const el = q(s); return el ? Math.round(el.getBoundingClientRect().height) : null; };
  const w = (s) => { const el = q(s); return el ? Math.round(el.getBoundingClientRect().width) : null; };
  const svg = q('.tool-button svg');
  return {
    viewport: document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight,
    theme: document.documentElement.dataset.theme,
    headerHeight: h('.title-toolbar'),
    statusbarHeight: h('.status-bar'),
    chromeTotal: (h('.title-toolbar') ?? 0) + (h('.status-bar') ?? 0),
    tabBarHeight: h('.tab-bar'),
    tabBarInsideHeader: !!(header && tabBar && header.contains(tabBar)),
    tabEndZoneHasDragRegion: !!(endZone && endZone.hasAttribute('data-tauri-drag-region')),
    tabSize: box(q('.tab')),
    tabNewButton: box(q('.tab-new-button')),
    toolButton: box(q('.tool-button')),
    toolButtonSvg: svg ? Math.round(svg.getBoundingClientRect().width) + 'x' + Math.round(svg.getBoundingClientRect().height) : null,
    previewTrigger: box(q('.preview-outline-trigger')),
    sidebarWidth: w('.sidebar'),
    sidebarRowHeight: h('.sidebar-row'),
    sectionHeaderHeight: h('.section-header'),
    sidebarBorderRight: cs('.sidebar')?.borderRightWidth,
    elevation: {
      chrome: cs('.title-toolbar')?.backgroundColor,
      sidebar: cs('.sidebar')?.backgroundColor,
      editor: cs('.editor-pane')?.backgroundColor,
      statusbar: cs('.status-bar')?.backgroundColor
    },
    removedNodes: {
      windowTitle: !!q('.window-title'),
      brand: !!q('.title-brand')
    },
    tokenProbe: (() => {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;visibility:hidden;width:var(--ctl-sm);height:var(--ctl-md)';
      document.body.appendChild(el);
      const r = getComputedStyle(el);
      const out = { ctlSm: r.width, ctlMd: r.height, headerH: getComputedStyle(document.documentElement).getPropertyValue('--lac-header-height').trim(), tertiary: getComputedStyle(document.documentElement).getPropertyValue('--lac-text-tertiary').trim() };
      el.remove();
      return out;
    })()
  };
})()
`);

result.contrast = await evalJs(`
(() => {
  ${HELPERS}
  const out = {};
  const pairs = [
    ['row-subtitle/sidebar', '.row-subtitle'],
    ['section-title/sidebar', '.section-title'],
    ['view-mode-toggle/preview', '.view-mode-toggle'],
    ['status-bar/statusbar', '.status-bar'],
    ['tab-name/tab', '.tab .tab-name'],
    ['tool-button/header', '.tool-button']
  ];
  for (const [name, sel] of pairs) {
    const el = document.querySelector(sel);
    if (!el) { out[name] = null; continue; }
    const c = getComputedStyle(el);
    out[name] = { fg: c.color, bg: effBg(el), ratio: ratio(c.color, effBg(el)), size: c.fontSize, weight: c.fontWeight };
  }
  return out;
})()
`);

// —— 保存状态行为验证（doc-5 · flash-test.md）——
const steps = [];
const log = (k, v) => { steps.push({ step: k, value: v }); };

log("初始（干净文档）save-state 元素数", await evalJs(`(() => { document.querySelector('[data-tab-id="doc-5"]')?.click(); return document.querySelectorAll('.save-state').length; })()`));
await sleep(700);
log("切换后 save-state 元素数", await evalJs(`document.querySelectorAll('.save-state').length`));
log("激活文档 tab", await evalJs(`document.querySelector('.tab.selected .tab-name')?.textContent`));

// 输入一个字符 → 变脏
await evalJs(`(() => { const el = document.querySelector('.cm-content'); if (!el) return 'no editor'; el.focus(); return 'focused'; })()`);
await sleep(200);
await send("Input.insertText", { text: "改" });
await sleep(900);
log("输入后 save-state", await evalJs(`(() => { const el = document.querySelector('.save-state'); return el ? el.className + ':' + el.textContent.trim() : null; })()`));
log("输入后 status-item 顺序", await evalJs(`[...document.querySelectorAll('.status-item')].map(e => e.textContent.trim())`));

// Ctrl+S 保存
await evalJs(keydown("s", { ctrlKey: true }));
await sleep(400);
log("保存后 save-state", await evalJs(`(() => { const el = document.querySelector('.save-state'); return el ? el.className + ':' + el.textContent.trim() : null; })()`));
await sleep(1800);
log("1.8s 后 save-state", await evalJs(`(() => { const el = document.querySelector('.save-state'); return el ? el.className + ':' + el.textContent.trim() : null; })()`));

const filePath = "C:/Users/Administrator/AppData/Local/Temp/moxie-ui/light/flash-test.md";
try {
  const content = fs.readFileSync(filePath, "utf8");
  steps.push({ step: "磁盘文件已写入", value: /改/.test(content) + " / bytes=" + content.length });
} catch (e) {
  steps.push({ step: "磁盘文件读取失败", value: String(e) });
}

result.saveStateFlow = steps;

const flashContent = await evalJs(`(() => { const d = document; return null; })()`);
fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
ws.close();
process.exit(0);
