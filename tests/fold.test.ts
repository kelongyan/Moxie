import { describe, expect, it } from "vitest";
import { markdownHeadingFoldRange } from "../src/editor/languages";

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
