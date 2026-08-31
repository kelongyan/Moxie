import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { Download, List, Printer } from "lucide-react";
import morphdom from "morphdom";
import { subscribeTextChange, viewFor } from "../editor/registry";
import { useDocuments } from "../state/documents";
import { usePreferences } from "../state/preferences";
import { useThemeStore } from "../state/theme";
import { exportPreviewHtml } from "../preview/exportHtml";
import {
  collectPreviewTokens,
  directoryOf,
  resolveImagePlaceholders,
  renderShell,
  sanitizeHtml,
  taskToggleInLine,
} from "../preview/markdown";
import { renderPreviewHtml } from "../preview/renderWorker";

function useResolvedDark(): boolean {
  const mode = useThemeStore((s) => s.mode);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return mode === "dark" || (mode === "system" && systemDark);
}

function toAssetUrl(absPath: string): string {
  return isTauri() ? convertFileSrc(absPath) : absPath;
}

const MIN_PCT = 25;
const MAX_PCT = 75;

// 自适应渲染调度：文档越长，防抖越久，避免输入时频繁阻塞
const DEBOUNCE_FAST_LEN = 20_000;
const DEBOUNCE_SLOW_LEN = 100_000;
const DEBOUNCE_FAST_MS = 120;
const DEBOUNCE_MID_MS = 250;
const DEBOUNCE_SLOW_MS = 350;
// 单次渲染超过该阈值视为“慢渲染”，顶栏提示降级
const SLOW_RENDER_MS = 50;

