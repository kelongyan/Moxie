import { describe, expect, it } from "vitest";
import {
  BLANK_LINE_HEIGHT,
  CONTENT_LINE_HEIGHT,
  MD_MARGIN,
  collapsedGap,
  spaceBefore,
  spacingScale,
  type BlockKind,
} from "../src/preview/typography";

const KINDS: BlockKind[] = [
  "paragraph",
  "heading",
  "list",
  "blockquote",
  "pre",
  "hr",
  "table",
];

/** 与 docs/TizuMark渲染复刻方案.md 的折叠间距矩阵一致（hr 24、table 下 16） */
const MATRIX: Record<BlockKind, Record<BlockKind, number>> = {
  paragraph: { paragraph: 14, heading: 24, list: 14, blockquote: 14, pre: 16, hr: 24, table: 14 },
  heading: { paragraph: 12, heading: 24, list: 12, blockquote: 12, pre: 16, hr: 24, table: 12 },
  list: { paragraph: 14, heading: 24, list: 14, blockquote: 14, pre: 16, hr: 24, table: 14 },
  blockquote: { paragraph: 16, heading: 24, list: 16, blockquote: 16, pre: 16, hr: 24, table: 16 },
  pre: { paragraph: 16, heading: 24, list: 16, blockquote: 16, pre: 16, hr: 24, table: 16 },
  hr: { paragraph: 24, heading: 24, list: 24, blockquote: 24, pre: 24, hr: 24, table: 24 },
  table: { paragraph: 16, heading: 24, list: 16, blockquote: 16, pre: 16, hr: 24, table: 16 },
};

describe("typography · collapsedGap 折叠矩阵", () => {
  for (const prev of KINDS) {
    for (const cur of KINDS) {
      it(`${prev} → ${cur} = ${MATRIX[prev][cur]}px`, () => {
        expect(collapsedGap(prev, cur)).toBe(MATRIX[prev][cur]);
      });
    }
  }

  it("首块无上方间距", () => {
    expect(collapsedGap(null, "heading")).toBe(0);
    expect(collapsedGap(null, "paragraph")).toBe(0);
  });
});

describe("typography · spaceBefore 空行扣减", () => {
  it("无空行时等于折叠值", () => {
    expect(spaceBefore("paragraph", "paragraph", 0)).toBe(14);
    expect(spaceBefore("paragraph", "heading", 0)).toBe(24);
  });

  it("一个空行扣掉空行高度（间距 = 空行 + padding 合计仍为折叠值）", () => {
    expect(spaceBefore("paragraph", "paragraph", 1)).toBe(14 - BLANK_LINE_HEIGHT);
    expect(spaceBefore("paragraph", "heading", 1)).toBe(24 - BLANK_LINE_HEIGHT);
    expect(BLANK_LINE_HEIGHT + spaceBefore("paragraph", "heading", 1)).toBe(24);
  });

  it("空行过多时夹取到 0（保留用户显式留白）", () => {
    expect(spaceBefore("paragraph", "paragraph", 3)).toBe(0);
    expect(spaceBefore("paragraph", "paragraph", 100)).toBe(0);
  });

  it("负数空行按 0 处理", () => {
    expect(spaceBefore("paragraph", "paragraph", -1)).toBe(14);
  });
});

describe("typography · 常量", () => {
  it("行高与空行高度", () => {
    expect(CONTENT_LINE_HEIGHT).toBe(1.7);
    expect(BLANK_LINE_HEIGHT).toBe(8);
    expect(MD_MARGIN.paragraph.bottom).toBe(14);
    expect(MD_MARGIN.heading.top).toBe(24);
    expect(MD_MARGIN.heading.bottom).toBe(12);
  });
});

describe("typography · 块间距缩放（em 化）", () => {
  it("spacingScale：16px + 标准档 = 1，字号与档位按比例叠加", () => {
    expect(spacingScale(16)).toBe(1);
    expect(spacingScale(16, "standard")).toBe(1);
    expect(spacingScale(24)).toBe(1.5);
    expect(spacingScale(12)).toBe(0.75);
    expect(spacingScale(16, "compact")).toBe(0.75);
    expect(spacingScale(16, "relaxed")).toBe(1.25);
    expect(spacingScale(24, "relaxed")).toBe(1.875);
  });

  it("collapsedGap/spaceBefore 按 scale 缩放并取整", () => {
    expect(collapsedGap("paragraph", "paragraph", 1.5)).toBe(21);
    expect(collapsedGap("paragraph", "heading", 1.5)).toBe(36);
    expect(spaceBefore("paragraph", "paragraph", 0, 1.5)).toBe(21);
    // 空行扣减仍为固定 8px
    expect(spaceBefore("paragraph", "paragraph", 1, 1.5)).toBe(13);
    // 缩小字号时同步收紧，且不低于 0
    expect(collapsedGap("paragraph", "paragraph", 0.75)).toBe(11);
    expect(spaceBefore("paragraph", "paragraph", 2, 0.75)).toBe(0);
  });

  it("scale=1 时与既有矩阵完全一致（默认参数向后兼容）", () => {
    for (const prev of KINDS) {
      for (const cur of KINDS) {
        expect(collapsedGap(prev, cur, 1)).toBe(MATRIX[prev][cur]);
      }
    }
  });
});
