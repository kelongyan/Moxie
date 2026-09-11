import { describe, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";
import paneSource from "../src/components/EditorPane.tsx?raw";

/**
 * CodeMirror 基础主题给 .cm-editor 声明了 display: flex !important，
 * 行内 style.display = "none" 权重不足，隐藏不掉非当前标签的视图：
 * 多标签下所有视图都参与布局并纵向堆叠（每个 height: 100%），
 * 当前文档被顶到可视区之外。
 *
 * 隐藏标记也不能挂在 class 上：EditorView.updateAttrs() 在 focus/blur 时会
 * 整体重写 .cm-editor 的 class（cm-focused + 主题类），类名会被冲掉
 * （症状：切标签后旧编辑器仍可见）。用 CM 不管理的 data 属性 + 带 !important 的
 * 属性选择器（app.css 的 .cm-host .cm-editor[data-doc-hidden]）。
 */
describe("editor view visibility", () => {
  it("inline display cannot hide a CodeMirror view", () => {
    const view = new EditorView({ doc: "hello" });
    document.body.appendChild(view.dom);
    view.dom.style.display = "none";
    expect(getComputedStyle(view.dom).display).toBe("flex");
    view.destroy();
  });

  it("EditorPane hides inactive views by data attribute, not inline display", () => {
    expect(paneSource).toContain('setAttribute("data-doc-hidden"');
    expect(paneSource).toContain('removeAttribute("data-doc-hidden")');
    expect(paneSource).not.toMatch(/\.style\.display\s*=/);
  });

  it("EditorPane re-asserts visibility on the next frame (self-healing)", () => {
    // 快速切换/视图重建后可能残留旧可见态：下一帧按 store 最新 activeId 再同步一次；
    // 同步按 DOM 遍历（而不是 registry），保证只有一个编辑器可见
    expect(paneSource).toContain("requestAnimationFrame");
    expect(paneSource).toContain("syncVisibility");
    expect(paneSource).toContain("el.dataset.docId === activeIdNow");
  });
});
