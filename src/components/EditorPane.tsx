import { useEffect, useLayoutEffect, useRef } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { EditorView } from "@codemirror/view";
import { buildEditorState } from "../editor/extensions";
import {
  allViewIds,
  flushDocument,
  notifyTextChange,
  registerView,
  reportDirtyState,
  scheduleSync,
  setContentFactory,
  unregisterView,
  viewFor,
} from "../editor/registry";
import { EditorDocument, useDocuments } from "../state/documents";
import { featureEnabled } from "../state/performance";
import { indentUnitOf, usePreferences } from "../state/preferences";
import { directoryOf, resolveLocalImageSrc } from "../preview/markdownCore";
import { EditorEmptyState } from "./EditorEmptyState";

const INACTIVE_LIMIT = 3;
const TOTAL_BUDGET = 64 * 1024 * 1024;
const SINGLE_CAP = 24 * 1024 * 1024;

function viewCost(textLength: number): number {
  return textLength * 8;
}

interface EffectiveFeatures {
  livePreview: boolean;
  wordWrap: boolean;
  highlight: boolean;
  fold: boolean;
}

function effectiveFeatures(doc: EditorDocument): EffectiveFeatures {
  const prefs = usePreferences.getState();
  const tier = doc.perfTier;
  const ov = doc.featureOverrides;
  return {
    livePreview: featureEnabled("preview", tier, ov),
    wordWrap: prefs.wordWrap && featureEnabled("wordWrap", tier, ov),
    highlight: featureEnabled("highlight", tier, ov),
    fold: featureEnabled("fold", tier, ov),
  };
}

function featureSignature(f: EffectiveFeatures, doc: EditorDocument): string {
  // path 参与 signature：另存到新路径后图片相对路径的解析基准变了，需要重建视图
  return [f.livePreview, f.wordWrap, f.highlight, f.fold, doc.path ?? ""].join("|");
}

/** 已放行 asset 协议的目录（重复 invoke 无害，但省一次 IPC） */
const allowedAssetDirs = new Set<string>();

function ensureAssetScope(dir: string | null): void {
  if (!dir || allowedAssetDirs.has(dir)) return;
  allowedAssetDirs.add(dir);
  void invoke("allow_asset_directory", { path: dir }).catch(() => {
    allowedAssetDirs.delete(dir);
  });
}

/** 图片 src → 可显示 URL：本地路径走 asset 协议，外链原样，其余保持原文 */
function imageSrcResolverFor(baseDir: string | null) {
  return (raw: string): string | null => {
    if (/^(https?:|data:)/i.test(raw)) return raw;
    const local = resolveLocalImageSrc(baseDir, raw);
    if (!local) return null;
    return isTauri() ? convertFileSrc(local) : local;
  };
}

function createViewFor(doc: EditorDocument, text: string): EditorView {
  const prefs = usePreferences.getState();
  const features = effectiveFeatures(doc);
  const baseDir = doc.path ? directoryOf(doc.path) : null;
  if (features.livePreview) ensureAssetScope(baseDir);
  const state = buildEditorState({
    docId: doc.id,
    initialText: text,
    wordWrap: features.wordWrap,
    showLineNumbers: prefs.lineNumbers,
    fontSizePt: prefs.fontSizePt,
    lineSpacingPt: prefs.lineSpacingPt,
    indentUnitText: indentUnitOf(prefs.indentStyle, prefs.tabWidth),
    enableHighlight: features.highlight,
    enableFold: features.fold,
    enableLivePreview: features.livePreview,
    imageSrcResolver: features.livePreview ? imageSrcResolverFor(baseDir) : null,
    onUpdate: ({ state: nextState }) => {
      reportDirtyState(doc.id, nextState.doc.length, () =>
        nextState.doc.toString()
      );
      scheduleSync(doc.id);
      notifyTextChange(doc.id);
    },
    onCursor: (line, column) => {
      useDocuments.getState().setCursor(doc.id, line, column);
    },
  });
  return new EditorView({ state });
}

