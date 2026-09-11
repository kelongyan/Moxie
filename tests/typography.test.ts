import { describe, expect, it } from "vitest";
import {
  BLANK_LINE_HEIGHT,
  CONTENT_LINE_HEIGHT,
  MD_MARGIN,
  collapsedGap,
  spaceBefore,
  type BlockKind,
} from "../src/preview/typography";

const KINDS: BlockKind[] = [
  "paragraph",
  "heading",
  "list",
  "blockquote",
  "pre",
  "hr",
];

/** 与 docs/TizuMark渲染复刻方案.md 的折叠间距矩阵一致 */
const MATRIX: Record<BlockKind, Record<BlockKind, number>> = {
  paragraph: { paragraph: 14, heading: 24, list: 14, blockquote: 14, pre: 16, hr: 32 },
  heading: { paragraph: 12, heading: 24, list: 12, blockquote: 12, pre: 16, hr: 32 },
  list: { paragraph: 14, heading: 24, list: 14, blockquote: 14, pre: 16, hr: 32 },
  blockquote: { paragraph: 16, heading: 24, list: 16, blockquote: 16, pre: 16, hr: 32 },
  pre: { paragraph: 16, heading: 24, list: 16, blockquote: 16, pre: 16, hr: 32 },
  hr: { paragraph: 32, heading: 32, list: 32, blockquote: 32, pre: 32, hr: 32 },
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
