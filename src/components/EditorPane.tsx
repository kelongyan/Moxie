import { useEffect, useLayoutEffect, useRef } from "react";
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
import { EditorLanguage } from "../models/language";
import { EditorDocument, useDocuments } from "../state/documents";
import { featureEnabled } from "../state/performance";
import { indentUnitOf, usePreferences } from "../state/preferences";
import { MarkdownPreview } from "./MarkdownPreview";

const INACTIVE_LIMIT = 3;
const TOTAL_BUDGET = 64 * 1024 * 1024;
const SINGLE_CAP = 24 * 1024 * 1024;

function viewCost(textLength: number): number {
  return textLength * 8;
}

interface EffectiveFeatures {
  language: EditorLanguage;
  wordWrap: boolean;
  highlight: boolean;
  fold: boolean;
}

function effectiveFeatures(doc: EditorDocument): EffectiveFeatures {
  const prefs = usePreferences.getState();
  const tier = doc.perfTier;
  const ov = doc.featureOverrides;
  return {
    language: doc.language,
    wordWrap: prefs.wordWrap && featureEnabled("wordWrap", tier, ov),
    highlight: featureEnabled("highlight", tier, ov),
    fold: featureEnabled("fold", tier, ov),
  };
}

function featureSignature(f: EffectiveFeatures): string {
  return [f.language, f.wordWrap, f.highlight, f.fold].join("|");
}

function createViewFor(doc: EditorDocument, text: string): EditorView {
  const prefs = usePreferences.getState();
  const features = effectiveFeatures(doc);
  const state = buildEditorState({
    docId: doc.id,
    initialText: text,
    language: features.language,
    wordWrap: features.wordWrap,
    showLineNumbers: prefs.lineNumbers,
    fontSizePt: prefs.fontSizePt,
    lineSpacingPt: prefs.lineSpacingPt,
    indentUnitText: indentUnitOf(prefs.indentStyle, prefs.tabWidth),
    enableHighlight: features.highlight,
    enableFold: features.fold,
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
    const container = containerRef.current;
    if (!container) return;
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
      const sig = featureSignature(effectiveFeatures(doc));
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
      view.dom.style.display = doc.id === activeId ? "block" : "none";
    }

    evictInactive(activeId);

    const activeView = activeId ? viewFor(activeId) : undefined;
    if (activeView) activeView.focus();
  }, [documents, activeId, prefsVersion]);

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

  const activeDoc = documents.find((d) => d.id === activeId);
  const previewAllowed =
    !!activeDoc &&
    featureEnabled("preview", activeDoc.perfTier, activeDoc.featureOverrides);
  const showPreview =
    previewAllowed && activeDoc.language === "markdown" && activeDoc.previewVisible;

  return (
    <div className="editor-pane">
      <div className="cm-host" ref={containerRef} />
      {showPreview && activeDoc && <MarkdownPreview docId={activeDoc.id} />}
    </div>
  );
}