export function EditorPane() {
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);
  const prefsVersion = usePreferences((s) => s.prefsVersion);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastVersionRef = useRef(prefsVersion);
  const signatureRef = useRef(new Map<string, string>());
  const accessOrderRef = useRef<string[]>([]);

  useEffect(() => {
    setContentFactory((docId, text) => {
      const doc = useDocuments.getState().documents.find((d) => d.id === docId);
      return doc ? createViewFor(doc, text) : new EditorView({ doc: text });
    });
  }, []);

  useEffect(() => {
    const order = accessOrderRef.current;
    if (activeId) {
      const idx = order.indexOf(activeId);
      if (idx >= 0) order.splice(idx, 1);
      order.unshift(activeId);
    }
  }, [activeId]);

  useLayoutEffect(() => {
    const alive = new Set(documents.map((d) => d.id));

    for (const id of allViewIds()) {
      if (!alive.has(id)) {
        const view = viewFor(id);
        unregisterView(id);
        signatureRef.current.delete(id);
        const oi = accessOrderRef.current.indexOf(id);
        if (oi >= 0) accessOrderRef.current.splice(oi, 1);
        view?.destroy();
      }
    }

    // 无文档时渲染空状态、不挂载 cm-host，视图回收已在上方完成
    const container = containerRef.current;
    if (!container) return;

    const prefsChanged = lastVersionRef.current !== prefsVersion;
    lastVersionRef.current = prefsVersion;
    if (prefsChanged) {
      for (const doc of documents) flushDocument(doc.id);
      for (const id of allViewIds()) {
        const view = viewFor(id);
        unregisterView(id);
        signatureRef.current.delete(id);
        view?.destroy();
      }
    }

    for (const doc of documents) {
      const sig = featureSignature(effectiveFeatures(doc), doc);
      let view = viewFor(doc.id);
      const sigChanged = signatureRef.current.get(doc.id) !== sig;
      if (view && sigChanged) {
        flushDocument(doc.id);
        unregisterView(doc.id);
        view.destroy();
        view = undefined;
      }
      if (!view) {
        view = createViewFor(doc, doc.text);
        registerView(doc.id, view);
        signatureRef.current.set(doc.id, sig);
        container.appendChild(view.dom);
        const state = view.state;
        const line = Math.min(doc.cursorLine, state.doc.lines);
        const lineObj = state.doc.line(line);
        const anchor = Math.min(
          lineObj.from + Math.max(0, doc.cursorColumn - 1),
          lineObj.to
        );
        view.dispatch({ selection: { anchor } });
      }
      view.dom.dataset.docId = doc.id;
    }

    // 可见性同步按 DOM 遍历而不是按 registry：即使视图与 DOM 短暂失同步
    // （视图被重建、注册表先于 DOM 更新），也能保证只有一个编辑器可见
    syncVisibility(activeId);

    evictInactive(activeId);

    const activeView = activeId ? viewFor(activeId) : undefined;
    if (activeView) {
      // 视图在隐藏期间量到的是 0 尺寸，重新显示后必须再测一次
      activeView.requestMeasure();
      activeView.focus();
    }

    // 兜底：快速切换或视图重建后可能残留旧的可见态，下一帧按 store 最新 activeId
    // 再同步一次，保证「同一时刻只有一个编辑器可见」这条不变量
    const frame = window.requestAnimationFrame(() => {
      syncVisibility(useDocuments.getState().activeId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [documents, activeId, prefsVersion]);

  /**
   * 按 DOM 同步可见性：只显示 dataset.docId === activeIdNow 的那个编辑器。
   * 用 data 属性而不是 class —— CodeMirror 在 focus/blur 时会走
   * EditorView.updateAttrs() 整体重写 .cm-editor 的 class（含 cm-focused 与主题类），
   * 挂在同一个 class 列表上的隐藏类会被冲掉（切标签时焦点转移即触发）。
   */
  const syncVisibility = (activeIdNow: string | null) => {
    const container = containerRef.current;
    if (!container) return;
    for (const el of Array.from(container.children)) {
      if (!(el instanceof HTMLElement) || !el.classList.contains("cm-editor")) continue;
      if (el.dataset.docId === activeIdNow) el.removeAttribute("data-doc-hidden");
      else el.setAttribute("data-doc-hidden", "true");
    }
  };

  const evictInactive = (activeIdNow: string | null) => {
    const order = accessOrderRef.current;
    const inactive = order.filter((id) => id !== activeIdNow && viewFor(id));
    let totalCost = inactive.reduce((sum, id) => {
      const v = viewFor(id);
      return sum + (v ? viewCost(v.state.doc.length) : 0);
    }, 0);

    let i = inactive.length - 1;
    while (i >= 0) {
      const id = inactive[i];
      const v = viewFor(id);
      const cost = v ? viewCost(v.state.doc.length) : 0;
      const overCount = inactive.length > INACTIVE_LIMIT;
      const overBudget = totalCost > TOTAL_BUDGET;
      const overSingle = cost > SINGLE_CAP;
      if (overCount || overBudget || overSingle) {
        flushDocument(id);
        unregisterView(id);
        signatureRef.current.delete(id);
        v?.destroy();
        const oi = order.indexOf(id);
        if (oi >= 0) order.splice(oi, 1);
        inactive.splice(i, 1);
        totalCost -= cost;
      }
      i--;
    }
  };

  return (
    <div className="editor-pane">
      {documents.length === 0 ? (
        <EditorEmptyState />
      ) : (
        /* 所见即所得：唯一的编辑面，渲染与编辑在同一 CodeMirror 实例内完成 */
        <div className="cm-host" ref={containerRef} />
      )}
    </div>
  );
}
