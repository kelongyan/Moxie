import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { makeHeadingLevelHandler } from "../src/editor/extensions";

function apply(doc: string, anchor: number, level: number) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const view = new EditorView({
    parent: host,
    state: EditorState.create({ doc }),
  });
  view.dispatch({ selection: { anchor } });
  const handled = makeHeadingLevelHandler(level)(view);
  const result = view.state.doc.toString();
  view.destroy();
  host.remove();
  return { handled, result };
}

describe("makeHeadingLevelHandler（Ctrl+0-6 标题级别）", () => {
  it("普通行转一级标题", () => {
    const { handled, result } = apply("标题行\n", 2, 1);
    expect(handled).toBe(true);
    expect(result).toBe("# 标题行\n");
  });

  it("已有标题改级别（# → ###）", () => {
    const { result } = apply("# 标题\n", 3, 3);
    expect(result).toBe("### 标题\n");
  });

  it("Ctrl+0 退回正文", () => {
    const { result } = apply("## 标题\n", 4, 0);
    expect(result).toBe("标题\n");
  });

  it("已是目标级别时不动", () => {
    const { result } = apply("## 标题\n", 4, 2);
    expect(result).toBe("## 标题\n");
  });
});
