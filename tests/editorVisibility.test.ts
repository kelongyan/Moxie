import { describe, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";
import paneSource from "../src/components/EditorPane.tsx?raw";

/**
 * CodeMirror 基础主题给 .cm-editor 声明了 display: flex !important，
 * 行内 style.display = "none" 权重不足，隐藏不掉非当前标签的视图：
 * 多标签下所有视图都参与布局并纵向堆叠（每个 height: 100%），
 * 当前文档被顶到可视区之外。隐藏必须走同样带 !important 的类规则
 * （app.css 的 .cm-host .cm-editor.cm-doc-hidden）。
 */
describe("editor view visibility", () => {
  it("inline display cannot hide a CodeMirror view", () => {
    const view = new EditorView({ doc: "hello" });
    document.body.appendChild(view.dom);
    view.dom.style.display = "none";
    expect(getComputedStyle(view.dom).display).toBe("flex");
    view.destroy();
  });

  it("EditorPane hides inactive views by class, not inline display", () => {
    expect(paneSource).toContain('classList.toggle("cm-doc-hidden"');
    expect(paneSource).not.toMatch(/\.style\.display\s*=/);
  });
});
