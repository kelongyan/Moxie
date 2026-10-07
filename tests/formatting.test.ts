import { describe, expect, it } from "vitest";
import { EditorState, TransactionSpec } from "@codemirror/state";
import {
  linkSpec,
  toggleQuoteSpec,
  toggleWrapSpec,
} from "../src/editor/formatting";

function stateOf(doc: string, anchor: number, head?: number) {
  return EditorState.create({
    doc,
    selection: { anchor, head: head ?? anchor },
  });
}

function apply(state: EditorState, spec: TransactionSpec): EditorState {
  return state.update(spec).state;
}

describe("formatting · toggleWrapSpec（加粗/斜体/行内代码）", () => {
  it("无选区：插入成对标记并置于中间", () => {
    const s0 = stateOf("ab", 1);
    const spec = toggleWrapSpec(s0, "**");
    const s1 = apply(s0, spec);
    expect(s1.doc.toString()).toBe("a****b");
    expect(s1.selection.main.anchor).toBe(3);
  });

  it("无选区再按一次：取消空对并退出", () => {
    const s0 = stateOf("ab", 1);
    const s1 = apply(s0, toggleWrapSpec(s0, "**"));
    const s2 = apply(s1, toggleWrapSpec(s1, "**"));
    expect(s2.doc.toString()).toBe("ab");
    expect(s2.selection.main.anchor).toBe(1);
  });

  it("有选区：包裹并保持选区", () => {
    const s0 = stateOf("hello world", 0, 5);
    const s1 = apply(s0, toggleWrapSpec(s0, "**"));
    expect(s1.doc.toString()).toBe("**hello** world");
    expect(s1.selection.main.from).toBe(2);
    expect(s1.selection.main.to).toBe(7);
  });

  it("选中的是包裹内部：取消外层标记", () => {
    const s0 = stateOf("**hello**", 2, 7);
    const s1 = apply(s0, toggleWrapSpec(s0, "**"));
    expect(s1.doc.toString()).toBe("hello");
    expect(s1.selection.main.from).toBe(0);
    expect(s1.selection.main.to).toBe(5);
  });

  it("选区本身已含标记：直接剥掉", () => {
    const s0 = stateOf("**hello**", 0, 9);
    const s1 = apply(s0, toggleWrapSpec(s0, "**"));
    expect(s1.doc.toString()).toBe("hello");
  });
});

describe("formatting · linkSpec", () => {
  it("有选区：转链接并选中 url 占位", () => {
    const s0 = stateOf("标题", 0, 2);
    const s1 = apply(s0, linkSpec(s0));
    expect(s1.doc.toString()).toBe("[标题](https://)");
    expect(s1.selection.main.from).toBe(5);
    expect(s1.selection.main.to).toBe(13);
  });

  it("无选区：插入空文本链接", () => {
    const s0 = stateOf("", 0);
    const s1 = apply(s0, linkSpec(s0));
    expect(s1.doc.toString()).toBe("[](https://)");
    expect(s1.selection.main.from).toBe(3);
  });
});

describe("formatting · toggleQuoteSpec", () => {
  it("未引用选区行：加 > 前缀", () => {
    const s0 = stateOf("a\nb\nc", 0, 3);
    const s1 = apply(s0, toggleQuoteSpec(s0));
    expect(s1.doc.toString()).toBe("> a\n> b\nc");
  });

  it("已全部引用：去除前缀", () => {
    const s0 = stateOf("> a\n> b", 0, 7);
    const s1 = apply(s0, toggleQuoteSpec(s0));
    expect(s1.doc.toString()).toBe("a\nb");
  });

  it("空行跳过不加前缀", () => {
    const s0 = stateOf("a\n\nb", 0, 4);
    const s1 = apply(s0, toggleQuoteSpec(s0));
    expect(s1.doc.toString()).toBe("> a\n\n> b");
  });
});
