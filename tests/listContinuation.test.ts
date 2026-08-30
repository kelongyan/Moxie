import { describe, expect, it } from "vitest";
import {
  computeRenumbering,
  continuationForLine,
} from "../src/editor/listContinuation";

describe("continuationForLine", () => {
  it("continues ordered list with next number and same delimiter", () => {
    expect(continuationForLine("1. first")).toEqual({
      kind: "insert",
      text: "2. ",
    });
    expect(continuationForLine("3) item")).toEqual({
      kind: "insert",
      text: "4) ",
    });
  });

  it("preserves indentation", () => {
    expect(continuationForLine("  1. nested")).toEqual({
      kind: "insert",
      text: "  2. ",
    });
    expect(continuationForLine("\t- tabbed")).toEqual({
      kind: "insert",
      text: "\t- ",
    });
  });

  it("repeats unordered markers", () => {
    expect(continuationForLine("- item")).toEqual({ kind: "insert", text: "- " });
    expect(continuationForLine("* item")).toEqual({ kind: "insert", text: "* " });
    expect(continuationForLine("+ item")).toEqual({ kind: "insert", text: "+ " });
  });

  it("exits list on empty item", () => {
    expect(continuationForLine("1. ")).toEqual({ kind: "exit", indent: "" });
    expect(continuationForLine("-")).toEqual({ kind: "exit", indent: "" });
    expect(continuationForLine("  2) ")).toEqual({ kind: "exit", indent: "  " });
  });

  it("returns null for plain text", () => {
    expect(continuationForLine("plain text")).toBeNull();
    expect(continuationForLine("# heading")).toBeNull();
  });
});

describe("computeRenumbering", () => {
  it("renumbers a broken sequence from the first item", () => {
    const changes = computeRenumbering(["1. a", "3. b", "7. c"], 1);
    expect(changes).toEqual([
      { lineIdx: 1, newNumber: 2 },
      { lineIdx: 2, newNumber: 3 },
    ]);
  });

  it("keeps correct sequences untouched", () => {
    expect(computeRenumbering(["1. a", "2. b", "3. c"], 1)).toEqual([]);
  });

  it("does not mix different delimiters", () => {
    expect(computeRenumbering(["1. a", "2) b"], 0)).toBeNull();
  });

  it("does not mix different indentation levels", () => {
    expect(computeRenumbering(["1. a", "  2. b"], 0)).toBeNull();
  });

  it("stops at non-list lines", () => {
    const changes = computeRenumbering(
      ["1. a", "5. b", "text", "9. c"],
      1
    );
    expect(changes).toEqual([{ lineIdx: 1, newNumber: 2 }]);
  });

  it("respects the item cap", () => {
    const lines = Array.from({ length: 501 }, (_, i) => `${i + 1}. x`);
    expect(computeRenumbering(lines, 250)).toBeNull();
  });
});
