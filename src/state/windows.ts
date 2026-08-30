import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { getAllWindows, getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { flushDocument } from "../editor/registry";
import { EditorDocument, useDocuments } from "./documents";
import { RestoredDocMeta } from "./recovery";

export const MAIN_LABEL = "main";
const EDITOR_PREFIX = "editor-";

export function isEditorLabel(label: string): boolean {
  return label === MAIN_LABEL || label.startsWith(EDITOR_PREFIX);
}

export async function editorWindowLabels(): Promise<string[]> {
  const wins = await getAllWindows();
  return wins.filter((w) => isEditorLabel(w.label)).map((w) => w.label);
}

export async function otherEditorWindows(): Promise<string[]> {
  const mine = getCurrentWindow().label;
  const labels = await editorWindowLabels();
  return labels.filter((l) => l !== mine);
}

export interface DocTransferPayload {
  meta: RestoredDocMeta;
  content: string;
}

export function snapshotDocument(doc: EditorDocument, text: string): DocTransferPayload {
  return {
    meta: {
      docId: doc.id,
      name: doc.name,
      path: doc.path,
      language: doc.language,
      encoding: doc.encoding,
      lineEnding: doc.lineEnding,
      isDirty: doc.isDirty,
      cursorLine: doc.cursorLine,
      cursorColumn: doc.cursorColumn,
      previewVisible: doc.previewVisible,
      perfTier: doc.perfTier,
      perfBytes: doc.perfBytes,
    },
    content: text,
  };
}

function importPayload(payload: DocTransferPayload) {
  const store = useDocuments.getState();
  const meta = payload.meta;
  const id = store.addRestored({
    name: meta.name ?? "未命名",
    path: meta.path ?? null,
    language: meta.language ?? "plaintext",
    encoding: meta.encoding ?? "utf-8",
    lineEnding: meta.lineEnding ?? "lf",
    cursorLine: meta.cursorLine ?? 1,
    cursorColumn: meta.cursorColumn ?? 1,
    previewVisible: meta.previewVisible ?? false,
    perfTier: meta.perfTier ?? "standard",
    perfBytes: meta.perfBytes ?? 0,
    text: payload.content,
    savedText: meta.isDirty ? "" : payload.content,
    isDirty: Boolean(meta.isDirty),
  });
  store.setActive(id);
}

const pendingSpawns = new Map<string, DocTransferPayload>();

function currentDocText(docId: string): string {
  flushDocument(docId);
  return useDocuments.getState().documents.find((d) => d.id === docId)?.text ?? "";
}

export async function moveDocToNewWindow(docId: string): Promise<void> {
  const doc = useDocuments.getState().documents.find((d) => d.id === docId);
  if (!doc) return;
  const text = currentDocText(docId);
  const payload = snapshotDocument(doc, text);

  const label = `${EDITOR_PREFIX}${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  pendingSpawns.set(label, payload);

  const url = `${location.origin}${location.pathname}?view=main&spawn=1`;
  try {
    const win = new WebviewWindow(label, {
      url,
      title: "Moxie",
      width: 1120,
      height: 720,
      minWidth: 900,
      minHeight: 560,
      center: true,
      decorations: false,
    });
    win.once("tauri://error", (event) => {
      console.error("[spawn] window error:", label, event);
    });
  } catch (error) {
    console.error("[spawn] create threw:", label, error);
    pendingSpawns.delete(label);
    return;
  }

  useDocuments.getState().close(docId);
  if (useDocuments.getState().documents.length === 0) {
    useDocuments.getState().createUntitled();
  }
}

export async function moveDocToWindow(docId: string, targetLabel: string): Promise<void> {
  const doc = useDocuments.getState().documents.find((d) => d.id === docId);
  if (!doc) return;
  const text = currentDocText(docId);
  const payload = snapshotDocument(doc, text);
  await emitTo(targetLabel, "window:import", payload);
  useDocuments.getState().close(docId);
  if (useDocuments.getState().documents.length === 0) {
    useDocuments.getState().createUntitled();
  }
  const wins = await getAllWindows();
  const target = wins.find((w) => w.label === targetLabel);
  if (target) {
    await target.setFocus();
  }
}

export function initWindowTransfer() {
  void listen<DocTransferPayload>("window:import", (event) => {
    importPayload(event.payload);
    void getCurrentWindow().setFocus();
  });

  void listen<{ label: string }>("spawn:ready", (event) => {
    const payload = pendingSpawns.get(event.payload.label);
    if (!payload) return;
    pendingSpawns.delete(event.payload.label);
    void emitTo(event.payload.label, "spawn:payload", payload);
  });
}

export async function initSpawnedWindow(): Promise<boolean> {
  const myLabel = getCurrentWindow().label;
  let received = false;

  const unlisten = await listen<DocTransferPayload>("spawn:payload", (event) => {
    received = true;
    importPayload(event.payload);
  });

  await emit("spawn:ready", { label: myLabel });

  const start = Date.now();
  while (!received && Date.now() - start < 3000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  unlisten();
  return received;
}
