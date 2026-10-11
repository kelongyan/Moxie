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

  it("代码块顶栏：渲染现代 Header 工具条（语言胶囊与复制代码按钮）", () => {
    const state = EditorState.create({
      doc: DOC,
      selection: { anchor: DOC.length },
      extensions: [markdownExtensions(), livePreview(() => null)],
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = new EditorView({ state, parent: host });

    const header = host.querySelector(".cm-content .md-code-header");
    expect(header).not.toBeNull();

    const langBadge = header?.querySelector(".md-lang-badge");
    expect(langBadge).not.toBeNull();
    expect(langBadge?.querySelector(".md-lang-text")?.textContent).toBe("js");

    const copyBtn = header?.querySelector(".md-code-copy-btn") as HTMLButtonElement | null;
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.getAttribute("title")).toBe("复制代码");

    view.destroy();
    host.remove();
  });

  it("数学公式：点击公式弹出气泡编辑浮层，正文不漏出源码模式", () => {
    const mathDoc = "质能方程 $E=mc^2$ 演示";
    const state = EditorState.create({
      doc: mathDoc,
      selection: { anchor: 0 },
      extensions: [markdownExtensions(), livePreview(() => null)],
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = new EditorView({ state, parent: host });

    const mathEl = host.querySelector(".md-math-inline") as HTMLElement | null;
    expect(mathEl).not.toBeNull();
    expect(mathEl?.classList.contains("md-math-inline")).toBe(true);

    // 触发点击公式
    mathEl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // 气泡浮层挂载在 body 上
    const bubble = document.querySelector(".md-math-bubble") as HTMLElement | null;
    expect(bubble).not.toBeNull();
    const input = bubble?.querySelector(".md-math-input") as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();
    expect(input?.value).toBe("E=mc^2");

    // 清理气泡
    bubble?.remove();
    view.destroy();
    host.remove();
  });
});
