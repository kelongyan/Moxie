import { EditorView } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import { useDocuments } from "../state/documents";

const SYNC_DELAY_MS = 350;

const views = new Map<string, EditorView>();
const syncTimers = new Map<string, number>();

let contentFactory: ((docId: string, text: string) => EditorView) | null = null;

export function setContentFactory(
  factory: (docId: string, text: string) => EditorView
) {
  contentFactory = factory;
}

export function replaceContent(docId: string, text: string) {
  const old = views.get(docId);
  if (!old || !contentFactory) return;
  const parent = old.dom.parentElement;
  const display = old.dom.style.display;
  const timer = syncTimers.get(docId);
  if (timer !== undefined) window.clearTimeout(timer);
  syncTimers.delete(docId);
  views.delete(docId);
  old.destroy();
  const next = contentFactory(docId, text);
  views.set(docId, next);
  if (parent) parent.appendChild(next.dom);
  next.dom.style.display = display;
}

export function registerView(docId: string, view: EditorView) {
  views.set(docId, view);
}

type TextChangeHandler = () => void;
const textListeners = new Map<string, Set<TextChangeHandler>>();

export function notifyTextChange(docId: string) {
  const handlers = textListeners.get(docId);
  if (handlers) {
    for (const handler of handlers) handler();
  }
}

export function subscribeTextChange(
  docId: string,
  handler: TextChangeHandler
): () => void {
  let handlers = textListeners.get(docId);
  if (!handlers) {
    handlers = new Set();
    textListeners.set(docId, handlers);
  }
  handlers.add(handler);
  return () => {
    handlers?.delete(handler);
  };
}

export function unregisterView(docId: string) {
  const timer = syncTimers.get(docId);
  if (timer !== undefined) window.clearTimeout(timer);
  syncTimers.delete(docId);
  views.delete(docId);
}

export function viewFor(docId: string): EditorView | undefined {
  return views.get(docId);
}

export function allViewIds(): string[] {
  return [...views.keys()];
}

function syncNow(docId: string) {
  const view = views.get(docId);
  if (!view) return;
  const text = view.state.doc.toString();
  useDocuments.getState().syncText(docId, text);
}

export function scheduleSync(docId: string) {
  const existing = syncTimers.get(docId);
  if (existing !== undefined) window.clearTimeout(existing);
  syncTimers.set(
    docId,
    window.setTimeout(() => {
      syncTimers.delete(docId);
      syncNow(docId);
    }, SYNC_DELAY_MS)
  );
}

export function flushDocument(docId: string) {
  const timer = syncTimers.get(docId);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    syncTimers.delete(docId);
  }
  syncNow(docId);
}

export function undoFor(docId: string) {
  const view = views.get(docId);
  if (view) undo(view);
}

export function redoFor(docId: string) {
  const view = views.get(docId);
  if (view) redo(view);
}

export function reportDirtyState(docId: string, docLength: number, readText: () => string) {
  const doc = useDocuments.getState().documents.find((d) => d.id === docId);
  if (!doc) return;
  const dirty =
    docLength !== doc.savedText.length || readText() !== doc.savedText;
  if (dirty !== doc.isDirty) {
    useDocuments.getState().markDirty(docId, dirty);
  }
}
