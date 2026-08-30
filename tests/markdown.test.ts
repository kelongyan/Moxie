import { describe, expect, it } from "vitest";
import { renderMarkdown, type PreviewTokens } from "../src/preview/markdown";

const LIGHT: PreviewTokens = {
  scheme: "light",
  bg: "#f9f9fb",
  surface: "#ffffff",
  fg: "#17181c",
  secondary: "#5f636e",
  border: "#e7e8eb",
  borderStrong: "#d4d6db",
  accent: "#4a52a3",
  fontUi: "sans-serif",
  fontMono: "monospace",
};

const DARK: PreviewTokens = {
  scheme: "dark",
  bg: "#1a1b1f",
  surface: "#1d1e22",
  fg: "#e9eaee",
  secondary: "#a4a8b2",
  border: "#2e3037",
  borderStrong: "#3d3f47",
  accent: "#96a0f5",
  fontUi: "sans-serif",
  fontMono: "monospace",
};

describe("renderMarkdown", () => {
  it("renders headings, bold, inline code", () => {
    const html = renderMarkdown("# Title\n\npara **bold** `code`", LIGHT, "t.md");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("renders GFM tables", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |", LIGHT, "t.md");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders strikethrough", () => {
    const html = renderMarkdown("~~gone~~", LIGHT, "t.md");
    expect(html).toContain("<s>gone</s>");
  });

  it("renders task lists with checkboxes", () => {
    const html = renderMarkdown("- [ ] todo\n- [x] done", LIGHT, "t.md");
    expect(html).toContain('class="task-list-item"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  it("renders blockquote and hr", () => {
    const html = renderMarkdown("> quote\n\n---", LIGHT, "t.md");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<hr>");
  });

  it("autolinks plain urls", () => {
    const html = renderMarkdown("see https://example.com now", LIGHT, "t.md");
    expect(html).toContain('<a href="https://example.com"');
  });

  it("escapes raw html for safety", () => {
    const html = renderMarkdown("<script>alert(1)</script>", LIGHT, "t.md");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes title attribute", () => {
    const html = renderMarkdown("text", LIGHT, 'a"b<c');
    expect(html).toContain("a&quot;b&lt;c");
  });

  it("injects the given theme tokens", () => {
    const dark = renderMarkdown("x", DARK, "t.md");
    const light = renderMarkdown("x", LIGHT, "t.md");
    expect(dark).toContain("#1a1b1f");
    expect(dark).toContain("color-scheme: dark");
    expect(light).toContain("#f9f9fb");
    expect(light).toContain("color-scheme: light");
  });

  it("uses compact app-like article layout", () => {
    const html = renderMarkdown("x", LIGHT, "t.md");
    expect(html).toContain("max-width: min(72ch, 100%)");
    expect(html).toContain("padding: 20px 26px 56px");
    expect(html).toContain("padding-bottom: 0.3em");
  });
});
