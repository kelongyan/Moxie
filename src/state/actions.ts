import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { baseName, SUPPORTED_EXTENSIONS } from "../models/language";
import { LineEnding } from "../models/encoding";
import { activeDocument, useDocuments } from "../state/documents";
import { resolveProfile } from "../state/performance";
import { flushDocument, replaceContent, viewFor } from "../editor/registry";
import { promptSaveChoice } from "../state/savePrompt";
import {
  promptConflictChoice,
  promptEncodingChoice,
  promptLossyChoice,
} from "../state/fileDialogs";

export interface ReadResult {
  text: string;
  encoding: string;
  lineEnding: LineEnding;
}

export interface RevisionResult {
  identity: string;
  modifiedMs: number;
  size: number;
}

const SUPPORTED_WITH_TXT = [...SUPPORTED_EXTENSIONS, "txt"];

export function newTabAction() {
  useDocuments.getState().createUntitled();
}

async function getRevision(path: string): Promise<RevisionResult | null> {
  try {
    return await invoke<RevisionResult>("get_file_revision", { path });
  } catch {
    return null;
  }
}

async function readDocumentContent(path: string): Promise<ReadResult | null> {
  try {
    return await invoke<ReadResult>("read_text_file", { path });
  } catch (error) {
    if (String(error) !== "not-utf8") {
      useDocuments
        .getState()
        .setStatus({ text: `无法打开文件:${error}`, kind: "error" });
      return null;
    }
  }
  for (;;) {
    const choice = await promptEncodingChoice(baseName(path));
    if (!choice) return null;
    try {
      return await invoke<ReadResult>("read_text_file_with_encoding", {
        path,
        encoding: choice,
      });
    } catch {
      useDocuments
        .getState()
        .setStatus({ text: "所选编码无法解码该文件,请尝试其他编码", kind: "error" });
    }
  }
}

export async function openPathAction(path: string): Promise<boolean> {
  const store = useDocuments.getState();
  const revision = await getRevision(path);
  if (revision) {
    const existing = store.documents.find(
      (d) => d.fileIdentity === revision!.identity
    );
    if (existing) {
      store.setActive(existing.id);
      store.setStatus({ text: "该文件已在编辑器中打开", kind: "info" });
      return false;
    }
  }

  const content = await readDocumentContent(path);
  if (!content) return false;

  const id = store.addOpened(path, content.text);
  const bytes = new TextEncoder().encode(content.text).length;
  let lines = 1;
  for (let i = 0; i < content.text.length; i++) {
    if (content.text[i] === "\n") lines++;
  }
  useDocuments.getState().patchDocument(id, {
    encoding: content.encoding,
    lineEnding: content.lineEnding,
    fileIdentity: revision?.identity ?? null,
    fileRevision: revision,
    perfBytes: bytes,
    perfTier: resolveProfile(bytes, lines),
  });
  useDocuments.getState().setStatus(null);
  void invoke("recent_add", { path });
  return true;
}

