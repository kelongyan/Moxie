import { invoke } from "@tauri-apps/api/core";
import { flushDocument } from "../editor/registry";
import { EditorDocument, useDocuments } from "./documents";

export interface RecoveryEntryDto {
  docId: string;
  meta: string;
  content: string;
}

export interface RestoredDocMeta {
  docId?: string;
  name?: string;
  path?: string | null;
  encoding?: string;
  lineEnding?: "lf" | "crlf" | "cr";
  isDirty?: boolean;
  cursorLine?: number;
  cursorColumn?: number;
  perfTier?: "standard" | "large" | "extreme";
  perfBytes?: number;
}

export interface RestorePlanItem {
  meta: RestoredDocMeta;
  content: string;
}

/** 崩溃恢复条目去重（同 path/docId 只保留第一条） */
export function buildRestorePlan(
  crashEntries: { meta: RestoredDocMeta; content: string }[]
): RestorePlanItem[] {
  const items: RestorePlanItem[] = [];
  const seen = new Set<string>();

  for (const entry of crashEntries) {
    const key = entry.meta.path ?? entry.meta.docId ?? `crash:${items.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ meta: entry.meta, content: entry.content });
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
    encoding: doc.encoding,
    lineEnding: doc.lineEnding,
    isDirty: doc.isDirty,
    cursorLine: doc.cursorLine,
    cursorColumn: doc.cursorColumn,
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
  // 崩溃恢复的内容一律视为未保存，提醒用户确认后再入库
  const id = store.addRestored({
    name: item.meta.name ?? "未命名",
    path: item.meta.path ?? null,
    encoding: item.meta.encoding ?? "utf-8",
    lineEnding: item.meta.lineEnding ?? "lf",
    cursorLine: item.meta.cursorLine ?? 1,
    cursorColumn: item.meta.cursorColumn ?? 1,
    perfTier: item.meta.perfTier ?? "standard",
    perfBytes: item.meta.perfBytes ?? 0,
    text: item.content,
    savedText: "",
    isDirty: true,
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

  session = newSessionId();
  try {
    await invoke("recovery_cleanup", { keepSession: session });
    await invoke("recovery_write_marker", { session });
  } catch {
    // best effort
  }

  const plan = buildRestorePlan(crashEntries);
  if (plan.length === 0) return;

  for (const item of plan) {
    addRestoredDoc(item);
  }

  useDocuments
    .getState()
    .setStatus({ text: "已从上次异常退出中恢复,请确认后保存", kind: "info" });
}

export async function finishCleanly(): Promise<void> {
  try {
    await invoke("recovery_finish_cleanly", { session });
  } catch {
    // ignore
  }
}
