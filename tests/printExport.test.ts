import { describe, expect, it } from "vitest";
import { renderShell } from "../src/preview/markdown";
import { collectPreviewTokens } from "../src/preview/markdown";
import toolbarSource from "../src/components/TitleToolbar.tsx?raw";
import printSource from "../src/preview/print.ts?raw";

const tokens = collectPreviewTokens({
  theme: "light",
  codeLineNumbers: false,
  narrow: false,
});

describe("打印样式（X-02）", () => {
  const shell = renderShell(tokens, "t");

  it("外壳里注入 @media print 与页边距", () => {
    expect(shell).toContain("@media print");
    expect(shell).toContain("@page { margin:");
  });

  it("分页保护覆盖标题与代码块/表格/图片", () => {
    expect(shell).toContain("break-after: avoid");
    expect(shell).toContain("break-inside: avoid");
    expect(shell).toMatch(/pre, table, blockquote, \.mermaid-block, figure, img/);
  });

  it("打印时去背景、去滚动条，外链展开 URL", () => {
    expect(shell).toContain("background: #fff !important");
    expect(shell).toContain('a[href^="http"]::after');
  });
});

describe("打印入口（X-01）", () => {
  it("走离屏 iframe + window.print，不新开窗口", () => {
    expect(printSource).toContain("iframe");
    expect(printSource).toContain("contentWindow");
    expect(printSource).toContain(".print()");
    // 不新开窗口：源码里没有 WebviewWindow 的导入
    expect(printSource).not.toMatch(/import[^;]*WebviewWindow/);
  });

  it("应用菜单有「打印 / 导出 PDF…」并调用 printDocument", () => {
    expect(toolbarSource).toContain('label: "打印 / 导出 PDF…"');
    expect(toolbarSource).toMatch(
      /label: "打印 \/ 导出 PDF…"[\s\S]{0,120}runPrint\(\)/
    );
  });
});
