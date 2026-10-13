import { describe, expect, it } from "vitest";
import { buildIntervalIndex } from "../src/editor/livePreview";

/**
 * buildIntervalIndex（docs/渲染优化方案.md O-1/O-2）与原"逐一线性回扫"的
 * 语义对照：任一区间包含点（contains）/ 任一区间相交（overlaps），含嵌套区间。
 */

/** 朴素线性参照（修复前语义） */
function naiveContains(ranges: { from: number; to: number }[], pos: number): boolean {
  return ranges.some((r) => pos >= r.from && pos < r.to);
}

function naiveOverlaps(
  ranges: { from: number; to: number }[],
  from: number,
  to: number
): boolean {
  return ranges.some((r) => r.from < to && r.to > from);
}

/** 可复现伪随机（LCG），避免依赖 Math.random 的测试抖动 */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randomRanges(
  count: number,
  max: number,
  rand: () => number
): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.floor(rand() * max);
    const len = 1 + Math.floor(rand() * Math.max(1, Math.floor(max / 5)));
    out.push({ from: a, to: Math.min(max, a + len) });
  }
  return out;
}

describe("buildIntervalIndex 对照线性扫描", () => {
  it("固定样例：嵌套 / 重叠 / 相离区间", () => {
    const ranges = [
      { from: 0, to: 100 },
      { from: 50, to: 60 },
      { from: 200, to: 210 },
      { from: 205, to: 300 },
    ];
    const idx = buildIntervalIndex(ranges);
    for (let pos = -1; pos <= 310; pos += 3) {
      expect(idx.contains(pos)).toBe(naiveContains(ranges, pos));
    }
    const probes: [number, number][] = [
      [0, 5],
      [99, 101],
      [150, 180],
      [208, 212],
      [290, 400],
      [-5, 1],
      [300, 301],
    ];
    for (const [from, to] of probes) {
      expect(idx.overlaps(from, to)).toBe(naiveOverlaps(ranges, from, to));
    }
  });

  it("空与单元素边界", () => {
    expect(buildIntervalIndex([]).contains(0)).toBe(false);
    expect(buildIntervalIndex([]).overlaps(0, 10)).toBe(false);
    const one = buildIntervalIndex([{ from: 5, to: 8 }]);
    expect(one.contains(4)).toBe(false);
    expect(one.contains(5)).toBe(true);
    expect(one.contains(8)).toBe(false);
    expect(one.overlaps(8, 9)).toBe(false);
    expect(one.overlaps(7, 9)).toBe(true);
  });

  it("随机区间对照（300 组）", () => {
    const rand = lcg(0xc0ffee);
    for (let round = 0; round < 300; round++) {
      const ranges = randomRanges(1 + (round % 30), 1000, rand);
      const idx = buildIntervalIndex(ranges);
      for (let p = 0; p < 200; p++) {
        const pos = Math.floor(rand() * 1100);
        expect(idx.contains(pos)).toBe(naiveContains(ranges, pos));
      }
      for (let p = 0; p < 100; p++) {
        const from = Math.floor(rand() * 1000);
        const to = from + 1 + Math.floor(rand() * 100);
        expect(idx.overlaps(from, to)).toBe(naiveOverlaps(ranges, from, to));
      }
    }
  });

  it("嵌套禁区：跨行块级公式覆盖行内代码（简单二分会漏报）", () => {
    // 树遍历入列 [50,60)（行内代码），块级 $$ 扫描后追加 [10,200)（跨行公式）
    const idx = buildIntervalIndex([
      { from: 50, to: 60 },
      { from: 10, to: 200 },
    ]);
    expect(idx.contains(55)).toBe(true); // 行内代码内
    expect(idx.contains(70)).toBe(true); // 仅在外层公式内（嵌套内侧）
    expect(idx.contains(10)).toBe(true); // 边界包含
    expect(idx.contains(9)).toBe(false);
    expect(idx.contains(200)).toBe(false); // 右开区间
  });

  it("unordered 输入：索引内部排序", () => {
    const idx = buildIntervalIndex([
      { from: 200, to: 210 },
      { from: 0, to: 5 },
      { from: 100, to: 105 },
    ]);
    expect(idx.contains(2)).toBe(true);
    expect(idx.contains(99)).toBe(false);
    expect(idx.contains(102)).toBe(true);
    expect(idx.contains(205)).toBe(true);
  });
});
