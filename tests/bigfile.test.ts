import { describe, expect, it } from "vitest";
import { buildEditorState } from "../src/editor/extensions";

const LINE = 'const item = { id: 12345, name: "LacEditor fixture line" };\n';

describe("big file editor state assembly", () => {
  it("builds state for a 20MB document within budget", () => {
    const text = LINE.repeat(Math.ceil((20 * 1024 * 1024) / LINE.length));
    const started = Date.now();
    const state = buildEditorState({
      docId: "big",
      initialText: text,
      language: "javascript",
      wordWrap: false,
      showLineNumbers: true,
      fontSizePt: 14,
      lineSpacingPt: 4,
      indentUnitText: "    ",
      enableHighlight: true,
      enableFold: false,
      onUpdate: () => {},
      onCursor: () => {},
    });
    const elapsed = Date.now() - started;
    expect(state.doc.length).toBe(text.length);
    expect(state.doc.lines).toBe(text.split("\n").length);
    expect(elapsed).toBeLessThan(15_000);
  });

  it("builds extreme-tier state without highlight and fold", () => {
    const text = LINE.repeat(Math.ceil((51 * 1024 * 1024) / LINE.length));
    const state = buildEditorState({
      docId: "extreme",
      initialText: text,
      language: "javascript",
      wordWrap: false,
      showLineNumbers: true,
      fontSizePt: 14,
      lineSpacingPt: 4,
      indentUnitText: "    ",
      enableHighlight: false,
      enableFold: false,
      onUpdate: () => {},
      onCursor: () => {},
    });
    expect(state.doc.length).toBe(text.length);
  });
});
