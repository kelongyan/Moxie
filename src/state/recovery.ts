import { invoke } from "@tauri-apps/api/core";
import { flushDocument } from "../editor/registry";
import { EditorDocument, useDocuments } from "./documents";
import { EditorLanguage } from "../models/language";

export interface RecoveryEntryDto {
  docId: string;
  meta: string;
  content: string;
}

export interface WorkspaceSnapshotDto {
  manifest: string;
  docs: [string, string][];
}

export interface RestoredDocMeta {
  docId?: string;
  name?: string;
  path?: string | null;
  language?: EditorLanguage;
  encoding?: string;
  lineEnding?: "lf" | "crlf" | "cr";
  isDirty?: boolean;
  cursorLine?: number;
  cursorColumn?: number;
  previewVisible?: boolean;
  perfTier?: "standard" | "large" | "extreme";
  perfBytes?: number;
}

export interface RestorePlanItem {
  meta: RestoredDocMeta;
  content: string;
  source: "crash" | "workspace";
}

export function buildRestorePlan(
  crashEntries: { meta: RestoredDocMeta; content: string }[],
  workspaceDocs: { meta: RestoredDocMeta; content: string }[]
): RestorePlanItem[] {
  const items: RestorePlanItem[] = [];
  const seen = new Set<string>();

  for (const entry of crashEntries) {
    const key = entry.meta.path ?? entry.meta.docId ?? `crash:${items.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ meta: entry.meta, content: entry.content, source: "crash" });
  }

  for (const doc of workspaceDocs) {
    const key = doc.meta.path ?? doc.meta.docId ?? `ws:${items.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ meta: doc.meta, content: doc.content, source: "workspace" });
  }

  return items;
}

function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let session = "";

export function currentSession(): string {
  return session;
}

export async function adoptSession(): Promise<void> {
  if (session) return;
  let marker: string | null = null;
  try {
    marker = await invoke<string | null>("recovery_read_marker");
  } catch {
    marker = null;
  }
  if (marker) {
    session = marker;
    return;
  }
  session = newSessionId();
  try {
    await invoke("recovery_write_marker", { session });
  } catch {
    // best effort
  }
}

function docRecoveryMeta(doc: EditorDocument): string {
  return JSON.stringify({
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
  });
}

async function persistDoc(docId: string) {
  const doc = useDocuments.getState().documents.find((d) => d.id === docId);
  if (!doc || !doc.isDirty || !session) return;
  flushDocument(docId);
  const current = useDocuments.getState().documents.find((d) => d.id === docId);
  if (!current || !current.isDirty) return;
  try {
    await invoke("recovery_save_doc", {
      session,
      docId,
      meta: docRecoveryMeta(current),
      content: current.text,
    });
  } catch {
    // ignore persistence failures
  }
}

function discardDoc(docId: string) {
  if (!session) return;
  void invoke("recovery_remove_doc", { session, docId }).catch(() => {});
}

const pendingTimers = new Map<string, number>();

function schedulePersist(doc: EditorDocument) {
  const existing = pendingTimers.get(doc.id);
  if (existing !== undefined) window.clearTimeout(existing);
  const delay = doc.perfTier === "standard" ? 2000 : 5000;
  pendingTimers.set(
    doc.id,
    window.setTimeout(() => {
      pendingTimers.delete(doc.id);
      void persistDoc(doc.id);
    }, delay)
  );
}

export function flushAllRecoveryNow() {
  for (const [docId, timer] of [...pendingTimers]) {
    window.clearTimeout(timer);
    pendingTimers.delete(docId);
  }
  const docs = useDocuments.getState().documents;
  for (const doc of docs) {
    if (doc.isDirty) void persistDoc(doc.id);
  }
}

export function initRecoveryPersistence() {
  void adoptSession();
  const previousDirty = new Map<string, boolean>();

  useDocuments.subscribe((state, prev) => {
    if (state.documents === prev.documents) return;

    const currentIds = new Set(state.documents.map((d) => d.id));
    for (const prevDoc of prev.documents) {
      if (!currentIds.has(prevDoc.id)) {
        const timer = pendingTimers.get(prevDoc.id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          pendingTimers.delete(prevDoc.id);
        }
        if (previousDirty.get(prevDoc.id)) discardDoc(prevDoc.id);
        previousDirty.delete(prevDoc.id);
      }
    }

    for (const doc of state.documents) {
      const wasDirty = previousDirty.get(doc.id) ?? false;
      if (doc.isDirty && !wasDirty) {
        schedulePersist(doc);
      } else if (doc.isDirty && wasDirty) {
        const prevDoc = prev.documents.find((d) => d.id === doc.id);
        if (prevDoc && prevDoc.text !== doc.text) schedulePersist(doc);
      } else if (!doc.isDirty && wasDirty) {
        const timer = pendingTimers.get(doc.id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          pendingTimers.delete(doc.id);
        }
        discardDoc(doc.id);
      }
      previousDirty.set(doc.id, doc.isDirty);
    }
  });

  window.addEventListener("blur", flushAllRecoveryNow);
}

