// usage: node welcome.mjs <with-recent|no-recent>
const mode = process.argv[2] ?? "with-recent";
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

const snapshot = await evalJs(String.raw`(() => {
  const parse = (c) => { const m = String(c).match(/[\d.]+/g) || [0,0,0,1]; return { r:+m[0], g:+m[1], b:+m[2], a: m[3] === undefined ? 1 : +m[3] }; };
  const lum = ({r,g,b}) => { const f = v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const ratio = (a,b) => { const l1=lum(parse(a)), l2=lum(parse(b)); const hi=Math.max(l1,l2), lo=Math.min(l1,l2); return +((hi+0.05)/(lo+0.05)).toFixed(2); };
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); };
  const empty = document.querySelector('.editor-empty');
  const brand = document.querySelector('.editor-empty-brand');
  const items = [...document.querySelectorAll('.editor-empty-recent-item')];
  const btns = [...document.querySelectorAll('.editor-empty-actions .modal-button')];
  const hints = document.querySelector('.editor-empty-hints');
  return {
    hasEmptyState: !!empty,
    brandBox: box(brand),
    brandSrc: brand ? brand.getAttribute('src')?.split('/').pop() : null,
    title: document.querySelector('.editor-empty-title')?.textContent,
    desc: document.querySelector('.editor-empty-desc')?.textContent,
    buttons: btns.map((b) => ({ text: b.textContent.trim(), box: box(b), prominent: b.classList.contains('prominent') })),
    recentTitle: document.querySelector('.editor-empty-recent-title')?.textContent ?? null,
    recentCount: items.length,
    recentItems: items.map((el) => ({
      name: el.querySelector('.recent-name')?.textContent,
      dir: el.querySelector('.recent-dir')?.textContent,
      box: box(el),
      title: el.getAttribute('title')
    })),
    hintsText: hints ? hints.textContent.replace(/\s+/g, ' ').trim() : null,
    hintsContrast: hints ? ratio(getComputedStyle(hints).color, 'rgb(255,255,255)') : null,
    descContrast: (() => { const el = document.querySelector('.editor-empty-desc'); return el ? ratio(getComputedStyle(el).color, 'rgb(255,255,255)') : null; })(),
    recentDirContrast: (() => { const el = document.querySelector('.recent-dir'); return el ? ratio(getComputedStyle(el).color, 'rgb(255,255,255)') : null; })(),
    sectionTitleWeight: (() => { const el = document.querySelector('.section-title'); return el ? getComputedStyle(el).fontWeight : null; })()
  };
})()`);

console.log("=== 欢迎页状态 ===");
console.log(JSON.stringify(snapshot, null, 2));

if (mode === "no-recent") {
  console.log("\n[断言] recentCount === 0 :", snapshot.recentCount === 0 ? "PASS" : "FAIL");
  console.log("[断言] 最近区块未渲染 :", snapshot.recentTitle === null ? "PASS" : "FAIL");
  console.log("[断言] 空状态仍完整（品牌/按钮/提示）:", snapshot.hasEmptyState && snapshot.brandBox && snapshot.buttons.length === 2 && snapshot.hintsText ? "PASS" : "FAIL");
} else {
  console.log("\n[断言] 最近文件条数 > 0 :", snapshot.recentCount > 0 ? "PASS" : "FAIL");
  console.log("[断言] 行高 34px :", snapshot.recentItems[0]?.box === "324x34" || /x34$/.test(snapshot.recentItems[0]?.box ?? "") ? "PASS" : "FAIL (" + snapshot.recentItems[0]?.box + ")");
  console.log("[断言] 按钮 32px 高 :", snapshot.buttons.every((b) => /x32$/.test(b.box)) ? "PASS" : "FAIL (" + JSON.stringify(snapshot.buttons.map((b) => b.box)) + ")");

  // 点击第一条最近文件 → 应该打开文档、欢迎页消失
  console.log("\n=== 点击最近文件 ===");
  console.log(await evalJs(`(() => { const el = document.querySelector('.editor-empty-recent-item'); if (!el) return 'no item'; el.click(); return 'clicked: ' + el.getAttribute('title'); })()`));
  await sleep(1500);
  const after = await evalJs(`(() => ({
    emptyGone: !document.querySelector('.editor-empty'),
    tabCount: document.querySelectorAll('.tab').length,
    activeTab: document.querySelector('.tab.selected .tab-name')?.textContent ?? null,
    hasEditorOrPreview: !!(document.querySelector('.cm-host') || document.querySelector('.preview-pane'))
  }))()`);
  console.log(JSON.stringify(after, null, 2));
  console.log("[断言] 文档已打开 :", after.emptyGone && after.tabCount > 0 && after.hasEditorOrPreview ? "PASS" : "FAIL");
}

ws.close();
process.exit(0);