export async function openFileAction() {
  const picked = await open({
    multiple: false,
    title: "打开文件",
    filters: [
      { name: "支持的文本文件", extensions: SUPPORTED_WITH_TXT },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  if (!picked || Array.isArray(picked)) return;
  await openPathAction(picked);
}

async function writeToFile(
  docId: string,
  target: string,
  encodingOverride?: string
): Promise<boolean> {
  const store = useDocuments.getState();
  const doc = store.documents.find((d) => d.id === docId);
  if (!doc) return false;

  const targetRevision = await getRevision(target);
  if (targetRevision) {
    const occupied = useDocuments
      .getState()
      .documents.find(
        (d) => d.id !== docId && d.fileIdentity === targetRevision.identity
      );
    if (occupied) {
      store.setActive(occupied.id);
      store.setStatus({
        text: "该文件已在 Moxie 的另一个标签中打开",
        kind: "error",
      });
      return false;
    }
  }

  const encoding = encodingOverride ?? doc.encoding;
  store.patchDocument(docId, { ioState: "saving" });
  try {
    await invoke("write_text_file", {
      path: target,
      text: doc.text,
      encoding,
      lineEnding: doc.lineEnding,
    });
  } catch (error) {
    store.patchDocument(docId, { ioState: "idle" });
    if (String(error) === "unrepresentable") {
      const choice = await promptLossyChoice(doc.name);
      if (choice === "save-utf8") {
        return writeToFile(docId, target, "utf-8");
      }
      return false;
    }
    store.setStatus({ text: `保存失败:${error}`, kind: "error" });
    return false;
  }

  const newRevision = await getRevision(target);
  const after = useDocuments.getState();
  after.updateLocation(docId, target);
  after.patchDocument(docId, {
    ioState: "idle",
    encoding,
    fileIdentity: newRevision?.identity ?? null,
    fileRevision: newRevision,
    savedText: doc.text,
    isDirty: false,
  });

  const liveText = viewFor(docId)?.state.doc.toString();
  if (liveText !== undefined && liveText !== doc.text) {
    after.markDirty(docId, true);
    after.setStatus({
      text: "已保存先前版本,仍有未保存更改",
      kind: "info",
    });
  } else {
    after.setStatus(null);
  }
  void invoke("recent_add", { path: target });
  return true;
}

async function reloadFromDisk(docId: string, path: string): Promise<void> {
  const content = await readDocumentContent(path);
  if (!content) return;
  const revision = await getRevision(path);
  replaceContent(docId, content.text);
  const store = useDocuments.getState();
  store.syncText(docId, content.text);
  store.updateLocation(docId, path);
  store.patchDocument(docId, {
    encoding: content.encoding,
    lineEnding: content.lineEnding,
    fileIdentity: revision?.identity ?? null,
    fileRevision: revision,
    savedText: content.text,
    isDirty: false,
  });
  store.setStatus({ text: "已重新载入磁盘版本", kind: "info" });
}

export async function saveDocumentAction(docId: string): Promise<boolean> {
  const store = useDocuments.getState();
  const doc = store.documents.find((d) => d.id === docId);
  if (!doc || doc.ioState === "saving") return false;
  flushDocument(docId);
  const current = useDocuments.getState().documents.find((d) => d.id === docId);
  if (!current) return false;

  let target = current.path;
  if (!target) {
    const picked = await save({
      title: "保存文件",
      defaultPath: current.name === "未命名" ? "未命名.txt" : current.name,
    });
    if (!picked) return false;
    target = picked;
  }

  if (current.fileRevision && current.path === target) {
    const now = await getRevision(target);
    const old = current.fileRevision;
    const changed =
      now !== null &&
      (now.identity !== old.identity ||
        now.modifiedMs !== old.modifiedMs ||
        now.size !== old.size);
    if (changed) {
      const choice = await promptConflictChoice(current.name);
      if (choice === "cancel") return false;
      if (choice === "reload") {
        await reloadFromDisk(docId, target);
        return true;
      }
      if (choice === "save-as") {
        const picked = await save({ title: "另存为", defaultPath: target });
        if (!picked) return false;
        target = picked;
      }
    }
  }

  return writeToFile(docId, target);
}

export async function saveActiveAction(): Promise<boolean> {
  const doc = activeDocument();
  if (!doc) return false;
  return saveDocumentAction(doc.id);
}

export async function saveAsAction(): Promise<boolean> {
  const doc = activeDocument();
  if (!doc) return false;
  flushDocument(doc.id);
  const picked = await save({
    title: "另存为",
    defaultPath: doc.path ?? (doc.name === "未命名" ? "未命名.txt" : doc.name),
  });
  if (!picked) return false;
  return writeToFile(doc.id, picked);
}

export async function closeTabAction(docId: string): Promise<void> {
  const store = useDocuments.getState();
  const doc = store.documents.find((d) => d.id === docId);
  if (!doc) return;
  flushDocument(docId);
  const current = useDocuments.getState().documents.find((d) => d.id === docId);
  if (!current) return;

  if (current.isDirty) {
    const choice = await promptSaveChoice(current.name);
    if (choice === "cancel") return;
    if (choice === "save") {
      const saved = await saveDocumentAction(docId);
      if (!saved) return;
    }
  }
  useDocuments.getState().close(docId);
}

export async function closeOtherTabsAction(keepId: string): Promise<void> {
  const ids = useDocuments
    .getState()
    .documents.filter((d) => d.id !== keepId)
    .map((d) => d.id);
  for (const id of ids) {
    await closeTabAction(id);
    if (useDocuments.getState().documents.find((d) => d.id === id)) return;
  }
}

export async function closeTabsToRightAction(anchorId: string): Promise<void> {
  const docs = useDocuments.getState().documents;
  const index = docs.findIndex((d) => d.id === anchorId);
  if (index < 0) return;
  for (const doc of docs.slice(index + 1)) {
    await closeTabAction(doc.id);
  }
}

export async function jsonFormatActive(mode: "pretty" | "minify"): Promise<void> {
  const doc = activeDocument();
  if (!doc) return;
  if (doc.language !== "json") {
    useDocuments
      .getState()
      .setStatus({ text: "仅对 JSON 文件可用", kind: "error" });
    return;
  }
  flushDocument(doc.id);
  const view = viewFor(doc.id);
  if (!view) return;
  const text = view.state.doc.toString();
  try {
    const result = await invoke<string>("json_format", { text, mode });
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result },
      userEvent: "input",
    });
    view.focus();
    useDocuments.getState().setStatus(null);
  } catch (error) {
    useDocuments
      .getState()
      .setStatus({ text: String(error), kind: "error" });
  }
}
