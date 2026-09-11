import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdownExtensions } from "../src/editor/languages";
import { livePreview } from "../src/editor/livePreview";

const DOC = `# T

\`\`\`js
const x = 1;
console.log(x);
\`\`\`

尾`;

describe("livePreview · 真实视图渲染", () => {
  it("代码块：两行 fence 压低为头尾，内容行都带 md-code-block 类", () => {
    const state = EditorState.create({
      doc: DOC,
      // 光标放在文档末尾，远离代码块
      selection: { anchor: DOC.length },
      extensions: [markdownExtensions(), livePreview(() => null)],
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = new EditorView({ state, parent: host });

    const lines = [...host.querySelectorAll(".cm-content > *")].map((el) => ({
      tag: el.tagName,
      cls: [...el.classList].join("."),
      text: el.textContent,
      style: el.getAttribute("style") ?? "",
    }));
    view.destroy();
    host.remove();

    // 回归锁定：紧跟 fence 的第一行内容必须带上 md-code-block
    const codeLines = lines.filter((l) => l.cls.includes("md-code-block"));
    expect(codeLines.map((l) => l.text)).toEqual(["const x = 1;", "console.log(x);"]);
    // 两行 fence 行：开行显示语言标签，闭行清空
    const fenceLines = lines.filter((l) => l.cls.includes("md-code-fence"));
    expect(fenceLines.map((l) => l.text)).toEqual(["js", ""]);
    expect(lines.filter((l) => l.cls.includes("md-h1"))).toHaveLength(1);
  });

  it("块级折叠间距与空行压缩落到 DOM", () => {
    const state = EditorState.create({
      doc: DOC,
      selection: { anchor: DOC.length },
      extensions: [markdownExtensions(), livePreview(() => null)],
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = new EditorView({ state, parent: host });

    // 分隔用空行被压缩（# 标题 与代码块、代码块与“尾”之间各一）
    const blank = host.querySelectorAll(".cm-content > .md-blank");
    expect(blank.length).toBeGreaterThanOrEqual(2);
    // 块首行通过行内 --md-space-before 携带折叠间距
    const spaced = [...host.querySelectorAll(".cm-content > .md-block")].filter(
      (el) => (el.getAttribute("style") ?? "").includes("--md-space-before")
    );
    expect(spaced.length).toBeGreaterThanOrEqual(1);

    view.destroy();
    host.remove();
  });
});