function debounceForLength(len: number): number {
  if (len < DEBOUNCE_FAST_LEN) return DEBOUNCE_FAST_MS;
  if (len < DEBOUNCE_SLOW_LEN) return DEBOUNCE_MID_MS;
  return DEBOUNCE_SLOW_MS;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

interface OutlineItem {
  line: number;
  level: number;
  text: string;
}

// 记忆每个文档预览的顶部源码行，切换标签再回来时恢复
const rememberedLines = new Map<string, number>();

function toggleTaskAtLine(docId: string, line0: number): void {
  const view = viewFor(docId);
  if (!view) return;
  const doc = view.state.doc;
  if (line0 < 0 || line0 >= doc.lines) return;
  const line = doc.line(line0 + 1);
  const toggle = taskToggleInLine(line.text);
  if (!toggle) return;
  const from = line.from + toggle.index;
  view.dispatch({
    changes: { from, to: from + 3, insert: toggle.insert },
    userEvent: "input",
  });
}

export function MarkdownPreview({ docId }: { docId: string }) {
  const dark = useResolvedDark();
  const [basisPct, setBasisPct] = useState(42);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const doc = useDocuments((s) => s.documents.find((d) => d.id === docId));
  const baseDir = doc?.path ? directoryOf(doc.path) : null;
  const mdBreaks = usePreferences((s) => s.markdownBreaks);
  const mdTypographer = usePreferences((s) => s.markdownTypographer);
  const mdAllowHtml = usePreferences((s) => s.markdownAllowHtml);

  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [activeLine, setActiveLine] = useState(0);
  const [slowRender, setSlowRender] = useState(false);
  const outlineBoxRef = useRef<HTMLDivElement | null>(null);

  // 收集渲染所需的最新值，供挂载到 iframe/编辑器的长生命周期监听器读取
  const docIdRef = useRef(docId);
  docIdRef.current = docId;
  const baseDirRef = useRef(baseDir);
  baseDirRef.current = baseDir;
  const optsRef = useRef({ breaks: mdBreaks, typographer: mdTypographer, allowHtml: mdAllowHtml });
  optsRef.current = { breaks: mdBreaks, typographer: mdTypographer, allowHtml: mdAllowHtml };

  // 滚动同步方向锁：记录最近一次由哪一侧发起，避免互相触发成环
  const lockRef = useRef<{ source: "editor" | "preview" | null; timer: number | null }>({
    source: null,
    timer: null,
  });
  const armLock = (source: "editor" | "preview") => {
    const lock = lockRef.current;
    lock.source = source;
    if (lock.timer !== null) window.clearTimeout(lock.timer);
    lock.timer = window.setTimeout(() => {
      lock.source = null;
      lock.timer = null;
    }, 120);
  };

  // collectPreviewTokens 读当前主题，dark 变化时重建外壳
  const shell = useMemo(
    () => renderShell(collectPreviewTokens(), doc?.name ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dark, doc?.name]
  );

  const blockForLine = (article: Element, line: number): HTMLElement | null => {
    const blocks = article.querySelectorAll<HTMLElement>("[data-line]");
    let best: HTMLElement | null = null;
    let bestLine = -1;
    for (const el of Array.from(blocks)) {
      const l = Number(el.dataset.line);
      if (l <= line && l > bestLine) {
        bestLine = l;
        best = el;
      }
    }
    return best;
  };

  const scrollPreviewToLine = (line: number) => {
    const win = iframeRef.current?.contentWindow;
    const article = win?.document.querySelector("article");
    if (!win || !article) return;
    const el = blockForLine(article, line);
    if (!el) return;
    win.scrollTo(0, Math.max(0, el.offsetTop - 8));
  };

  const extractOutline = (article: Element): OutlineItem[] => {
    const items: OutlineItem[] = [];
    article
      .querySelectorAll<HTMLElement>(
        "h1[data-line],h2[data-line],h3[data-line],h4[data-line],h5[data-line],h6[data-line]"
      )
      .forEach((h) => {
        const text = (h.textContent ?? "").trim();
        if (!text) return;
        items.push({
          line: Number(h.dataset.line),
          level: Number(h.tagName.slice(1)),
          text,
        });
      });
    return items;
  };

  const applyBodyRef = useRef<() => void>(() => {});
  const ensureEditorBoundRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let renderSeq = 0;

    const applyBody = async () => {
      const win = iframeRef.current?.contentWindow;
      const iframeDoc = win?.document;
      if (!win || !iframeDoc) return;
      const view = viewFor(docIdRef.current);
      if (!view) return;
      const article = iframeDoc.querySelector("article");
      if (!article) return;
      const text = view.state.doc.toString();
      const started = performance.now();
      const seq = ++renderSeq;
      // 渲染核心在 Worker 中执行（失败自动回退主线程），主线程只做净化/换 URL/打补丁
      let html = await renderPreviewHtml({
        text,
        baseDir: baseDirRef.current,
        breaks: optsRef.current.breaks,
        typographer: optsRef.current.typographer,
        allowHtml: optsRef.current.allowHtml,
      });
      if (cancelled || seq !== renderSeq) return;
      if (optsRef.current.allowHtml) html = sanitizeHtml(html);
      html = resolveImagePlaceholders(html, toAssetUrl);
      // morphdom 差量补丁：保留未变节点与滚动位置，避免整棵 DOM 重建
      const template = iframeDoc.createElement("article");
      template.innerHTML = html;
      morphdom(article, template);
      setOutline(extractOutline(article));
      setSlowRender(performance.now() - started > SLOW_RENDER_MS);
      const remembered = rememberedLines.get(docIdRef.current);
      if (remembered !== undefined) {
        const el = blockForLine(article, remembered);
        if (el) win.scrollTo(0, Math.max(0, el.offsetTop - 8));
      }
      ensureEditorBoundRef.current();
    };
    applyBodyRef.current = () => {
      void applyBody();
    };

    // 图片要在 scope 放行之后才能加载成功，首次渲染前等待一次
    const scopeReady = baseDir
      ? invoke("allow_asset_directory", { path: baseDir }).catch(() => undefined)
      : Promise.resolve();
    void scopeReady.then(() => {
      if (!cancelled) void applyBody();
    });

    const unsubscribe = subscribeTextChange(docId, () => {
      if (timer !== null) window.clearTimeout(timer);
      const len = viewFor(docId)?.state.doc.length ?? 0;
      const delay = debounceForLength(len);
      timer = window.setTimeout(() => {
        // 超长文档尽量在空闲帧渲染，减少对输入的抢占
        const idle = (window as unknown as {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
        }).requestIdleCallback;
        if (len >= DEBOUNCE_SLOW_LEN && typeof idle === "function") {
          idle(() => void applyBody(), { timeout: 300 });
        } else {
          void applyBody();
        }
      }, delay);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [docId, baseDir, mdBreaks, mdTypographer, mdAllowHtml]);

  // —— 编辑器滚动监听：视图可能被重建，需按当前 scrollDOM 绑定 ——
  const boundEditorElRef = useRef<HTMLElement | null>(null);
  const boundEditorCleanupRef = useRef<(() => void) | null>(null);
  const editorScrollRef = useRef<() => void>(() => {});

  editorScrollRef.current = () => {
    if (lockRef.current.source === "preview") return;
    const view = viewFor(docIdRef.current);
    if (!view) return;
    armLock("editor");
    // 用滚动位置直接取顶部行，避免 viewport 的陈旧值
    const topBlock = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
    const line = view.state.doc.lineAt(topBlock.from).number - 1;
    rememberedLines.set(docIdRef.current, line);
    setActiveLine((prev) => (prev === line ? prev : line));
    scrollPreviewToLine(line);
  };

  ensureEditorBoundRef.current = () => {
    const el = viewFor(docIdRef.current)?.scrollDOM ?? null;
    if (!el) return;
    if (boundEditorElRef.current === el) return;
    boundEditorCleanupRef.current?.();
    let raf = 0;
    const handler = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        editorScrollRef.current();
      });
    };
    el.addEventListener("scroll", handler, { passive: true });
    boundEditorElRef.current = el;
    boundEditorCleanupRef.current = () => {
      el.removeEventListener("scroll", handler);
      if (raf) window.cancelAnimationFrame(raf);
    };
  };

  useEffect(() => {
    return () => {
      boundEditorCleanupRef.current?.();
      boundEditorCleanupRef.current = null;
      boundEditorElRef.current = null;
    };
  }, [docId]);

  const attachIframeListeners = () => {
    const win = iframeRef.current?.contentWindow;
    const iframeDoc = iframeRef.current?.contentDocument;
    if (!win || !iframeDoc) return;

    iframeDoc.addEventListener("click", (event) => {
      const origin = event.target as Element | null;
      if (!origin || typeof origin.closest !== "function") return;
      const anchor = origin.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      event.preventDefault();
      if (href.startsWith("#")) {
        try {
          iframeDoc
            .getElementById(decodeURIComponent(href.slice(1)))
            ?.scrollIntoView({ behavior: scrollBehavior() });
        } catch {
          // 锚点不存在或非法，忽略
        }
        return;
      }
      if (/^https?:\/\//i.test(href)) {
        void invoke("open_external", { url: href });
      }
    });

    // 任务清单勾选回写源文件
    iframeDoc.addEventListener(
      "change",
      (event) => {
        const target = event.target as HTMLInputElement | null;
        if (!target || target.tagName !== "INPUT" || target.type !== "checkbox") return;
        const li = target.closest("li.task-list-item");
        if (!li) return;
        const lineAttr = li.getAttribute("data-line");
        if (lineAttr === null) return;
        toggleTaskAtLine(docIdRef.current, Number(lineAttr));
      },
      true
    );

    // 预览滚动 → 同步编辑器
    let raf = 0;
    win.addEventListener(
      "scroll",
      () => {
        if (raf) return;
        raf = win.requestAnimationFrame(() => {
          raf = 0;
          if (lockRef.current.source === "editor") return;
          const article = win.document.querySelector("article");
          if (!article) return;
          armLock("preview");
          const top = win.scrollY;
          const blocks = article.querySelectorAll<HTMLElement>("[data-line]");
          let best: HTMLElement | null = null;
          let bestTop = -Infinity;
          for (const el of Array.from(blocks)) {
            const t = el.offsetTop;
            if (t <= top + 12 && t > bestTop) {
              bestTop = t;
              best = el;
            }
          }
          const line = best ? Number(best.dataset.line) : 0;
          rememberedLines.set(docIdRef.current, line);
          setActiveLine((prev) => (prev === line ? prev : line));
          const view = viewFor(docIdRef.current);
          if (!view) return;
          const cmLine = view.state.doc.line(
            Math.min(line + 1, view.state.doc.lines)
          );
          view.scrollDOM.scrollTop = view.lineBlockAt(cmLine.from).top;
        });
      },
      { passive: true }
    );

    // error 事件不冒泡，用捕获阶段兜住加载失败的图片
    iframeDoc.addEventListener(
      "error",
      (event) => {
        const img = event.target as HTMLElement | null;
        if (!img || img.tagName !== "IMG") return;
        const src = img.getAttribute("src") ?? "";
        const name = src.split(/[\\/]/).pop() || "图片";
        const placeholder = iframeDoc.createElement("span");
        placeholder.className = "img-broken";
        placeholder.textContent = `图片不可用:${name}`;
        img.replaceWith(placeholder);
      },
      true
    );
  };

  const handleLoad = () => {
    attachIframeListeners();
    applyBodyRef.current();
  };

  // 大纲下拉点击外部关闭
  useEffect(() => {
    if (!outlineOpen) return;
    const onDown = (e: MouseEvent) => {
      if (outlineBoxRef.current && !outlineBoxRef.current.contains(e.target as Node)) {
        setOutlineOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [outlineOpen]);

  const jumpToLine = (line: number) => {
    rememberedLines.set(docIdRef.current, line);
    setOutlineOpen(false);
    scrollPreviewToLine(line);
  };

  const activeHeading = useMemo(() => {
    let current: OutlineItem | null = null;
    for (const item of outline) {
      if (item.line <= activeLine) current = item;
      else break;
    }
    return current;
  }, [outline, activeLine]);

  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const host = e.currentTarget.parentElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const pct = 100 - ((ev.clientX - rect.left) / rect.width) * 100;
      setBasisPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  const exportingRef = useRef(false);
  const handleExport = async () => {
    if (exportingRef.current) return;
    const view = viewFor(docIdRef.current);
    if (!view) return;
    exportingRef.current = true;
    try {
      const saved = await exportPreviewHtml({
        tokens: collectPreviewTokens(),
        title: doc?.name ?? "",
        text: view.state.doc.toString(),
        baseDir: baseDirRef.current,
        breaks: optsRef.current.breaks,
        typographer: optsRef.current.typographer,
        allowHtml: optsRef.current.allowHtml,
      });
      useDocuments
        .getState()
        .setStatus(saved ? { text: "预览已导出为 HTML", kind: "info" } : null);
    } catch (error) {
      useDocuments
        .getState()
        .setStatus({ text: `导出失败:${String(error)}`, kind: "error" });
    } finally {
      exportingRef.current = false;
    }
  };

  return (
    <>
      <div
        className="preview-splitter"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startDrag}
      />
      <div className="preview-pane" style={{ flexBasis: `${basisPct}%` }}>
        <div className="preview-toolbar">
          <span className="preview-toolbar-title">
            {doc?.name ?? ""}
            {slowRender && (
              <span className="preview-slow-hint" title="文档较大，预览渲染已降速">
                渲染降速
              </span>
            )}
          </span>
          <div className="preview-toolbar-actions">
            <div className="preview-outline" ref={outlineBoxRef}>
              <button
                className="preview-outline-trigger"
                onClick={() => setOutlineOpen((v) => !v)}
                disabled={outline.length === 0}
                aria-label="预览大纲"
                aria-expanded={outlineOpen}
                aria-haspopup="menu"
                title="大纲"
              >
                <List size={14} />
              </button>
              {outlineOpen && outline.length > 0 && (
                <div className="preview-outline-menu" role="menu">
                  {outline.map((item) => (
                    <button
                      key={`${item.line}-${item.text}`}
                      role="menuitem"
                      className={
                        "preview-outline-item lvl-" +
                        item.level +
                        (activeHeading === item ? " active" : "")
                      }
                      onClick={() => jumpToLine(item.line)}
                    >
                      {item.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="preview-outline-trigger"
              onClick={handlePrint}
              aria-label="打印预览"
              title="打印"
            >
              <Printer size={14} />
            </button>
            <button
              className="preview-outline-trigger"
              onClick={() => void handleExport()}
              aria-label="导出为 HTML"
              title="导出为 HTML"
            >
              <Download size={14} />
            </button>
          </div>
        </div>
        <iframe
          ref={iframeRef}
          className="preview-iframe"
          sandbox="allow-same-origin"
          srcDoc={shell}
          onLoad={handleLoad}
          title="Markdown 预览"
        />
      </div>
    </>
  );
}
