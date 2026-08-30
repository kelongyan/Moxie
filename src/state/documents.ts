import { create } from "zustand";
import { EditorLanguage, baseName, inferLanguage } from "../models/language";
import type { FeatureOverrides, PerfTier } from "./performance";

export interface FileRevisionSnapshot {
  identity: string;
  modifiedMs: number;
  size: number;
}

export type DocumentIoState = "idle" | "saving";

export interface EditorDocument {
  id: string;
  name: string;
  path: string | null;
  language: EditorLanguage;
  text: string;
  savedText: string;
  isDirty: boolean;
  revision: number;
  cursorLine: number;
  cursorColumn: number;
  encoding: string;
  lineEnding: "lf" | "crlf" | "cr";
  fileIdentity: string | null;
  fileRevision: FileRevisionSnapshot | null;
  ioState: DocumentIoState;
  previewVisible: boolean;
  perfTier: PerfTier;
  perfBytes: number;
  featureOverrides: FeatureOverrides;
}

export interface StatusMessage {
  text: string;
  kind: "info" | "error";
}

interface DocumentsState {
  documents: EditorDocument[];
  activeId: string | null;
  statusMessage: StatusMessage | null;
  createUntitled: () => string;
  addOpened: (path: string, text: string) => string;
  addRestored: (partial: Partial<EditorDocument>) => string;
  close: (id: string) => void;
  setActive: (id: string) => void;
  cycleTab: (direction: 1 | -1) => void;
  reorder: (from: number, to: number) => void;
  syncText: (id: string, text: string) => void;
  patchDocument: (id: string, patch: Partial<EditorDocument>) => void;
  markDirty: (id: string, dirty: boolean) => void;
  markSaved: (id: string) => void;
  updateLocation: (id: string, path: string) => void;
  setCursor: (id: string, line: number, column: number) => void;
  setStatus: (message: StatusMessage | null) => void;
}

let nextId = 1;

function makeDocument(partial: Partial<EditorDocument>): EditorDocument {
  return {
    id: `doc-${nextId++}`,
    name: "未命名",
    path: null,
    language: "plaintext",
    text: "",
    savedText: "",
    isDirty: false,
    revision: 0,
    cursorLine: 1,
    cursorColumn: 1,
    encoding: "utf-8",
    lineEnding: "lf",
    fileIdentity: null,
    fileRevision: null,
    ioState: "idle",
    previewVisible: false,
    perfTier: "standard",
    perfBytes: 0,
    featureOverrides: {},
    ...partial,
  };
}

function updateDoc(
  documents: EditorDocument[],
  id: string,
  patch: Partial<EditorDocument>
): EditorDocument[] {
  return documents.map((d) => (d.id === id ? { ...d, ...patch } : d));
}

export const useDocuments = create<DocumentsState>((set, get) => ({
  documents: [],
  activeId: null,
  statusMessage: null,

  createUntitled: () => {
    const names = new Set(
      get()
        .documents.filter((d) => d.path === null)
        .map((d) => d.name)
    );
    let name = "未命名";
    let n = 2;
    while (names.has(name)) {
      name = `未命名 ${n}`;
      n += 1;
    }
    const doc = makeDocument({ name });
    set((s) => ({
      documents: [...s.documents, doc],
      activeId: doc.id,
    }));
    return doc.id;
  },

  addOpened: (path, text) => {
    const doc = makeDocument({
      name: baseName(path),
      path,
      language: inferLanguage(path),
      text,
      savedText: text,
    });
    set((s) => ({
      documents: [...s.documents, doc],
      activeId: doc.id,
    }));
    return doc.id;
  },

  addRestored: (partial) => {
    const doc = makeDocument(partial);
    set((s) => ({
      documents: [...s.documents, doc],
      activeId: doc.id,
    }));
    return doc.id;
  },

  close: (id) => {
    const { documents, activeId } = get();
    const index = documents.findIndex((d) => d.id === id);
    if (index < 0) return;
    const remaining = documents.filter((d) => d.id !== id);
    let nextActive = activeId;
    if (activeId === id) {
      const neighbor =
        remaining[index] ?? remaining[index - 1] ?? null;
      nextActive = neighbor ? neighbor.id : null;
    }
    set({ documents: remaining, activeId: nextActive });
  },

  setActive: (id) => set({ activeId: id }),

  cycleTab: (direction) => {
    const { documents, activeId } = get();
    if (documents.length === 0) return;
    const index = documents.findIndex((d) => d.id === activeId);
    const next = (index + direction + documents.length) % documents.length;
    set({ activeId: documents[next].id });
  },

  reorder: (from, to) => {
    const { documents } = get();
    if (from === to || from < 0 || from >= documents.length) return;
    const list = [...documents];
    const [moved] = list.splice(from, 1);
    const insertAt = to > from ? to - 1 : to;
    list.splice(Math.max(0, Math.min(list.length, insertAt)), 0, moved);
    set({ documents: list });
  },

  syncText: (id, text) => {
    set((s) => ({
      documents: updateDoc(s.documents, id, {
        text,
        revision: (s.documents.find((d) => d.id === id)?.revision ?? 0) + 1,
        isDirty: text !== (s.documents.find((d) => d.id === id)?.savedText ?? ""),
      }),
    }));
  },

  patchDocument: (id, patch) =>
    set((s) => ({ documents: updateDoc(s.documents, id, patch) })),

  markDirty: (id, dirty) =>
    set((s) => ({ documents: updateDoc(s.documents, id, { isDirty: dirty }) })),

  markSaved: (id) =>
    set((s) => ({
      documents: updateDoc(s.documents, id, {
        savedText: s.documents.find((d) => d.id === id)?.text ?? "",
        isDirty: false,
      }),
    })),

  updateLocation: (id, path) =>
    set((s) => ({
      documents: updateDoc(s.documents, id, {
        path,
        name: baseName(path),
        language: inferLanguage(path),
      }),
    })),

  setCursor: (id, line, column) =>
    set((s) => ({
      documents: updateDoc(s.documents, id, { cursorLine: line, cursorColumn: column }),
    })),

  setStatus: (message) => set({ statusMessage: message }),
}));

export function activeDocument(): EditorDocument | null {
  const { documents, activeId } = useDocuments.getState();
  return documents.find((d) => d.id === activeId) ?? null;
}
