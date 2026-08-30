import { describe, expect, it } from "vitest";
import {
  jsonContainerFoldRange,
  jsonContainerFoldRange as jsonFold,
  markdownHeadingFoldRange,
} from "../src/editor/languages";

describe("markdownHeadingFoldRange", () => {
  const text = "# A\nbody\nbody2\n## B\nb\n# C\n";

  it("folds h1 until the next same-level heading", () => {
    const range = markdownHeadingFoldRange(text, 0, 3);
    expect(range).toEqual({ from: 3, to: 21 });
    expect(text.slice(3, 21)).toBe("\nbody\nbody2\n## B\nb");
  });

  it("folds h2 until the next higher-level heading", () => {
    expect(markdownHeadingFoldRange(text, 15, 19)).toEqual({ from: 19, to: 21 });
  });

  it("returns null for trailing heading without content", () => {
    expect(markdownHeadingFoldRange(text, 22, 25)).toBeNull();
  });

  it("returns null for non-heading lines", () => {
    expect(markdownHeadingFoldRange(text, 4, 8)).toBeNull();
  });
});

describe("jsonContainerFoldRange", () => {
  it("folds the root object across lines", () => {
    const text = '{\n  "a": [1, 2],\n  "b": {"x": 1}\n}';
    const range = jsonContainerFoldRange(text, 0, 1);
    expect(range).toEqual({ from: 1, to: text.length - 1 });
  });

  it("does not fold single-line containers", () => {
    const text = '{\n  "a": [1, 2],\n  "b": {"x": 1}\n}';
    const lineStart = text.indexOf('{"x"');
    const lineEnd = text.indexOf("\n", lineStart);
    expect(jsonContainerFoldRange(text, lineStart, lineEnd)).toBeNull();
  });

  it("ignores brackets inside strings", () => {
    const text = '{"s": "{ not real }", "t": 1,\n"u": 2}';
    const range = jsonContainerFoldRange(text, 0, text.indexOf("\n"));
    expect(range).toEqual({ from: 1, to: text.length - 1 });
  });

  it("returns null when no container opens on the line", () => {
    const text = '{\n  "a": 1\n}';
    expect(jsonContainerFoldRange(text, 2, 10)).toBeNull();
  });

  it("folds root array", () => {
    const text = '[\n  1,\n  2\n]';
    const range = jsonFold(text, 0, 1);
    expect(range).toEqual({ from: 1, to: text.length - 1 });
  });
});
