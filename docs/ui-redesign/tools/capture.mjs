import fs from "node:fs";
import path from "node:path";

// usage: node capture.mjs <empty|full|dark> <outDir>
const [scenario, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const CDP = "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[capture]", ...a);

async function listTargets() {
  return await (await fetch(`${CDP}/json/list`)).json();
}

async function findTarget(match, timeoutMs = 8000) {
  const start = Date.now();
  for (;;) {
    const list = await listTargets();
    const t = list.find((x) => x.type === "page" && match(x));
    if (t) return t;
    if (Date.now() - start > timeoutMs) throw new Error("target not found: " + match.toString());
    await sleep(250);
  }
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error")
      errors.push(m.params.entry.text);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Log.enable").catch(() => {});
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result?.exceptionDetails)
      return { __error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text };
    return r.result?.result?.value;
  };
  return { send, evalJs, errors, close: () => ws.close() };
}

const analysis = {};

async function shot(session, name) {
  const r = await session.send("Page.captureScreenshot", { format: "png" });
  if (!r.result?.data) {
    log("shot FAILED", name, JSON.stringify(r).slice(0, 200));
    return;
  }
  const file = path.join(outDir, name + ".png");
  fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
  // 在同一页面里分析：主色分布 + 亮度方差，用于客观判断是否空白
  const stats = await session.evalJs(`(async () => {
    const img = new Image();
    img.src = "data:image/png;base64,${r.result.data}";
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const hist = new Map();
    let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) {
      const r = d[i], g = d[i+1], b = d[i+2];
      const lum = 0.2126*r + 0.7152*g + 0.0722*b;
      sum += lum; sum2 += lum*lum; n++;
      const key = ((r>>4)<<8) | ((g>>4)<<4) | (b>>4);
      hist.set(key, (hist.get(key) || 0) + 1);
    }
    const mean = sum / n;
    const std = Math.sqrt(Math.max(0, sum2/n - mean*mean));
    const top = [...hist.entries()].sort((a,b) => b[1]-a[1]).slice(0,4).map(([k, cnt]) => {
      const r = ((k>>8)&15)*17, g = ((k>>4)&15)*17, b = (k&15)*17;
      const hex = '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
      return hex + ' ' + (100*cnt/n).toFixed(0) + '%';
    });
    return { size: img.naturalWidth + 'x' + img.naturalHeight, meanLum: Math.round(mean), std: Math.round(std), top };
  })()`);
  analysis[name] = stats;
  log("shot", name, JSON.stringify(stats));
}

