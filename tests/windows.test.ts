import { describe, expect, it } from "vitest";
import { isEditorLabel, snapshotDocument } from "../src/state/windows";
import { EditorDocument } from "../src/state/documents";

describe("isEditorLabel", () => {
  it("accepts main and editor- prefixed labels", () => {
    expect(isEditorLabel("main")).toBe(true);
    expect(isEditorLabel("editor-abc123")).toBe(true);
    expect(isEditorLabel("editor-")).toBe(true);
  });

  it("rejects auxiliary window labels", () => {
    expect(isEditorLabel("find")).toBe(false);
    expect(isEditorLabel("codec")).toBe(false);
    expect(isEditorLabel("settings")).toBe(false);
  });
});

function makeDoc(partial: Partial<EditorDocument>): EditorDocument {
  return {
    id: "doc-1",
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

describe("snapshotDocument", () => {
  it("captures content and metadata for transfer", () => {
    const doc = makeDoc({
      name: "a.txt",
      path: "C:\\a.txt",
      language: "markdown",
      isDirty: true,
      cursorLine: 3,
      cursorColumn: 5,
      previewVisible: true,
    });
    const payload = snapshotDocument(doc, "hello");
    expect(payload.content).toBe("hello");
    expect(payload.meta.name).toBe("a.txt");
    expect(payload.meta.path).toBe("C:\\a.txt");
    expect(payload.meta.language).toBe("markdown");
    expect(payload.meta.isDirty).toBe(true);
    expect(payload.meta.cursorLine).toBe(3);
    expect(payload.meta.cursorColumn).toBe(5);
    expect(payload.meta.previewVisible).toBe(true);
  });

  it("preserves dirty flag so target keeps unsaved state", () => {
    const doc = makeDoc({ isDirty: true });
    const payload = snapshotDocument(doc, "unsaved");
    expect(payload.meta.isDirty).toBe(true);
  });
});
