import { describe, expect, it } from "vitest";
import { EditorState, Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { markdownExtensions } from "../src/editor/languages";
import { computeLiveRanges } from "../src/editor/livePreview";
import {
  WINDOW_MARGIN_LINES,
  initialWindowFor,
  windowField,
  windowForViewport,
} from "../src/editor/viewportWindow";

/**
 * 视口窗口化计算（docs/渲染优化方案.md O-4）：
 * - 窗口内"内核区"的装饰应与全量计算完全一致（窗口边缘的间距近似允许差异）；
 * - 结果不含完全落在窗口外的装饰；
 * - 窗口内各类构造（标题/公式/emoji/mark/表格/代码块）照常渲染；
 * - 不传窗口时保持全量（旧调用兼容）。
 */

const RESOLVE_ALL = (raw: string): string => `asset://${raw}`;

function stateOf(doc: string, anchor = 0) {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownExtensions()],
  });
}

interface Fingerprint {
  from: number;
  key: string;
}

/** 装饰指纹：位置 + 类型（widget 类名 / class / 隐藏）+ 行内属性 */
function fingerprints(ranges: Range<Decoration>[]): Fingerprint[] {
  return ranges
    .map((r) => {
      const spec = r.value.spec as {
        class?: string;
        widget?: { constructor: { name: string } };
        attributes?: { style?: string };
      };
      const kind = spec.widget
        ? `widget:${spec.widget.constructor.name}`
        : spec.class
          ? `class:${spec.class}`
          : "hide";
      const style = spec.attributes?.style ?? "";
      return { from: r.from, key: `${r.to}|${kind}|${style}` };
    })
    .sort((a, b) => a.from - b.from || a.key.localeCompare(b.key));
}

/** 含各类构造的文档：章节 + 强调/行内代码/链接/公式/emoji/mark + 表格/fence/callout */
function buildDoc(sections: number): string {
  const parts: string[] = [];
  for (let i = 0; i < sections; i++) {
    parts.push(`## Section ${i}`);
    parts.push(
      `Paragraph ${i} with **bold**, *italic*, \`code\`, a [link](https://example.com), $x_${i}^2$, :smile:, ==mark ${i}==.`
    );
    if (i % 12 === 4) {
      parts.push("| col a | col b |");
      parts.push("| --- | --- |");
      parts.push(`| cell ${i} | cell ${i + 1} |`);
    }
    if (i % 12 === 8) {
      parts.push("```js");
      parts.push(`const v${i} = ${i};`);
      parts.push("```");
    }
    if (i % 12 === 10) {
      parts.push("> [!NOTE]");
      parts.push(`> callout ${i}`);
    }
    parts.push("");
  }
  return parts.join("\n");
}

