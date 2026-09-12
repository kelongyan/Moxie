import { describe, expect, it } from "vitest";
import { EditorState, Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { markdownExtensions } from "../src/editor/languages";
import { computeLiveRanges } from "../src/editor/livePreview";

const RESOLVE_ALL = (raw: string): string => `asset://${raw}`;
const RESOLVE_NONE = (): string | null => null;

function stateOf(doc: string, anchor: number) {
  return EditorState.create({
    doc,
    selection: { anchor },
    // 与生产一致：markdown + GFM + 围栏嵌入语言
    extensions: [markdownExtensions()],
  });
}

function rangesOf(
  doc: string,
  anchor: number,
  resolver: (raw: string) => string | null = RESOLVE_ALL
) {
  const state = stateOf(doc, anchor);
  return computeLiveRanges(state, state.doc.length, resolver);
}

type AnySpec = { class?: string; widget?: unknown; attributes?: { style?: string } };

/** 隐藏文本的区间（无 widget、无 class 的 replace） */
function plainHides(ranges: Range<Decoration>[]): [number, number][] {
  return ranges
    .filter((r) => {
      const spec = r.value.spec as AnySpec;
      return !spec.class && !spec.widget;
    })
    .map((r) => [r.from, r.to] as [number, number]);
}

function widgets(ranges: Range<Decoration>[]) {
  return ranges
    .filter((r) => {
      const spec = r.value.spec as AnySpec;
      return spec.widget;
    })
    .map((r) => ({
      from: r.from,
      to: r.to,
      widget: spec2widget(r.value.spec),
    }));
}

type WidgetLike = { src?: string; checked?: boolean; lang?: string; level?: number };
function spec2widget(spec: unknown): WidgetLike {
  return (spec as { widget: WidgetLike }).widget;
}

function lineClasses(ranges: Range<Decoration>[]) {
  return ranges
    .filter((r) => (r.value.spec as AnySpec).class)
    .map((r) => ({ from: r.from, classes: (r.value.spec as AnySpec).class!.split(" ") }));
}

function hasClass(ranges: Range<Decoration>[], from: number, token: string) {
  return lineClasses(ranges).some((l) => l.from === from && l.classes.includes(token));
}

/** 行装饰上的行内样式（--md-space-before 折叠间距） */
function lineAttrs(ranges: Range<Decoration>[]) {
  return ranges
    .filter((r) => (r.value.spec as AnySpec).attributes)
    .map((r) => ({
      from: r.from,
      style: (r.value.spec as AnySpec).attributes!.style ?? "",
    }));
}

/** 隐藏区间作用后实际可见的文本 */
function visibleText(doc: string, ranges: Range<Decoration>[]): string {
  const hides = plainHides(ranges).sort((a, b) => a[0] - b[0]);
  let out = "";
  let pos = 0;
  for (const [from, to] of hides) {
    out += doc.slice(pos, from);
    pos = to;
  }
  return out + doc.slice(pos);
}

describe("livePreview · 标题", () => {
  const doc = "# 标题\n正文\n";

  it("光标不在标题行时隐藏 # 与后续空格", () => {
    const ranges = rangesOf(doc, 5);
    expect(plainHides(ranges)).toContainEqual([0, 2]);
    expect(visibleText(doc, ranges)).toBe("标题\n正文\n");
    expect(hasClass(ranges, 0, "md-h1")).toBe(true);
  });

  it("光标在标题行时显示原始 #", () => {
    const ranges = rangesOf(doc, 0);
    expect(plainHides(ranges)).toEqual([]);
  });
});

describe("livePreview · 强调与行内代码", () => {
  it("光标不在粗体范围内时隐藏 **", () => {
    const doc = "a **b** c";
    const ranges = rangesOf(doc, 0);
    expect(plainHides(ranges)).toEqual([
      [2, 4],
      [5, 7],
    ]);
    expect(visibleText(doc, ranges)).toBe("a b c");
  });

  it("光标进入粗体时显示原始标记", () => {
    const ranges = rangesOf("a **b** c", 4);
    expect(plainHides(ranges)).toEqual([]);
  });

  it("隐藏行内代码的反引号", () => {
    const doc = "用 `code` 坐";
    const ranges = rangesOf(doc, 0);
    expect(plainHides(ranges)).toEqual([
      [2, 3],
      [7, 8],
    ]);
    expect(visibleText(doc, ranges)).toBe("用 code 坐");
  });
});

describe("livePreview · 链接", () => {
  const doc = "看 [文本](https://example.com) 尾";

  it("光标不在链接内时只剩链接文字", () => {
    const ranges = rangesOf(doc, 0);
    expect(visibleText(doc, ranges)).toBe("看 文本 尾");
  });

  it("光标进入链接时显示完整语法", () => {
    const ranges = rangesOf(doc, 3);
    expect(plainHides(ranges)).toEqual([]);
  });
});

describe("livePreview · 代码围栏", () => {
  const doc = "```js\nconst x = 1;\n```\n尾行";

  it("光标在块外时：开 fence 变语言标签，闭 fence 隐藏，内容行带代码块类", () => {
    const ranges = rangesOf(doc, 24);
    // 开 fence（```js [0,5)）→ FenceWidget("js")
    const ws = widgets(ranges).filter((w) => w.widget.lang !== undefined);
    expect(ws).toEqual([{ from: 0, to: 5, widget: { lang: "js" } }]);
    // 闭 fence（``` [19,22)）→ 纯隐藏
    expect(plainHides(ranges)).toContainEqual([19, 22]);
    expect(hasClass(ranges, 0, "md-code-fence")).toBe(true);
    expect(hasClass(ranges, 0, "md-code-fence-open")).toBe(true);
    expect(hasClass(ranges, 6, "md-code-block")).toBe(true);
    expect(hasClass(ranges, 19, "md-code-fence")).toBe(true);
    expect(hasClass(ranges, 19, "md-code-fence-close")).toBe(true);
  });

  it("光标进入代码块时显示 fence 行原文", () => {
    const ranges = rangesOf(doc, 8);
    expect(plainHides(ranges)).toEqual([]);
    expect(widgets(ranges)).toEqual([]);
  });
});

describe("livePreview · 图片", () => {
  const doc = "![logo](./a.png)\n后文";

  it("光标不在图片内时替换为图片 widget", () => {
    const ranges = rangesOf(doc, 17);
    const ws = widgets(ranges);
    expect(ws).toHaveLength(1);
    expect(ws[0].from).toBe(0);
    expect(ws[0].to).toBe(16);
    expect(ws[0].widget.src).toBe("asset://./a.png");
  });

  it("解析不出地址时保持原文（无 widget）", () => {
    const ranges = rangesOf(doc, 17, RESOLVE_NONE);
    expect(widgets(ranges)).toHaveLength(0);
  });

  it("光标进入图片范围时显示原始语法", () => {
    const ranges = rangesOf(doc, 8);
    expect(widgets(ranges)).toHaveLength(0);
  });
});

describe("livePreview · 引用 / 分割线 / 任务清单", () => {
  it("光标不在引用行时隐藏 > 标记并加行样式", () => {
    const doc = "> 引用行\n正文";
    const ranges = rangesOf(doc, 7);
    expect(plainHides(ranges)).toContainEqual([0, 2]);
    expect(hasClass(ranges, 0, "md-quote")).toBe(true);
    expect(hasClass(ranges, 0, "md-quote-first")).toBe(true);
  });

  it("光标在引用行时显示原始 >", () => {
    const ranges = rangesOf("> 引用行\n正文", 2);
    expect(plainHides(ranges)).toEqual([]);
  });

  it("隐藏删除线 ~~ 标记", () => {
    const doc = "a ~~删~~ b";
    const ranges = rangesOf(doc, 0);
    expect(plainHides(ranges)).toEqual([
      [2, 4],
      [5, 7],
    ]);
    expect(visibleText(doc, ranges)).toBe("a 删 b");
  });

  it("分割线替换为 hr widget", () => {
    const doc = "前文\n\n---\n\n后文";
    const ranges = rangesOf(doc, 0);
    const ws = widgets(ranges);
    expect(ws).toHaveLength(1);
    expect(ws[0].from).toBe(4);
    expect(ws[0].to).toBe(7);
  });

  it("任务清单替换为 checkbox widget，勾选状态正确", () => {
    const doc = "- [x] 完成\n- [ ] 待办";
    // 光标在第 2 行：第 2 行显原文，第 1 行渲染成 checkbox
    const atLine2 = widgets(rangesOf(doc, 16));
    expect(atLine2.map((w) => [w.from, w.to, w.widget.checked])).toEqual([
      [2, 5, true],
    ]);
    // 光标在第 1 行：反过来，第 2 行渲染成未勾选 checkbox
    const atLine1 = widgets(rangesOf(doc, 4));
    expect(atLine1.map((w) => [w.from, w.to, w.widget.checked])).toEqual([
      [11, 14, false],
    ]);
  });
});

describe("livePreview · 折叠间距（对齐 TizuMark）", () => {
  it("首块不加外部间距", () => {
    const ranges = rangesOf("正文\n", 0);
    expect(lineAttrs(ranges)).toEqual([]);
    expect(hasClass(ranges, 0, "md-block")).toBe(true);
  });

  it("段→段：折叠 14px = 压缩空行(8) + padding(6)", () => {
    // "第一段\n\n第二段\n"：line1 from0、line2(空) from4、line3 from5、line4(空) from9
    const ranges = rangesOf("第一段\n\n第二段\n", 0);
    expect(hasClass(ranges, 4, "md-blank")).toBe(true);
    expect(lineAttrs(ranges)).toEqual([
      { from: 5, style: "--md-space-before:6px" },
    ]);
  });

  it("段→标题：折叠 24px = 空行(8) + padding(16)", () => {
    // "正文\n\n# 标题\n"：line3(from4) 是标题行
    const ranges = rangesOf("正文\n\n# 标题\n", 8);
    expect(lineAttrs(ranges)).toEqual([
      { from: 4, style: "--md-space-before:16px" },
    ]);
  });

  it("标题→段：折叠 12px = 空行(8) + padding(4)", () => {
    // "# 标题\n\n正文\n"：line3(from6) 是正文行
    const ranges = rangesOf("# 标题\n\n正文\n", 8);
    expect(lineAttrs(ranges)).toEqual([
      { from: 6, style: "--md-space-before:4px" },
    ]);
  });

  it("段→代码块：折叠 16px，代码块用 fence 类承载而非 md-block", () => {
    // "正文\n\n```js\nx\n```\n"：开 fence 行 from4
    const ranges = rangesOf("正文\n\n```js\nx\n```\n", 0);
    expect(lineAttrs(ranges)).toEqual([
      { from: 4, style: "--md-space-before:8px" },
    ]);
    expect(hasClass(ranges, 4, "md-code-fence-open")).toBe(true);
    expect(hasClass(ranges, 4, "md-block")).toBe(false);
  });

  it("分割线→段：折叠 24px = 空行(8) + padding(16)", () => {
    // "---\n\n后文\n"：line1 hr、line3(from5) 正文
    const ranges = rangesOf("---\n\n后文\n", 7);
    expect(hasClass(ranges, 0, "md-hr-line")).toBe(true);
    expect(hasClass(ranges, 4, "md-blank")).toBe(true);
    expect(lineAttrs(ranges)).toEqual([
      { from: 5, style: "--md-space-before:16px" },
    ]);
  });

  it("多行段落只在首行加间距，续行不加", () => {
    // "第一行\n第二行\n\n第三段\n"：line1 from0、line2 from4、line3(空) from8、line4 from9
    const ranges = rangesOf("第一行\n第二行\n\n第三段\n", 0);
    expect(lineAttrs(ranges)).toEqual([
      { from: 9, style: "--md-space-before:6px" },
    ]);
    expect(hasClass(ranges, 4, "md-block")).toBe(false);
  });

  it("围栏代码块内的空行不被压缩", () => {
    // "```\na\n\nb\n```\n"：块内空行 from6
    const ranges = rangesOf("```\na\n\nb\n```\n", 0);
    expect(hasClass(ranges, 6, "md-code-block")).toBe(true);
    expect(hasClass(ranges, 6, "md-blank")).toBe(false);
  });

  it("列表项之间加 md-li-end，末项不加", () => {
    const ranges = rangesOf("- 一\n- 二\n", 0);
    expect(hasClass(ranges, 0, "md-li-end")).toBe(true);
    // 第二项（末项）所在行 from4 不应带 md-li-end
    expect(hasClass(ranges, 4, "md-li-end")).toBe(false);
  });
});

describe("livePreview · 引用内空行压缩", () => {
  it("引用内的空引用行（>）带 md-blank，压缩为分隔空行高度", () => {
    // "引用一\n>\n引用二\n"：line2 ">" from4
    const ranges = rangesOf("引用一\n>\n引用二\n", 0);
    expect(hasClass(ranges, 4, "md-quote")).toBe(true);
    expect(hasClass(ranges, 4, "md-blank")).toBe(true);
  });

  it("嵌套引用的空行（>>）同样压缩", () => {
    // "a\n>>\nb\n"：line2 ">>" from2
    const ranges = rangesOf("a\n>>\nb\n", 0);
    expect(hasClass(ranges, 2, "md-blank")).toBe(true);
  });

  it("光标停在空引用行上时不压缩，保留可编辑原文行", () => {
    // anchor 放在 ">" 行上（from=4）
    const ranges = rangesOf("引用一\n>\n引用二\n", 4);
    expect(hasClass(ranges, 4, "md-quote")).toBe(true);
    expect(hasClass(ranges, 4, "md-blank")).toBe(false);
  });

  it("非空引用行不带 md-blank", () => {
    const ranges = rangesOf("> 正文行\n> 第二行\n", 0);
    expect(hasClass(ranges, 0, "md-blank")).toBe(false);
    expect(hasClass(ranges, 6, "md-blank")).toBe(false);
  });
});

describe("livePreview · 无序列表符号 widget", () => {
  it("光标不在行上时列表标记替换为项目符号（•）", () => {
    // 锚点放在后续段落上，两行列表都不被光标触碰
    const ranges = rangesOf("- 一\n- 二\n\n后文\n", 12);
    const bullets = widgets(ranges).filter((w) => "level" in w.widget);
    expect(bullets).toEqual([
      { from: 0, to: 1, widget: { level: 0 } },
      { from: 4, to: 5, widget: { level: 0 } },
    ]);
  });

  it("嵌套层级使用下一级符号（◦），层级深度按祖先 BulletList 计数", () => {
    const ranges = rangesOf("- 一\n  - 二\n\n后文\n", 14);
    const bullets = widgets(ranges).filter((w) => "level" in w.widget);
    expect(bullets).toEqual([
      { from: 0, to: 1, widget: { level: 0 } },
      { from: 6, to: 7, widget: { level: 1 } },
    ]);
  });

  it("光标在列表行上时显示原始标记", () => {
    const ranges = rangesOf("- 一\n", 0);
    expect(widgets(ranges).some((w) => "level" in w.widget)).toBe(false);
  });

  it("任务行不替换项目符号（由任务分支处理双标记）", () => {
    // 锚点放在前文段落上，任务行不被光标触碰
    const ranges = rangesOf("前文\n\n- [x] 已完成\n", 0);
    expect(widgets(ranges).some((w) => "level" in w.widget)).toBe(false);
    // 行首 "- " 被隐藏（保留缩进），仅剩 checkbox（任务行从 4 开始）
    expect(plainHides(ranges)).toContainEqual([4, 6]);
    expect(widgets(ranges).some((w) => "checked" in w.widget)).toBe(true);
  });

  it("有序列表保持原文标记", () => {
    const ranges = rangesOf("1. 一\n", 4);
    expect(widgets(ranges).some((w) => "level" in w.widget)).toBe(false);
    expect(plainHides(ranges)).toEqual([]);
  });
});

describe("livePreview · 块间距缩放贯通", () => {
  it("scale=1.5 时段间距按比例注入（14×1.5-8=13）", () => {
    const state = stateOf("第一段\n\n第二段\n", 0);
    const ranges = computeLiveRanges(state, state.doc.length, RESOLVE_ALL, 1.5);
    expect(lineAttrs(ranges)).toEqual([
      { from: 5, style: "--md-space-before:13px" },
    ]);
  });
});

describe("livePreview · 表格只读 widget", () => {
  const TABLE_DOC = "前文\n\n| 列一 | 列二 |\n| --- | --- |\n| a | b |\n| c | d |\n\n后文\n";

  it("光标不在表格内时整块替换为 TableWidget，含表头与数据行", () => {
    const ranges = rangesOf(TABLE_DOC, 0);
    const tables = widgets(ranges).filter((w) => "header" in (w.widget as object));
    expect(tables).toHaveLength(1);
    const widget = tables[0].widget as unknown as {
      header: string[];
      rows: string[][];
      gap: number;
    };
    expect(widget.header).toEqual(["列一", "列二"]);
    expect(widget.rows).toEqual([["a", "b"], ["c", "d"]]);
    // 前文段落(底14) → 表格(上0) 折叠 14，扣除 1 个压缩空行(8) = 6
    expect(widget.gap).toBe(6);
    // 替换范围覆盖表格全部 4 行（"前文\n\n" = 4 起，到 | c | d | 行尾）
    expect(tables[0].from).toBe(4);
    expect(tables[0].to).toBe(4 + "| 列一 | 列二 |\n| --- | --- |\n| a | b |\n| c | d |".length);
  });

  it("光标进入表格时还原源码", () => {
    const ranges = rangesOf(TABLE_DOC, 20);
    const tables = widgets(ranges).filter((w) => "header" in (w.widget as object));
    expect(tables).toHaveLength(0);
  });

  it("表格作为独立块参与空行压缩，后文块从表格底边距折叠", () => {
    // 表格(底16) → 后文段落(上0) 折叠 16，扣除 1 个压缩空行(8) = 8
    const ranges = rangesOf(TABLE_DOC, TABLE_DOC.length - 3);
    const after = lineAttrs(ranges).find((l) => l.from > 40);
    expect(after?.style).toBe("--md-space-before:8px");
  });

  it("文档首个块是表格时 gap 为 0", () => {
    // 锚点放在表格后的段落上（Table 节点 [0,33]，后文行 from 34）
    const ranges = rangesOf("| a | b |\n| --- | --- |\n| c | d |\n\n后文\n", 35);
    const tables = widgets(ranges).filter((w) => "header" in (w.widget as object));
    expect(tables).toHaveLength(1);
    expect((tables[0].widget as unknown as { gap: number }).gap).toBe(0);
  });
});
