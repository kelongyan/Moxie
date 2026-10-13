import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { markdownExtensions } from "../src/editor/languages";
import { highlightExtension } from "../src/editor/highlightTheme";
import { computeLiveRanges, frontmatterRange } from "../src/editor/livePreview";
import { splitFrontmatter } from "../src/preview/markdownCore";

/**
 * 书写面语法的渲染边界（docs/成熟度差距分析.md §4.1）：
 * - frontmatter 已修复为整块弱化（md-frontmatter），不再被误渲染成
 *   分割线 + Setext 二级标题；
 * - [TOC] / deflist / abbr 仍只在导出侧支持，书写面显示原文——这些是**现状记录**，
 *   将来补上后对应断言会失败，届时按新行为更新（这正是它的用途）。
 */
const RESOLVE = (raw: string): string => `asset://${raw}`;

function stateOf(doc: string) {
  return EditorState.create({
    doc,
    extensions: [markdownExtensions(), highlightExtension()],
  });
}

/** 顶层节点（Document 直接子节点）名 */
function topLevelNames(doc: string): string[] {
  const state = stateOf(doc);
  const names: string[] = [];
  syntaxTree(state).iterate({
    enter: (it) => {
      if (it.node.parent?.name === "Document") names.push(it.node.name);
    },
  });
  return names;
}

/** 行类装饰集合 */
function lineClasses(doc: string): Set<string> {
  const state = stateOf(doc);
  const out = new Set<string>();
  for (const r of computeLiveRanges(state, state.doc.length, RESOLVE)) {
    const cls = (r.value.spec as { class?: string }).class;
    if (cls) for (const c of cls.split(" ")) out.add(c);
  }
  return out;
}

/** widget 类名集合 */
function widgetNames(doc: string): Set<string> {
  const state = stateOf(doc);
  const out = new Set<string>();
  for (const r of computeLiveRanges(state, state.doc.length, RESOLVE)) {
    const w = (r.value.spec as { widget?: { constructor: { name: string } } }).widget;
    if (w) out.add(w.constructor.name);
  }
  return out;
}

const FRONTMATTER_DOC = "---\ntitle: 测试\n tags: [a, b]\n---\n\n正文段落\n";

describe("frontmatterRange（与导出侧 splitFrontmatter 判定一致）", () => {
  it("识别 --- 包裹的 YAML 头，范围含首尾 --- 行", () => {
    const state = stateOf(FRONTMATTER_DOC);
    const range = frontmatterRange(state.doc);
    expect(range).not.toBeNull();
    expect(range!.from).toBe(0);
    // 收尾 --- 行末
    expect(FRONTMATTER_DOC.slice(range!.from, range!.to)).toBe(
      "---\ntitle: 测试\n tags: [a, b]\n---"
    );
  });

  it("... 收尾同样识别", () => {
    const doc = "---\na: 1\n...\n\n正文\n";
    const state = stateOf(doc);
    const range = frontmatterRange(state.doc);
    expect(range).not.toBeNull();
    expect(doc.slice(range!.from, range!.to)).toBe("---\na: 1\n...");
  });

  it("无 frontmatter 的文档返回 null", () => {
    for (const doc of [
      "正文\n",
      "前文\n\n---\n\n后文\n",
      "---\n",
      "# 标题\n\n---\n\n正文\n",
      "  ---\n内容\n---\n",
    ]) {
      const state = stateOf(doc);
      expect(frontmatterRange(state.doc)).toBeNull();
    }
  });

  it("空头（--- 紧跟 ---）不算 frontmatter", () => {
    const doc = "---\n---\n\n正文\n";
    const state = stateOf(doc);
    expect(frontmatterRange(state.doc)).toBeNull();
  });

  it("与导出侧 splitFrontmatter 的判定一致（抽样对照）", () => {
    const samples = [
      FRONTMATTER_DOC,
      "---\na: 1\n...\n\n正文\n",
      "---\n---\n\n正文\n",
      "正文\n\n---\n\n后文\n",
      "---\n",
      "---\nonly: one\n\n正文\n",
    ];
    for (const doc of samples) {
      const state = stateOf(doc);
      const mine = frontmatterRange(state.doc);
      const theirs = splitFrontmatter(doc);
      // 导出侧以"正文是否被剥离"为准：lineOffset > 0 ⇔ 存在 frontmatter
      expect(mine !== null).toBe(theirs.lineOffset > 0);
    }
  });
});