describe("computeLiveRanges 视口窗口化", () => {
  it("内核区装饰与全量计算完全一致", () => {
    const doc = buildDoc(500);
    const state = stateOf(doc);
    const all = computeLiveRanges(state, state.doc.length, RESOLVE_ALL);

    const win = { from: state.doc.line(600).from, to: state.doc.line(1100).to };
    const windowed = computeLiveRanges(state, win.to, RESOLVE_ALL, 1, null, false, win);

    // 内核 = 窗口内缩 40 行（远离窗口边缘的近似区）
    const coreFrom = state.doc.line(640).from;
    const coreTo = state.doc.line(1060).to;
    const core = (fps: Fingerprint[]) =>
      fps.filter((f) => f.from >= coreFrom && f.from <= coreTo);

    const windowedCore = core(fingerprints(windowed));
    expect(windowedCore.length).toBeGreaterThan(50);
    expect(windowedCore).toEqual(core(fingerprints(all)));
  });

  it("结果不含完全落在窗口外的装饰", () => {
    const doc = buildDoc(500);
    const state = stateOf(doc);
    const win = { from: state.doc.line(600).from, to: state.doc.line(1100).to };
    const windowed = computeLiveRanges(state, win.to, RESOLVE_ALL, 1, null, false, win);

    expect(windowed.length).toBeGreaterThan(0);
    for (const r of windowed) {
      expect(r.to >= win.from && r.from <= win.to).toBe(true);
    }
  });

  it("窗口内各类构造照常渲染（标题/公式/emoji/mark/表格/代码块）", () => {
    const doc = [
      ...Array.from({ length: 40 }, (_, i) => `filler line ${i}`),
      "",
      "## Targeted heading",
      "",
      "Text with $e^2$ and :smile: and ==hi==.",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
      ...Array.from({ length: 40 }, (_, i) => `tail line ${i}`),
    ].join("\n");
    const state = stateOf(doc);
    const win = { from: state.doc.line(30).from, to: state.doc.line(60).to };
    const fps = fingerprints(
      computeLiveRanges(state, win.to, RESOLVE_ALL, 1, null, false, win)
    );

    const headingPos = state.doc.lineAt(doc.indexOf("## Targeted heading")).from;
    expect(fps.some((f) => f.from === headingPos && f.key.includes("md-h2"))).toBe(
      true
    );
    expect(fps.some((f) => f.key.includes("widget:MathWidget"))).toBe(true);
    expect(fps.some((f) => f.key.includes("widget:EmojiWidget"))).toBe(true);
    expect(fps.some((f) => f.key.includes("widget:MarkWidget"))).toBe(true);
    expect(fps.some((f) => f.key.includes("widget:TableWidget"))).toBe(true);
    expect(fps.some((f) => f.key.includes("widget:FenceWidget"))).toBe(true);
  });

  it("未提供窗口时保持全量计算（旧调用兼容）", () => {
    const doc = buildDoc(60);
    const state = stateOf(doc);
    const legacy = fingerprints(computeLiveRanges(state, state.doc.length, RESOLVE_ALL));
    const explicitNull = fingerprints(
      computeLiveRanges(state, state.doc.length, RESOLVE_ALL, 1, null, false, null)
    );
    expect(explicitNull).toEqual(legacy);
  });
});

describe("windowForViewport", () => {
  it("前后各留 MARGIN 行并在文档边界夹取", () => {
    const state = stateOf(buildDoc(500));
    const doc = state.doc;

    const win = windowForViewport(doc, doc.line(600).from, doc.line(650).to);
    expect(doc.lineAt(win.from).number).toBe(600 - WINDOW_MARGIN_LINES);
    expect(doc.lineAt(win.to).number).toBe(650 + WINDOW_MARGIN_LINES);

    const head = windowForViewport(doc, 0, doc.line(10).to);
    expect(head.from).toBe(0);

    const tail = windowForViewport(doc, doc.length - 5, doc.length);
    expect(tail.to).toBe(doc.length);
  });
});

describe("initialWindowFor（视图创建瞬间的初始窗口）", () => {
  it("以光标为中心 ±MARGIN 行，并在文档边界夹取", () => {
    const doc = buildDoc(500);
    const base = stateOf(doc);
    const midState = EditorState.create({
      doc,
      selection: { anchor: base.doc.line(900).from },
      extensions: [markdownExtensions()],
    });
    const midWin = initialWindowFor(midState);
    expect(midState.doc.lineAt(midWin.from).number).toBe(900 - WINDOW_MARGIN_LINES);
    expect(midState.doc.lineAt(midWin.to).number).toBe(900 + WINDOW_MARGIN_LINES);

    // 光标在文档头部 → from 夹到 0
    const headState = EditorState.create({
      doc,
      selection: { anchor: 0 },
      extensions: [markdownExtensions()],
    });
    expect(initialWindowFor(headState).from).toBe(0);

    // 小文档 → 全文档（等价全量）
    const small = stateOf("hello\n\nworld");
    const smallWin = initialWindowFor(small);
    expect(smallWin.from).toBe(0);
    expect(smallWin.to).toBe(small.doc.length);
  });

  it("windowField 创建时即持有初始窗口（不再是 null）", () => {
    const doc = buildDoc(500);
    const state = EditorState.create({
      doc,
      extensions: [windowField, markdownExtensions()],
    });
    const win = state.field(windowField);
    expect(win).not.toBeNull();
    // 光标（anchor 0 → 行 1）在文档头部：向前夹取到行 1，向后仅 500 行余量
    expect(state.doc.lineAt(win!.from).number).toBe(1);
    expect(state.doc.lineAt(win!.to).number).toBe(1 + WINDOW_MARGIN_LINES);
  });
});
