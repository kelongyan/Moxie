import { describe, expect, it } from "vitest";
import {
  countWords,
  countWordsRange,
  featureEnabled,
  LARGE_BYTES,
  EXTREME_BYTES,
  LARGE_LINES,
  resolveProfile,
} from "../src/state/performance";

describe("resolveProfile", () => {
  it("standard below thresholds", () => {
    expect(resolveProfile(1024, 10)).toBe("standard");
    expect(resolveProfile(LARGE_BYTES, LARGE_LINES)).toBe("standard");
  });

  it("large just above byte threshold", () => {
    expect(resolveProfile(LARGE_BYTES + 1, 10)).toBe("large");
  });

  it("large above line threshold", () => {
    expect(resolveProfile(1024, LARGE_LINES + 1)).toBe("large");
  });

  it("extreme above 50MB", () => {
    expect(resolveProfile(EXTREME_BYTES + 1, 10)).toBe("extreme");
  });
});

describe("featureEnabled", () => {
  it("standard enables everything", () => {
    for (const key of ["wordWrap", "preview", "highlight", "fold", "wordCount"] as const) {
      expect(featureEnabled(key, "standard", {})).toBe(true);
    }
  });

  it("large disables wrap/preview/fold/wordCount but keeps highlight", () => {
    expect(featureEnabled("wordWrap", "large", {})).toBe(false);
    expect(featureEnabled("preview", "large", {})).toBe(false);
    expect(featureEnabled("fold", "large", {})).toBe(false);
    expect(featureEnabled("wordCount", "large", {})).toBe(false);
    expect(featureEnabled("highlight", "large", {})).toBe(true);
  });

  it("extreme disables highlight too", () => {
    expect(featureEnabled("highlight", "extreme", {})).toBe(false);
  });

  it("overrides win over tier defaults", () => {
    expect(featureEnabled("wordWrap", "large", { wordWrap: true })).toBe(true);
    expect(featureEnabled("highlight", "extreme", { highlight: true })).toBe(true);
    expect(featureEnabled("fold", "standard", { fold: false })).toBe(false);
  });
});

describe("countWords", () => {
  it("counts ascii words", () => {
    expect(countWordsRange("hello world foo", 0, 15)).toBe(3);
    expect(countWordsRange("one  two\nthree", 0, 14)).toBe(3);
  });

  it("counts cjk characters individually", () => {
    expect(countWordsRange("中文测试", 0, 4)).toBe(4);
    expect(countWordsRange("中文 abc", 0, 6)).toBe(3);
  });

  it("mixed chunked count equals direct count", async () => {
    const unit = "hello 世界 test ";
    const text = unit.repeat(40000);
    const direct = countWordsRange(text, 0, text.length);
    const handle = countWords(text);
    const chunked = await handle.promise;
    expect(chunked).toBe(direct);
  });

  it("small text counts synchronously", async () => {
    const handle = countWords("a b c");
    expect(await handle.promise).toBe(3);
  });

  it("cancel returns null", async () => {
    const text = "word ".repeat(200000);
    const handle = countWords(text);
    handle.cancel();
    expect(await handle.promise).toBeNull();
  });
});