describe("frontmatter 书写面渲染（已修复）", () => {
  it("整块弱化为 md-frontmatter，不再渲染分割线", () => {
    const classes = lineClasses(FRONTMATTER_DOC);
    expect(classes.has("md-frontmatter")).toBe(true);
    expect(classes.has("md-hr-line")).toBe(false);
    expect(widgetNames(FRONTMATTER_DOC).has("HorizontalRuleWidget")).toBe(false);
  });

  it("首行与收尾 --- 行都带弱化类（整块连续）", () => {
    const state = stateOf(FRONTMATTER_DOC);
    const weakened = computeLiveRanges(state, state.doc.length, RESOLVE)
      .filter((r) => ((r.value.spec as { class?: string }).class ?? "").includes("md-frontmatter"))
      .map((r) => state.doc.lineAt(r.from).number);
    expect(weakened).toEqual([1, 2, 3, 4]);
  });

  it("正文段落不受影响（仍按普通段落渲染）", () => {
    const classes = lineClasses(FRONTMATTER_DOC);
    expect(classes.has("md-block")).toBe(true);
  });

  it("YAML 值里的 $ 与 :x: 不被当成公式 / emoji 渲染", () => {
    const doc = "---\nprice: $100\ntag: :smile:\n---\n\n正文\n";
    const widgets = widgetNames(doc);
    expect(widgets.has("MathWidget")).toBe(false);
    expect(widgets.has("EmojiWidget")).toBe(false);
  });

  it("frontmatter 不参与块间距（首块之后的正文间距按无 frontmatter 的块序计算）", () => {
    const withFm = lineClasses("---\na: 1\n---\n\n正文\n");
    const withoutFm = lineClasses("正文\n");
    // 两者都只应有正文块类，frontmatter 不产生 hr/heading 块
    expect(withFm.has("md-hr-line")).toBe(false);
    expect(withoutFm.has("md-block")).toBe(true);
  });

  it("窗口化计算下，frontmatter 行类也按窗口夹取（窗口外不产生装饰）", () => {
    // 长文档：frontmatter 在头部，窗口落在中部
    const doc = [
      "---",
      "title: 测试",
      "---",
      "",
      ...Array.from({ length: 2000 }, (_, i) => `line ${i}`),
    ].join("\n");
    const state = stateOf(doc);
    const win = { from: state.doc.line(1500).from, to: state.doc.line(1600).to };
    const ranges = computeLiveRanges(state, win.to, RESOLVE, 1, null, false, win);
    // 窗口外：不得有任何装饰（含 frontmatter 行类）
    for (const r of ranges) {
      expect(r.to >= win.from && r.from <= win.to).toBe(true);
    }
    const fmClasses = ranges.filter((r) =>
      ((r.value.spec as { class?: string }).class ?? "").includes("md-frontmatter")
    );
    expect(fmClasses).toEqual([]);
  });
});

describe("仅导出侧支持的语法在书写面的现状（待补）", () => {
  it("[TOC] 解析为普通段落，无装饰", () => {
    const doc = "# 标题\n\n[TOC]\n\n正文\n";
    expect(topLevelNames(doc)).toEqual([
      "ATXHeading1",
      "Paragraph",
      "Paragraph",
    ]);
    expect(lineClasses(doc).has("md-toc")).toBe(false);
  });

  it("deflist 解析为单个段落", () => {
    expect(topLevelNames("术语\n: 定义内容\n")).toEqual(["Paragraph"]);
  });

  it("abbr 定义解析为普通段落", () => {
    expect(
      topLevelNames("*[HTML]: HyperText Markup Language\n\nHTML 是标记语言\n")
    ).toEqual(["Paragraph", "Paragraph"]);
  });
});