function addRestoredDoc(item: RestorePlanItem): string {
  const store = useDocuments.getState();
  const meta = item.meta;
  const forcedDirty = item.source === "crash" ? true : Boolean(meta.isDirty);
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
    text: item.content,
    savedText: forcedDirty ? "" : item.content,
    isDirty: forcedDirty,
  });
  return id;
}

export async function restoreOnStartup(): Promise<void> {
  let oldMarker: string | null = null;
  try {
    oldMarker = await invoke<string | null>("recovery_read_marker");
  } catch {
    oldMarker = null;
  }

  const crashEntries: { meta: RestoredDocMeta; content: string }[] = [];
  if (oldMarker) {
    try {
      const entries = await invoke<RecoveryEntryDto[]>("recovery_load", {
        session: oldMarker,
      });
      for (const entry of entries) {
        try {
          const meta = JSON.parse(entry.meta) as RestoredDocMeta;
          crashEntries.push({ meta, content: entry.content });
        } catch {
          // skip malformed entry
        }
      }
    } catch {
      // unreadable session
    }
  }

  let workspaceDocs: { meta: RestoredDocMeta; content: string }[] = [];
  let workspaceActiveId: string | null = null;
  try {
    const snap = await invoke<WorkspaceSnapshotDto | null>(
      "workspace_load_and_consume"
    );
    if (snap) {
      const manifest = JSON.parse(snap.manifest) as {
        activeDocId?: string;
        docs?: RestoredDocMeta[];
      };
      workspaceActiveId = manifest.activeDocId ?? null;
      const contentById = new Map(snap.docs);
      for (const meta of manifest.docs ?? []) {
        const content = contentById.get(meta.docId ?? "") ?? "";
        workspaceDocs.push({ meta, content });
      }
    }
  } catch {
    workspaceDocs = [];
  }

  session = newSessionId();
  try {
    await invoke("recovery_cleanup", { keepSession: session });
    await invoke("recovery_write_marker", { session });
  } catch {
    // best effort
  }

  const plan = buildRestorePlan(crashEntries, workspaceDocs);
  if (plan.length === 0) return;

  const docIdMap = new Map<string, string>();
  let firstDirtyRestored = false;
  let crashRestored = false;
  let activeId: string | null = null;

  for (const item of plan) {
    const id = addRestoredDoc(item);
    if (item.meta.docId) docIdMap.set(item.meta.docId, id);
    if (item.source === "crash") crashRestored = true;
    const forcedDirty = item.source === "crash" ? true : Boolean(item.meta.isDirty);
    if (forcedDirty) firstDirtyRestored = true;
  }

  if (workspaceActiveId && docIdMap.has(workspaceActiveId)) {
    activeId = docIdMap.get(workspaceActiveId)!;
  }
  if (activeId) {
    useDocuments.getState().setActive(activeId);
  }

  if (crashRestored && firstDirtyRestored) {
    useDocuments
      .getState()
      .setStatus({ text: "已从上次异常退出中恢复,请确认后保存", kind: "info" });
  } else if (firstDirtyRestored) {
    useDocuments
      .getState()
      .setStatus({ text: "已恢复上次工作区,尚未保存", kind: "info" });
  }
}

export async function saveWorkspaceAndFinish(): Promise<boolean> {
  const store = useDocuments.getState();
  for (const doc of store.documents) flushDocument(doc.id);

  const docs = useDocuments.getState().documents;
  const manifest = {
    version: 1,
    savedAt: Date.now(),
    activeDocId: useDocuments.getState().activeId ?? null,
    docs: docs.map((doc) => ({
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
    })),
  };
  try {
    await invoke("workspace_save", {
      manifest: JSON.stringify(manifest),
      docs: docs.map((doc) => [doc.id, doc.text]),
    });
    await invoke("recovery_finish_cleanly", { session });
    return true;
  } catch {
    return false;
  }
}

export async function finishCleanly(): Promise<void> {
  try {
    await invoke("recovery_finish_cleanly", { session });
  } catch {
    // ignore
  }
}
