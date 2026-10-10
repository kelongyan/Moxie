import { describe, expect, it } from "vitest";
import {
  findMatchRanges,
  selectionMatchesQuery,
} from "../src/editor/searchEngine";

const OPT = (over: Partial<Parameters<typeof findMatchRanges>[2]> = {}) => ({
  caseSensitive: false,
  interpretEscapes: false,
  ...over,
});

describe("searchEngine · 字面量匹配", () => {
  it("大小写不敏感返回全部区间", () => {
    const r = findMatchRanges("aBc Abc abc", "abc", OPT());
    expect(r.ranges).toEqual([
      { from: 0, to: 3 },
      { from: 4, to: 7 },
      { from: 8, to: 11 },
    ]);
    expect(r.error).toBeNull();
  });

  it("区分大小写只留精确命中", () => {
    const r = findMatchRanges("aBc Abc abc", "abc", OPT({ caseSensitive: true }));
    expect(r.ranges).toEqual([{ from: 8, to: 11 }]);
  });
});

describe("searchEngine · 全词匹配", () => {
  it("词中命中不算，独立词命中算", () => {
    const r = findMatchRanges("cat category concat cat", "cat", OPT({ wholeWord: true }));
    expect(r.ranges).toEqual([
      { from: 0, to: 3 },
      { from: 20, to: 23 },
    ]);
  });

  it("数字与下划线视为词字符", () => {
    // 独立的 v2 命中；v22（后随数字）、_v2（前随下划线）、v2_（后随下划线）不算
    const r = findMatchRanges("v2 v22 _v2 v2_", "v2", OPT({ wholeWord: true }));
    expect(r.ranges).toEqual([{ from: 0, to: 2 }]);
  });
});

describe("searchEngine · 正则匹配", () => {
  it("表达式按区间返回（可变长度）", () => {
    const r = findMatchRanges("aa ab abc", "a[bc]+", OPT({ useRegex: true }));
    expect(r.ranges).toEqual([
      { from: 3, to: 5 },
      { from: 6, to: 9 },
    ]);
  });

  it("语法错误走 error，不抛异常", () => {
    const r = findMatchRanges("text", "a(", OPT({ useRegex: true }));
    expect(r.ranges).toEqual([]);
    expect(r.error).toContain("正则表达式无效");
  });

  it("零宽匹配不死循环且有界", () => {
    const r = findMatchRanges("abc", "a*", OPT({ useRegex: true }));
    expect(r.ranges.length).toBeGreaterThan(0);
    expect(r.ranges.length).toBeLessThanOrEqual(10000);
  });

  it("全词 + 正则组合", () => {
    const r = findMatchRanges("foo foobar foo", "foo", OPT({ useRegex: true, wholeWord: true }));
    expect(r.ranges).toEqual([
      { from: 0, to: 3 },
      { from: 11, to: 14 },
    ]);
  });
});

describe("searchEngine · selectionMatchesQuery", () => {
  it("字面量比对不区分大小写", () => {
    expect(selectionMatchesQuery("ABC", "abc", OPT())).toBe(true);
    expect(selectionMatchesQuery("AB", "abc", OPT())).toBe(false);
  });

  it("正则模式要求整体命中", () => {
    expect(selectionMatchesQuery("abc123", "a\\d+", OPT({ useRegex: true }))).toBe(false);
    expect(selectionMatchesQuery("a123", "a\\d+", OPT({ useRegex: true }))).toBe(true);
  });
});
