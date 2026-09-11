import fs from "node:fs";

// usage: node measure.mjs <outJson>
const outFile = process.argv[2];
const CDP = "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listTargets() {
  return await (await fetch(`${CDP}/json/list`)).json();
}
async function findTarget(match, timeoutMs = 8000) {
  const start = Date.now();
  for (;;) {
    const list = await listTargets();
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
  return { evalJs, close: () => ws.close() };
}

const HELPERS = `
  const parse = (c) => { const m = String(c).match(/[\\d.]+/g) || [0,0,0,1]; return { r:+m[0], g:+m[1], b:+m[2], a:m[3] === undefined ? 1 : +m[3] }; };
  const lum = ({r,g,b}) => { const f = v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const ratio = (a,b) => { const l1 = lum(parse(a)), l2 = lum(parse(b)); const hi = Math.max(l1,l2), lo = Math.min(l1,l2); return +((hi+0.05)/(lo+0.05)).toFixed(2); };
  const isTransparent = (c) => /rgba?\\(0, 0, 0, 0\\)|transparent/.test(String(c));
  const effBg = (el) => { let n = el; while (n) { const bg = getComputedStyle(n).backgroundColor; if (bg && !isTransparent(bg)) return bg; n = n.parentElement; } return 'rgb(255,255,255)'; };
  const props = (el, list) => { const cs = getComputedStyle(el); const o = {}; for (const p of list) o[p] = cs[p]; return o; };
  const box = (el) => { const r = el.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); };
`;

const PROPS = `["fontSize","fontWeight","color","backgroundColor","height","padding","borderRadius","borderColor","letterSpacing","lineHeight"]`;

const SURVEY = `
(() => {
  ${HELPERS}
  const out = { viewport: document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight, theme: document.documentElement.dataset.theme, items: {}, contrast: {} };
  const items = [
    ['title-toolbar', '.title-toolbar'],
    ['tool-button', '.tool-button'],
    ['title-brand', '.title-brand'],
    ['window-title', '.window-title'],
    ['tab-bar', '.tab-bar'],
    ['tab', '.tab'],
    ['tab.selected', '.tab.selected'],
    ['tab-name', '.tab.selected .tab-name'],
    ['tab-new-button', '.tab-new-button'],
    ['sidebar', '.sidebar'],
    ['section-header', '.section-header'],
    ['section-title', '.section-title'],
    ['sidebar-row', '.sidebar-row'],
    ['row-title', '.row-title'],
    ['row-subtitle', '.row-subtitle'],
    ['sidebar-footer', '.sidebar-footer'],
    ['cm-host', '.cm-host'],
    ['cm-content', '.cm-content'],
    ['cm-line', '.cm-line'],
    ['cm-gutters', '.cm-gutters'],
    ['status-bar', '.status-bar'],
    ['save-state', '.save-state'],
    ['bigfile-trigger', '.bigfile-trigger'],
    ['view-mode-toggle', '.view-mode-toggle'],
    ['preview-pane', '.preview-pane'],
    ['preview-toolbar', '.preview-toolbar'],
    ['preview-outline-trigger', '.preview-outline-trigger'],
    ['editor-empty', '.editor-empty'],
    ['modal-panel', '.modal-panel'],
    ['modal-title', '.modal-title'],
    ['modal-message', '.modal-message'],
    ['modal-button', '.modal-button'],
    ['modal-button.prominent', '.modal-button.prominent'],
    ['context-menu', '.context-menu'],
    ['lac-tooltip', '.lac-tooltip'],
    ['bigfile-popover', '.bigfile-popover']
  ];
  for (const [name, sel] of items) {
    const el = document.querySelector(sel);
    out.items[name] = el ? Object.assign({ box: box(el), bg: effBg(el) }, props(el, ${PROPS})) : null;
  }
  const pairs = [
    ['tab-name/selected-tab', '.tab.selected .tab-name'],
    ['tab-name/normal-tab', '.tab:not(.selected) .tab-name'],
    ['row-title/sidebar', '.row-title'],
    ['row-subtitle/sidebar', '.row-subtitle'],
    ['section-title/sidebar', '.section-title'],
    ['status-bar/status-bar', '.status-bar'],
    ['save-state/status-bar', '.save-state'],
    ['bigfile-trigger/status-bar', '.bigfile-trigger'],
    ['tool-button/toolbar', '.tool-button'],
    ['window-title/toolbar', '.window-title'],
    ['title-brand/toolbar', '.title-brand'],
    ['cm-line/editor', '.cm-line'],
    ['view-mode-toggle/preview', '.view-mode-toggle'],
    ['editor-empty-title/empty', '.editor-empty-title'],
    ['editor-empty-desc/empty', '.editor-empty-desc']
  ];
  for (const [name, sel] of pairs) {
    const el = document.querySelector(sel);
    if (!el) { out.contrast[name] = null; continue; }
    const cs = getComputedStyle(el);
    out.contrast[name] = { fg: cs.color, bg: effBg(el), ratio: ratio(cs.color, effBg(el)), size: cs.fontSize, weight: cs.fontWeight };
  }
  // 预览 iframe 内部
  const d = document.querySelector('.preview-iframe')?.contentDocument;
  if (d) {
    const body = d.body, art = d.querySelector('article'), h1 = d.querySelector('h1'), p = d.querySelector('article p');
    out.preview = {
      body: body ? props(body, ["fontSize","lineHeight","color","backgroundColor","fontFamily"]) : null,
      article: art ? Object.assign({ box: box(art) }, props(art, ["padding","maxWidth"])) : null,
      h1: h1 ? props(h1, ["fontSize","fontWeight","margin","letterSpacing"]) : null,
      p: p ? props(p, ["fontSize","lineHeight","margin","color"]) : null
    };
  }
  return out;
})()
`;

const SUB_SURVEY = (win) => `
(() => {
  ${HELPERS}
  const out = { viewport: document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight, items: {}, contrast: {} };
  const items = {
    find: [['find-window','.find-window'],['find-grid','.find-grid'],['find-input','.find-grid input'],['find-button','.find-button'],['find-count','.find-count'],['check-label','.check-label'],['tool-button','.tool-button'],['title-toolbar','.title-toolbar']],
    settings: [['settings-window','.settings-window'],['settings-title','.settings-title'],['settings-heading','.settings-heading'],['settings-row','.settings-row'],['settings-label','.settings-label'],['settings-desc','.settings-desc'],['settings-select','.settings-select'],['switch-track','.switch-track'],['segmented','.segmented'],['segmented-button','.segmented button'],['stepper','.stepper'],['stepper-button','.stepper-button'],['stepper-value','.stepper-value'],['settings-footer','.settings-footer'],['settings-divider','.settings-divider'],['window-title','.window-title']],
    codec: [['codec-pane','.codec-pane'],['codec-text','.codec-text'],['codec-pane-title','.codec-pane-title'],['tool-button','.tool-button'],['window-title','.window-title']]
  }[${JSON.stringify(win)}] || [];
  for (const [name, sel] of items) {
    const el = document.querySelector(sel);
    out.items[name] = el ? Object.assign({ box: box(el), bg: effBg(el) }, props(el, ${PROPS})) : null;
  }
  const pairs = {
    find: [['find-input','.find-grid input'],['find-button','.find-button'],['check-label','.check-label']],
    settings: [['settings-label','.settings-label'],['settings-desc','.settings-desc'],['settings-title','.settings-title'],['settings-heading','.settings-heading'],['settings-row/.settings-window','.settings-row']],
    codec: [['codec-text','.codec-text'],['codec-pane-title','.codec-pane-title']]
  }[${JSON.stringify(win)}] || [];
  for (const [name, sel] of pairs) {
    const el = document.querySelector(sel);
    if (!el) { out.contrast[name] = null; continue; }
    const cs = getComputedStyle(el);
    out.contrast[name] = { fg: cs.color, bg: effBg(el), ratio: ratio(cs.color, effBg(el)), size: cs.fontSize, weight: cs.fontWeight };
  }
  return out;
})()
`;

const keydown = (key, mods = {}) =>
  `(() => { window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }, ${JSON.stringify(mods)}))); return 'ok'; })()`;

const result = {};

const main = await findTarget((t) => !t.url.includes("view="));
if (!main) { console.error("main window not found"); process.exit(1); }
const s = await connect(main);
result.main = await s.evalJs(SURVEY);
console.log("main surveyed, theme =", result.main?.theme);

await s.evalJs(keydown("f", { ctrlKey: true }));
await sleep(1500);
const find = await findTarget((t) => t.url.includes("view=find"), 6000);
if (find) { const c = await connect(find); result.find = await c.evalJs(SUB_SURVEY("find")); c.close(); }

await s.evalJs(keydown(",", { ctrlKey: true }));
await sleep(1500);
const settings = await findTarget((t) => t.url.includes("view=settings"), 6000);
if (settings) { const c = await connect(settings); result.settings = await c.evalJs(SUB_SURVEY("settings")); c.close(); }

await s.evalJs(keydown("d", { ctrlKey: true, altKey: true }));
await sleep(1500);
const codec = await findTarget((t) => t.url.includes("view=codec"), 6000);
if (codec) { const c = await connect(codec); result.codec = await c.evalJs(SUB_SURVEY("codec")); c.close(); }

s.close();
fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log("written", outFile);
process.exit(0);
