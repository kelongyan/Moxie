import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorView } from "@codemirror/view";
import {
  cachedMatches,
  prepareQuery,
  selectionEqualsQuery,
} from "../editor/searchEngine";
import { clearSearchHighlight, setSearchMatches } from "../editor/searchHighlight";
import { flushDocument, viewFor } from "../editor/registry";
import { useDocuments } from "./documents";

export interface FindRequest {
  kind: "update" | "next" | "prev" | "replace-current" | "replace-all" | "closed";
  text?: string;
  replaceText?: string;
  caseSensitive?: boolean;
  interpretEscapes?: boolean;
}

export interface FindStatus {
  message: string;
  count: number;
  hasDocument: boolean;
}

interface Session {
  docId: string;
  query: string;
  replaceText: string;
  caseSensitive: boolean;
  interpretEscapes: boolean;
  positions: number[];
  index: number;
}

let session: Session | null = null;

async function emitStatus(status: FindStatus) {
  await getCurrentWindow().emit("find:status", status);
}

function activeViewWithText():
  | { view: EditorView; docId: string; revision: number; text: string }
  | null {
  const { documents, activeId } = useDocuments.getState();
  const doc = documents.find((d) => d.id === activeId);
  if (!doc) return null;
  flushDocument(doc.id);
  const view = viewFor(doc.id);
  if (!view) return null;
  const current = useDocuments.getState().documents.find((d) => d.id === doc.id);
  return {
    view,
    docId: doc.id,
    revision: current?.revision ?? 0,
    text: view.state.doc.toString(),
  };
}

function applyHighlights(view: EditorView, positions: number[], queryLength: number, current: number) {
  view.dispatch({
    effects: setSearchMatches.of({
      matches: positions.map((p) => ({ from: p, to: p + queryLength })),
      current,
    }),
  });
}

async function recompute(target: { view: EditorView; docId: string; revision: number; text: string }) {
  if (!session) return;
  const prepared = prepareQuery(session.query, {
    caseSensitive: session.caseSensitive,
    interpretEscapes: session.interpretEscapes,
  });
  if (!prepared) {
    session.positions = [];
    session.index = -1;
    clearSearchHighlight(target.view);
    return;
  }
  session.positions = cachedMatches(
    target.docId,
    target.revision,
    target.text,
    session.query,
    { caseSensitive: session.caseSensitive, interpretEscapes: session.interpretEscapes }
  );
  session.index = -1;
  applyHighlights(target.view, session.positions, prepared.length, session.index);
}

async function gotoMatch(direction: 1 | -1) {
  const target = activeViewWithText();
  if (!session) return;
  if (!target || target.docId !== session.docId) {
    await emitStatus({ message: "没有可搜索的文档", count: 0, hasDocument: false });
    return;
  }
  await recompute(target);
  const count = session.positions.length;
  if (count === 0) {
    await emitStatus({ message: "未找到匹配内容", count: 0, hasDocument: true });
    return;
  }
  const prepared = prepareQuery(session.query, {
    caseSensitive: session.caseSensitive,
    interpretEscapes: session.interpretEscapes,
  });
  session.index = session.index === -1
    ? (direction === 1 ? 0 : count - 1)
    : (session.index + direction + count) % count;
  const from = session.positions[session.index];
  applyHighlights(target.view, session.positions, prepared.length, session.index);
  target.view.dispatch({
    selection: { anchor: from, head: from + prepared.length },
    effects: EditorView.scrollIntoView(from, { y: "center" }),
  });
  await emitStatus({ message: "", count, hasDocument: true });
}

async function updateSession(request: FindRequest) {
  const target = activeViewWithText();
  session = {
    docId: target?.docId ?? "",
    query: request.text ?? "",
    replaceText: request.replaceText ?? "",
    caseSensitive: request.caseSensitive ?? false,
    interpretEscapes: request.interpretEscapes ?? true,
    positions: [],
    index: -1,
  };
  if (!target) {
    await emitStatus({ message: "", count: 0, hasDocument: false });
    return;
  }
  await recompute(target);
  const prepared = prepareQuery(session.query, {
    caseSensitive: session.caseSensitive,
    interpretEscapes: session.interpretEscapes,
  });
  if (prepared && session.positions.length > 0) {
    const head = target.view.state.selection.main.head;
    const after = session.positions.filter((p) => p >= head);
    session.index = after.length > 0
      ? session.positions.indexOf(after[0])
      : 0;
    applyHighlights(target.view, session.positions, prepared.length, session.index);
    await emitStatus({ message: `${session.positions.length} 个匹配`, count: session.positions.length, hasDocument: true });
  } else if (prepared) {
    await emitStatus({ message: "未找到匹配内容", count: 0, hasDocument: true });
  } else {
    await emitStatus({ message: "", count: 0, hasDocument: true });
  }
}

async function replaceCurrent() {
  if (!session) return;
  const target = activeViewWithText();
  if (!target || target.docId !== session.docId) {
    await emitStatus({ message: "没有可搜索的文档", count: 0, hasDocument: false });
    return;
  }
  await recompute(target);
  const prepared = prepareQuery(session.query, {
    caseSensitive: session.caseSensitive,
    interpretEscapes: session.interpretEscapes,
  });
  const replacement = prepareQuery(session.replaceText, {
    caseSensitive: session.caseSensitive,
    interpretEscapes: session.interpretEscapes,
  });
  const sel = target.view.state.selection.main;
  const selectedText = target.view.state.sliceDoc(sel.from, sel.to);
  if (prepared && selectionEqualsQuery(selectedText, prepared, session.caseSensitive)) {
    target.view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: replacement },
      selection: { anchor: sel.from, head: sel.from + replacement.length },
      userEvent: "input",
    });
  }
  await gotoMatch(1);
}

async function replaceAll() {
  if (!session) return;
  const target = activeViewWithText();
  if (!target || target.docId !== session.docId) {
    await emitStatus({ message: "没有可搜索的文档", count: 0, hasDocument: false });
    return;
  }
  await recompute(target);
  const prepared = prepareQuery(session.query, {
    caseSensitive: session.caseSensitive,
    interpretEscapes: session.interpretEscapes,
  });
  const replacement = prepareQuery(session.replaceText, {
    caseSensitive: session.caseSensitive,
    interpretEscapes: session.interpretEscapes,
  });
  if (!prepared || session.positions.length === 0) {
    await emitStatus({ message: "未找到匹配内容", count: 0, hasDocument: true });
    return;
  }
  const count = session.positions.length;
  const changes = session.positions.map((from) => ({
    from,
    to: from + prepared.length,
    insert: replacement,
  }));
  target.view.dispatch({ changes, userEvent: "input" });
  session.index = -1;
  await recompute(target);
  await emitStatus({ message: `已替换 ${count} 处`, count: 0, hasDocument: true });
}

export async function initFindSession() {
  return listen<FindRequest>("find:request", (event) => {
    const request = event.payload;
    switch (request.kind) {
      case "update":
        void updateSession(request);
        break;
      case "next":
        void gotoMatch(1);
        break;
      case "prev":
        void gotoMatch(-1);
        break;
      case "replace-current":
        void replaceCurrent();
        break;
      case "replace-all":
        void replaceAll();
        break;
      case "closed": {
        session = null;
        const target = activeViewWithText();
        if (target) clearSearchHighlight(target.view);
        break;
      }
    }
  });
}

export function hasActiveFindQuery(): boolean {
  return session !== null && session.query.length > 0;
}

export function forwardFindNavigation(direction: 1 | -1) {
  void gotoMatch(direction);
}