const click = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'NOT FOUND ' + ${JSON.stringify(sel)}; el.click(); return 'ok'; })()`;
const clickText = (text) => `(() => { const el = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes(${JSON.stringify(text)})); if (!el) return 'NOT FOUND text ' + ${JSON.stringify(text)}; el.click(); return 'ok'; })()`;
const keydown = (key, mods = {}) =>
  `(() => { const e = new KeyboardEvent('keydown', Object.assign({ key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }, ${JSON.stringify(mods)})); window.dispatchEvent(e); return 'sent'; })()`;
const ctxMenu = (sel, x, y) =>
  `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'NOT FOUND'; const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + (${x ?? 40}), clientY: r.top + (${y ?? 12}) })); return 'ok'; })()`;
const dismiss = `(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 400 })); return 'ok'; })()`;

async function main() {
  const main = await findTarget((t) => !t.url.includes("view="));
  const s = await connect(main);
  log("connected main:", main.title, main.url);

  // 统一窗口尺寸：若最大化则还原，保证按默认窗口尺寸（1120x720）评审
  const vp = await s.evalJs(`document.documentElement.clientWidth + "x" + document.documentElement.clientHeight`);
  log("viewport at start:", vp);
  if (Number(String(vp).split("x")[0]) > 1400) {
    await s.evalJs(`(() => { const b = [...document.querySelectorAll('.window-controls button')].find(x => x.getAttribute('aria-label') === '向下还原'); if (b) { b.click(); return 'restored'; } return 'no-restore-button'; })()`);
    await sleep(800);
    log("viewport after restore:", await s.evalJs(`document.documentElement.clientWidth + "x" + document.documentElement.clientHeight`));
  }

  const hover = async (sel) => {
    const pos = await s.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
    if (!pos || pos.__error) return "no element " + sel;
    // 先移出再移入，React 才能合成 mouseenter
    await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700, y: 500, buttons: 0 });
    await sleep(120);
    await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pos.x, y: pos.y, buttons: 0 });
    return "hovered";
  };
  const moveAway = async () => {
    await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700, y: 500, buttons: 0 });
    await sleep(200);
  };

  if (scenario === "empty") {
    await sleep(900);
    await shot(s, "01-empty-light");
    s.close();
    return;
  }

  if (scenario === "welcome") {
    await sleep(1000);
    await shot(s, "19-welcome-light");
    s.close();
    return;
  }

  if (scenario === "full") {
    await sleep(1200);
    await shot(s, "02-main-render-light");

    // 悬停工具栏按钮 → Tooltip（真实鼠标事件 + 600ms 延迟）
    await hover(".tool-button");
    await sleep(950);
    const tipVisible = await s.evalJs(`(() => { const t = document.querySelector('.lac-tooltip'); return t ? t.textContent : null; })()`);
    log("tooltip visible:", tipVisible);
    await shot(s, "03-tooltip-light");
    await moveAway();
    await sleep(300);

    // 代码文件
    await s.evalJs(click('[data-tab-id="doc-2"]'));
    await sleep(700);
    await shot(s, "04-code-light");

    // 大文件
    await s.evalJs(click('[data-tab-id="doc-3"]'));
    await sleep(700);
    await s.evalJs(click(".bigfile-trigger"));
    await sleep(500);
    await shot(s, "05-largefile-menu-light");
    await s.evalJs(dismiss);
    await sleep(200);

    // 未命名（脏）→ 关闭时保存提示
    await s.evalJs(click('[data-tab-id="doc-4"]'));
    await sleep(600);
    await s.evalJs(keydown("w", { ctrlKey: true }));
    await sleep(700);
    await shot(s, "06-saveprompt-light");
    await s.evalJs(clickText("取消"));
    await sleep(400);

    // 回到 markdown，切源码模式
    await s.evalJs(click('[data-tab-id="doc-1"]'));
    await sleep(600);
    await s.evalJs(click(".view-mode-toggle"));
    await sleep(700);
    await shot(s, "07-md-source-light");
    await s.evalJs(click(".view-mode-toggle")); // 回到渲染
    await sleep(500);

    // 标签右键菜单
    await s.evalJs(ctxMenu('[data-tab-id="doc-2"]', 60, 14));
    await sleep(500);
    await shot(s, "08-tab-menu-light");
    await s.evalJs(dismiss);
    await sleep(300);

    // 工具栏菜单
    const menuBtn = await s.evalJs(`(() => { const b = [...document.querySelectorAll('.tool-button')].find(x => x.querySelector('svg')); return 'ok'; })()`);
    await s.evalJs(`(() => { const btns = [...document.querySelectorAll('.tool-button')]; const b = btns[btns.length - 1]; if (b) { b.click(); return 'clicked-last'; } return 'none'; })()`);
    await sleep(500);
    await shot(s, "09-toolbar-menu-light");
    await s.evalJs(dismiss);
    await sleep(300);

    // 独立窗口
    await s.evalJs(keydown("f", { ctrlKey: true }));
    await sleep(1200);
    const find = await connect(await findTarget((t) => t.url.includes("view=find")).catch(() => null) ?? main);
    await shot(find, "10-find-light");
    find.close();

    await s.evalJs(keydown(",", { ctrlKey: true }));
    await sleep(1200);
    const settings = await connect(await findTarget((t) => t.url.includes("view=settings")).catch(() => null) ?? main);
    await shot(settings, "11-settings-light");
    settings.close();

    await s.evalJs(keydown("d", { ctrlKey: true, altKey: true }));
    await sleep(1200);
    const codec = await connect(await findTarget((t) => t.url.includes("view=codec")).catch(() => null) ?? main);
    await shot(codec, "12-codec-light");
    codec.close();

    log("console errors:", s.errors.length ? s.errors.join(" | ") : "(none)");
    s.close();
    return;
  }

  if (scenario === "dark") {
    await sleep(1200);
    await shot(s, "13-main-render-dark");
    await s.evalJs(click('[data-tab-id="doc-2"]'));
    await sleep(700);
    await shot(s, "14-code-dark");
    await s.evalJs(click('[data-tab-id="doc-1"]'));
    await sleep(600);
    await s.evalJs(click(".view-mode-toggle"));
    await sleep(700);
    await shot(s, "15-md-source-dark");
    await s.evalJs(click(".view-mode-toggle"));
    await sleep(400);
    await s.evalJs(click('[data-tab-id="doc-4"]'));
    await sleep(500);
    await s.evalJs(keydown("w", { ctrlKey: true }));
    await sleep(700);
    await shot(s, "16-saveprompt-dark");
    await s.evalJs(clickText("取消"));
    await sleep(300);
    await s.evalJs(keydown("f", { ctrlKey: true }));
    await sleep(1200);
    const find = await connect(await findTarget((t) => t.url.includes("view=find")).catch(() => null) ?? main);
    await shot(find, "17-find-dark");
    find.close();
    await s.evalJs(keydown(",", { ctrlKey: true }));
    await sleep(1200);
    const settings = await connect(await findTarget((t) => t.url.includes("view=settings")).catch(() => null) ?? main);
    await shot(settings, "18-settings-dark");
    settings.close();
    log("console errors:", s.errors.length ? s.errors.join(" | ") : "(none)");
    s.close();
    return;
  }
}

main().then(() => {
  fs.writeFileSync(path.join(outDir, "analysis.json"), JSON.stringify(analysis, null, 2));
  process.exit(0);
}).catch((e) => {
  console.error("FAILED:", e);
  fs.writeFileSync(path.join(outDir, "analysis.json"), JSON.stringify(analysis, null, 2));
  process.exit(1);
});
