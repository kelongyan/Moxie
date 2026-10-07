import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorView } from "@codemirror/view";
import {
  cachedMatches,
  MatchRange,
  prepareQuery,
  selectionMatchesQuery,
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
  useRegex?: boolean;
  wholeWord?: boolean;
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
  useRegex: boolean;
  wholeWord: boolean;
  ranges: MatchRange[];
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

function optionsOf(s: Session) {
  return {
    caseSensitive: s.caseSensitive,
    interpretEscapes: s.interpretEscapes,
    useRegex: s.useRegex,
    wholeWord: s.wholeWord,
  };
}

function applyHighlights(view: EditorView, ranges: MatchRange[], current: number) {
  view.dispatch({
    effects: setSearchMatches.of({ matches: ranges, current }),
  });
}

function preparedOf(s: Session): string {
  return prepareQuery(s.query, optionsOf(s));
}

async function recompute(target: {
  view: EditorView;
  docId: string;
  revision: number;
  text: string;
}) {
  if (!session) return;
  const result = cachedMatches(
    target.docId,
    target.revision,
    target.text,
    session.query,
    optionsOf(session)
  );
  if (result.error) {
    session.ranges = [];
    session.index = -1;
    clearSearchHighlight(target.view);
    await emitStatus({
      message: result.error,
      count: 0,
      hasDocument: true,
    });
    return;
  }
  session.ranges = result.ranges;
  session.index = -1;
  applyHighlights(target.view, session.ranges, session.index);
}

async function gotoMatch(direction: 1 | -1) {
  if (!session) return;
  const target = activeViewWithText();
  if (!target || target.docId !== session.docId) {
    await emitStatus({ message: "没有可搜索的文档", count: 0, hasDocument: false });
    return;
  }
  await recompute(target);
  const count = session.ranges.length;
  if (count === 0) {
    await emitStatus({ message: "未找到匹配内容", count: 0, hasDocument: true });
    return;
  }
  session.index = session.index === -1
    ? (direction === 1 ? 0 : count - 1)
    : (session.index + direction + count) % count;
  const range = session.ranges[session.index];
  applyHighlights(target.view, session.ranges, session.index);
  target.view.dispatch({
    selection: { anchor: range.from, head: range.to },
    effects: EditorView.scrollIntoView(range.from, { y: "center" }),
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
    useRegex: request.useRegex ?? false,
    wholeWord: request.wholeWord ?? false,
    ranges: [],
    index: -1,
  };
  if (!target) {
    await emitStatus({ message: "", count: 0, hasDocument: false });
    return;
  }
  await recompute(target);
  if (session.ranges.length > 0) {
    const head = target.view.state.selection.main.head;
    const after = session.ranges.filter((r) => r.from >= head);
    session.index = after.length > 0
      ? session.ranges.indexOf(after[0])
      : 0;
    applyHighlights(target.view, session.ranges, session.index);
    await emitStatus({
      message: `${session.ranges.length} 个匹配`,
      count: session.ranges.length,
      hasDocument: true,
    });
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
  const prepared = preparedOf(session);
  const sel = target.view.state.selection.main;
  const selectedText = target.view.state.sliceDoc(sel.from, sel.to);
  if (
    prepared &&
    selectionMatchesQuery(selectedText, prepared, optionsOf(session))
  ) {
    target.view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: session.replaceText },
      selection: { anchor: sel.from, head: sel.from + session.replaceText.length },
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
  if (session.ranges.length === 0) {
    await emitStatus({ message: "未找到匹配内容", count: 0, hasDocument: true });
    return;
  }
  const count = session.ranges.length;
  const changes = session.ranges.map((r) => ({
    from: r.from,
    to: r.to,
    insert: session!.replaceText,
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
