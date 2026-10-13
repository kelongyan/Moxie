import { describe, expect, it } from "vitest";
import { extractMermaidBlocks } from "../src/preview/exportHtml";

/**
 * 导出 mermaid 预渲染的纯函数部分（docs/渲染优化方案.md O-7 / F-18 遗留）：
 * 围栏块提取的边界（``` / ~~~、info 带参数、未闭合、多个块）。
 * 实际渲染为内联 SVG 依赖真实浏览器环境（mermaid），由实机导出验证。
 */
describe("extractMermaidBlocks", () => {
  it("提取基本块与源码，位置覆盖整块（含闭合围栏）", () => {
    const text = "before\n```mermaid\ngraph TD;\nA-->B;\n```\nafter";
    const blocks = extractMermaidBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].source).toBe("graph TD;\nA-->B;");
    expect(text.slice(blocks[0].from, blocks[0].to)).toBe(
      "```mermaid\ngraph TD;\nA-->B;\n```"
    );
  });

  it("支持 ~~~ 围栏、info 带参数（mermaid title），且不误吃其他围栏", () => {
    const text = [
      "```js",
      "const x = 1;",
      "```",
      "~~~mermaid title",
      "flowchart LR;",
      "~~~",
    ].join("\n");
    const blocks = extractMermaidBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].source).toBe("flowchart LR;");
  });

  it("未闭合块取到文档尾", () => {
    const text = "head\n```mermaid\ngraph TD;\nA-->B;";
    const blocks = extractMermaidBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].to).toBe(text.length);
    expect(blocks[0].source).toContain("A-->B;");
  });

  it("多个块按文档顺序返回", () => {
    const text = [
      "```mermaid",
      "graph A;",
      "```",
      "text between",
      "```mermaid",
      "graph B;",
      "```",
    ].join("\n");
    const blocks = extractMermaidBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].source).toBe("graph A;");
    expect(blocks[1].source).toBe("graph B;");
    expect(blocks[0].to).toBeLessThan(blocks[1].from);
  });

  it("无 mermaid 块时返回空数组", () => {
    expect(extractMermaidBlocks("no fences\n\n```js\nx\n```")).toHaveLength(0);
    expect(extractMermaidBlocks("")).toHaveLength(0);
  });
});
