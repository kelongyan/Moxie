import { describe, expect, it } from "vitest";
import { renderWithPlugins } from "../src/preview/markdownCore";
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

const DARK: PreviewTokens = { ...LIGHT, scheme: "dark", bg: "#1a1b1f", fg: "#e9eaee" };

function makeDoc(paragraphs: number): string {
  const parts: string[] = [];
  for (let i = 0; i < paragraphs; i++) {
    parts.push(`## Section ${i}`);
    parts.push(
      `Paragraph ${i} with **bold**, *italic*, \`code\`, and a [link](https://example.com).`
    );
    parts.push("");
  }
  return parts.join("\n");
}

describe("GFM subset regression", () => {
  it("renders nested lists", () => {
    const { html } = renderWithPlugins("- a\n  - b\n    - c\n- d", {});
    expect(html.match(/<ul[^>]*>/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(html).toContain("<li");
  });

  it("renders table with alignment", () => {
    const { html } = renderWithPlugins("| a | b |\n|:--|--:|\n| 1 | 2 |", {});
    expect(html).toContain("table-wrap");
    expect(html).toContain('style="text-align:left"');
    expect(html).toContain('style="text-align:right"');
  });

  it("renders footnotes with back references", () => {
    const { html } = renderWithPlugins("text[^1]\n\n[^1]: note", {});
    expect(html).toContain('class="footnote-ref"');
    expect(html).toContain('class="footnote-backref"');
  });

  it("renders task lists and keeps data-line per item", () => {
    const { html } = renderWithPlugins("- [ ] a\n- [x] b", {});
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('data-line="0"');
    expect(html).toContain('data-line="1"');
  });

  it("frontmatter stripping does not break body", () => {
    const { html, lineOffset } = renderWithPlugins("---\ntitle: x\n---\n# H\n\nbody", {});
    expect(html).not.toContain("title: x");
    expect(html).toContain('id="h"');
    expect(lineOffset).toBe(3);
  });
});

describe("preview snapshot", () => {
  const sample = "# Title\n\npara **bold** `code`\n\n- [ ] todo\n\n| a |\n|---|\n| 1 |";

  it("light theme", () => {
    expect(renderMarkdown(sample, LIGHT, "doc.md")).toMatchSnapshot();
  });

  it("dark theme", () => {
    expect(renderMarkdown(sample, DARK, "doc.md")).toMatchSnapshot();
  });
});

describe("render performance baseline", () => {
  it("renders ~10k chars within budget", () => {
    const doc = makeDoc(120);
    expect(doc.length).toBeGreaterThan(8_000);
    const t0 = performance.now();
    const { html } = renderWithPlugins(doc, {});
    const dur = performance.now() - t0;
    expect(html.length).toBeGreaterThan(0);
    expect(dur).toBeLessThan(2_000);
  });

  it("renders ~50k chars within budget", () => {
    const doc = makeDoc(600);
    expect(doc.length).toBeGreaterThan(40_000);
    const t0 = performance.now();
    const { html } = renderWithPlugins(doc, {});
    const dur = performance.now() - t0;
    expect(html.length).toBeGreaterThan(0);
    expect(dur).toBeLessThan(5_000);
  });
});
