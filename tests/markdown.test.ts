import { describe, expect, it } from "vitest";
import {
  directoryOf,
  renderBody,
  renderMarkdown,
  renderShell,
  resolveLocalImageSrc,
  splitFrontmatter,
  stripFrontmatter,
  taskToggleInLine,
  type PreviewTokens,
} from "../src/preview/markdown";
import { highlightToHtml, languageKeyOf } from "../src/preview/highlight";

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
  it("renders headings with anchor ids, bold, inline code", () => {
    const html = renderMarkdown("# Title\n\npara **bold** `code`", LIGHT, "t.md");
    expect(html).toMatch(/<h1[^>]*id="title"[^>]*>Title<\/h1>/);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("renders GFM tables", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |", LIGHT, "t.md");
    expect(html).toMatch(/<table[^>]*>/);
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders strikethrough", () => {
    const html = renderMarkdown("~~gone~~", LIGHT, "t.md");
    expect(html).toContain("<s>gone</s>");
  });

  it("renders task lists with checkboxes", () => {
    const html = renderMarkdown("- [ ] todo\n- [x] done", LIGHT, "t.md");
    expect(html).toContain("task-list-item");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  it("renders blockquote and hr", () => {
    const html = renderMarkdown("> quote\n\n---", LIGHT, "t.md");
    expect(html).toMatch(/<blockquote[^>]*>/);
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

  it("wraps tables in a horizontally scrollable container", () => {
    const html = renderMarkdown("| a |\n|---|\n| 1 |", LIGHT, "t.md");
    expect(html).toContain('<div class="table-wrap"><table');
    expect(html).toMatch(/<\/table>\s*<\/div>/);
  });
});

describe("renderShell / renderBody", () => {
  it("shell carries styles and an empty article", () => {
    const shell = renderShell(LIGHT, "t.md");
    expect(shell).toContain("<article></article>");
    expect(shell).toContain("color-scheme: light");
  });

  it("renderMarkdown equals shell composed with body", () => {
    const full = renderMarkdown("# t", LIGHT, "t.md");
    const body = renderBody("# t");
    expect(full).toContain(`<article>${body}</article>`);
  });

  it("rewrites relative image src against the document directory", () => {
    const html = renderBody("![图](img/a.png)", {
      baseDir: "D:\\notes",
      assetUrl: (p) => `asset://${p}`,
    });
    expect(html).toContain('src="asset://D:\\notes\\img\\a.png"');
  });

  it("keeps remote and data images untouched", () => {
    const html = renderBody("![](https://x.cn/a.png) ![](data:image/png;base64,AA)", {
      baseDir: "D:\\notes",
      assetUrl: (p) => `asset://${p}`,
    });
    expect(html).toContain('src="https://x.cn/a.png"');
    expect(html).toContain('src="data:image/png;base64,AA"');
  });

  it("leaves relative images as-is without a base directory", () => {
    const html = renderBody("![](img/a.png)");
    expect(html).toContain('src="img/a.png"');
  });
});

describe("directoryOf", () => {
  it("extracts the folder of a windows path", () => {
    expect(directoryOf("D:\\notes\\a.md")).toBe("D:\\notes");
    expect(directoryOf("D:/notes/sub/a.md")).toBe("D:/notes/sub");
  });

  it("returns null when no folder is present", () => {
    expect(directoryOf("a.md")).toBeNull();
    expect(directoryOf("D:\\a.md")).toBe("D:\\");
  });
});

describe("resolveLocalImageSrc", () => {
  const BASE = "D:\\notes";

  it("resolves relative paths against the base directory", () => {
    expect(resolveLocalImageSrc(BASE, "img/a.png")).toBe("D:\\notes\\img\\a.png");
    expect(resolveLocalImageSrc(BASE, "./a.png")).toBe("D:\\notes\\a.png");
    expect(resolveLocalImageSrc(BASE, "../up/a.png")).toBe("D:\\up\\a.png");
    expect(resolveLocalImageSrc(BASE, "b/../a.png")).toBe("D:\\notes\\a.png");
  });

  it("does not climb above the drive root", () => {
    expect(resolveLocalImageSrc(BASE, "../../a.png")).toBe("D:\\a.png");
  });

  it("accepts absolute windows paths and normalizes separators", () => {
    expect(resolveLocalImageSrc(BASE, "C:/pic/a.png")).toBe("C:\\pic\\a.png");
    expect(resolveLocalImageSrc(null, "C:\\pic\\a.png")).toBe("C:\\pic\\a.png");
  });

  it("decodes percent-encoding and strips query/fragment", () => {
    expect(resolveLocalImageSrc(BASE, "my%20pic.png?v=1")).toBe("D:\\notes\\my pic.png");
  });

  it("resolves file:/// urls", () => {
    expect(resolveLocalImageSrc(BASE, "file:///D:/pic/a.png")).toBe("D:\\pic\\a.png");
  });

  it("roots leading-slash paths on the base drive", () => {
    expect(resolveLocalImageSrc(BASE, "/pic/a.png")).toBe("D:\\pic\\a.png");
    expect(resolveLocalImageSrc(null, "/pic/a.png")).toBeNull();
  });

  it("keeps remote, data and anchor sources untouched", () => {
    expect(resolveLocalImageSrc(BASE, "https://x.cn/a.png")).toBeNull();
    expect(resolveLocalImageSrc(BASE, "data:image/png;base64,AA")).toBeNull();
    expect(resolveLocalImageSrc(BASE, "#top")).toBeNull();
    expect(resolveLocalImageSrc(BASE, "")).toBeNull();
  });
});

describe("highlight", () => {
  it("maps fence info to language keys", () => {
    expect(languageKeyOf("js")).toBe("js");
    expect(languageKeyOf("typescript")).toBe("ts");
    expect(languageKeyOf("Python")).toBe("py");
    expect(languageKeyOf("c++")).toBe("cpp");
    expect(languageKeyOf("unknown-lang")).toBeNull();
    expect(languageKeyOf("")).toBeNull();
  });

  it("highlights known languages with tok-* spans", () => {
    const html = highlightToHtml("let x = 1;", "js");
    expect(html).not.toBeNull();
    expect(html).toContain("tok-keyword");
    expect(html).toContain("tok-number");
    expect(html).toContain("<span");
  });

  it("returns null for unknown languages", () => {
    expect(highlightToHtml("whatever", "brainfuck")).toBeNull();
  });

  it("escapes html in code blocks", () => {
    const html = highlightToHtml("a < b && c", "js")!;
    expect(html).toContain("&lt;");
    expect(html).toContain("&amp;&amp;");
    expect(html).not.toContain("<b>");
  });

  it("renders fenced code through the markdown pipeline", () => {
    const html = renderMarkdown("```js\nlet x = 1;\n```", LIGHT, "t.md");
    expect(html).toContain('class="language-js"');
    expect(html).toContain("tok-keyword");
  });
});

describe("extended syntax", () => {
  it("renders footnotes with anchors and backrefs", () => {
    const html = renderMarkdown("text[^1]\n\n[^1]: note", LIGHT, "t.md");
    expect(html).toContain('class="footnote-ref"');
    expect(html).toContain('href="#fn1"');
    expect(html).toContain('id="fn1"');
    expect(html).toContain('class="footnote-backref"');
  });

  it("renders definition lists", () => {
    const html = renderMarkdown("Term\n: Definition", LIGHT, "t.md");
    expect(html).toMatch(/<dl[^>]*>/);
    expect(html).toMatch(/<dt[^>]*>Term<\/dt>/);
    expect(html).toMatch(/<dd[^>]*>Definition<\/dd>/);
  });

  it("renders subscript and superscript", () => {
    const html = renderMarkdown("H~2~O and E=mc^2^", LIGHT, "t.md");
    expect(html).toContain("<sub>2</sub>");
    expect(html).toContain("<sup>2</sup>");
  });

  it("dedupes repeated heading ids", () => {
    const html = renderMarkdown("# Sec\n\n## Sec\n\n### Sec", LIGHT, "t.md");
    expect(html).toContain('id="sec"');
    expect(html).toContain('id="sec-2"');
    expect(html).toContain('id="sec-3"');
  });

  it("keeps CJK characters in heading slugs", () => {
    const html = renderMarkdown("# 安装 指南", LIGHT, "t.md");
    expect(html).toContain('id="安装-指南"');
  });
});

describe("stripFrontmatter", () => {
  it("strips a leading yaml block", () => {
    expect(stripFrontmatter("---\ntitle: a\n---\nbody")).toBe("body");
  });

  it("strips with ... terminator", () => {
    expect(stripFrontmatter("---\nk: v\n...\nbody")).toBe("body");
  });

  it("keeps text without frontmatter", () => {
    expect(stripFrontmatter("# title")).toBe("# title");
    expect(stripFrontmatter("--- just a rule")).toBe("--- just a rule");
  });

  it("does not render frontmatter in output", () => {
    const html = renderMarkdown("---\ntitle: a\n---\n# Head", LIGHT, "t.md");
    expect(html).not.toContain("title: a");
    expect(html).toContain('id="head"');
  });
});

describe("render options", () => {
  it("breaks: false keeps GFM paragraph joining", () => {
    const html = renderBody("a\nb", { breaks: false });
    expect(html).toContain("a\nb");
    expect(html).not.toContain("<br>");
  });

  it("breaks: true renders single newlines as <br>", () => {
    const html = renderBody("a\nb", { breaks: true });
    expect(html).toContain("<br>");
  });

  it("typographer replaces straight quotes", () => {
    const on = renderBody('"quote"', { typographer: true });
    expect(on).toContain("\u201c");
    const off = renderBody('"quote"', { typographer: false });
    expect(off).toContain("&quot;quote&quot;");
  });
});

describe("data-line source mapping", () => {
  it("tags headings, paragraphs and fences with their start line", () => {
    const html = renderBody("# T\n\npara\n\n```js\nlet x=1;\n```", {});
    expect(html).toContain('<h1 data-line="0"');
    expect(html).toContain('<p data-line="2">');
    expect(html).toContain('<pre data-line="4"');
  });

  it("tags each task list item with its own line and enables the checkbox", () => {
    const html = renderBody("- [ ] a\n- [x] b", {});
    expect(html).toContain('<li class="task-list-item enabled" data-line="0">');
    expect(html).toContain('data-line="1"');
    // enabled:true 去掉 disabled，允许预览内勾选回写
    expect(html).not.toContain("disabled");
    expect(html).toContain('type="checkbox"');
  });

  it("frontmatter stripping keeps data-line aligned with the original source lines", () => {
    // "# H" 位于源文件第 4 行（index 3），剥离 3 行 frontmatter 后 data-line 需补偿回 3
    const html = renderBody("---\nk: v\n---\n# H", {});
    expect(html).toContain('<h1 data-line="3"');
  });
});

describe("splitFrontmatter", () => {
  it("reports the number of stripped lines", () => {
    expect(splitFrontmatter("---\nk: v\n---\nbody")).toEqual({
      body: "body",
      lineOffset: 3,
    });
    expect(splitFrontmatter("# t")).toEqual({ body: "# t", lineOffset: 0 });
  });
});

describe("taskToggleInLine", () => {
  it("toggles an unchecked box", () => {
    expect(taskToggleInLine("- [ ] todo")).toEqual({ index: 2, insert: "[x]" });
  });

  it("toggles a checked box back", () => {
    expect(taskToggleInLine("- [x] done")).toEqual({ index: 2, insert: "[ ]" });
    expect(taskToggleInLine("- [X] done")).toEqual({ index: 2, insert: "[ ]" });
  });

  it("returns null without a checkbox", () => {
    expect(taskToggleInLine("- plain item")).toBeNull();
    expect(taskToggleInLine("[not a box]")).toBeNull();
  });
});

describe("math", () => {
  it("renders inline math with katex", () => {
    const html = renderBody("Euler $e^{i\\pi}+1=0$", {});
    expect(html).toContain('class="katex"');
  });

  it("renders block math in a wrapper with data-line", () => {
    const html = renderBody("text\n\n$$\na=b\n$$", {});
    expect(html).toContain('class="math-block"');
    expect(html).toContain("katex-display");
    expect(html).toContain("data-line=");
  });

  it("still produces katex output for invalid tex", () => {
    const html = renderBody("$\\frac{a$", {});
    expect(html).toContain("katex");
  });

  it("does not treat lone dollar or spaced content as math", () => {
    expect(renderBody("price $5", {})).not.toContain('class="katex"');
    expect(renderBody("$ spaced $", {})).not.toContain('class="katex"');
  });
});

describe("emoji", () => {
  it("converts shortcodes to unicode", () => {
    expect(renderBody(":smile:", {})).toContain("\u{1F604}");
  });
});

describe("allowHtml", () => {
  it("escapes raw html by default", () => {
    expect(renderBody("<b>x</b>", {})).toContain("&lt;b&gt;");
  });

  it("sanitizes raw html when enabled", () => {
    const html = renderBody(
      '<img src="x.png" onerror="alert(1)"><script>alert(2)</script><b>ok</b>',
      { allowHtml: true }
    );
    expect(html).toContain("<b>ok</b>");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<script>");
  });
});
