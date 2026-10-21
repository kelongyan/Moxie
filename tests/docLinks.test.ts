import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdownExtensions } from "../src/editor/languages";
import {
  anchorOfHref,
  collectHeadingAnchors,
  findAnchorLine,
  headingAnchorsFromText,
  isAnchorHref,
  isRelativeDocHref,
  resolveRelativeDocPath,
} from "../src/editor/docLinks";
import { headingIdsOf, slugify } from "../src/preview/markdownCore";

function stateOf(doc: string) {
  return EditorState.create({ doc, extensions: [markdownExtensions()] });
}

describe("slugify / headingIdsOf（与导出侧 heading id 同源）", () => {
  it("小写、空格转连字符、去掉标点", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("中文 标题")).toBe("中文-标题");
    expect(slugify("A: B!")).toBe("a-b");
    expect(slugify("   ")).toBe("");
  });

  it("重复标题按出现顺序加 -2 / -3 后缀", () => {
    expect(headingIdsOf(["重复", "重复", "重复"])).toEqual([
      "重复",
      "重复-2",
      "重复-3",
    ]);
  });

  it("空标题回落到 section", () => {
    expect(headingIdsOf(["", ""])).toEqual(["section", "section-2"]);
  });
});

describe("collectHeadingAnchors（语法树）", () => {
  it("ATX 与 Setext 标题都收集，行号正确", () => {
    const doc = "# 一级\n\n正文\n\n二级\n---\n\n### 三级\n";
    const anchors = collectHeadingAnchors(stateOf(doc));
    expect(anchors.map((a) => [a.line, a.text])).toEqual([
      [1, "一级"],
      [5, "二级"],
      [8, "三级"],
    ]);
    expect(anchors.map((a) => a.id)).toEqual(["一级", "二级", "三级"]);
  });

  it("重复标题的 id 与导出侧一致（带去重后缀）", () => {
    const anchors = collectHeadingAnchors(stateOf("# 重复\n\n# 重复\n"));
    expect(anchors.map((a) => a.id)).toEqual(["重复", "重复-2"]);
  });
});

describe("headingAnchorsFromText（纯文本兜底）", () => {
  it("与语法树版本对同一文档给出一致结果", () => {
    const doc = "# 一\n\n正文\n\n二\n===\n\n## 三\n\n## 三\n";
    const fromTree = collectHeadingAnchors(stateOf(doc));
    const fromText = headingAnchorsFromText(doc);
    expect(fromText.map((a) => [a.line, a.id])).toEqual(
      fromTree.map((a) => [a.line, a.id])
    );
  });

  it("ATX 尾部闭合井号不参与 slug", () => {
    const anchors = headingAnchorsFromText("## 标题 ##\n");
    expect(anchors[0].text).toBe("标题");
    expect(anchors[0].id).toBe("标题");
  });
});

describe("findAnchorLine", () => {
  const anchors = headingAnchorsFromText("# Alpha\n\n# Alpha\n\n# 中文\n");

  it("精确 id 命中", () => {
    expect(findAnchorLine(anchors, "alpha")?.line).toBe(1);
    expect(findAnchorLine(anchors, "alpha-2")?.line).toBe(3);
  });

  it("用户手写未 slugify 的锚点也能命中", () => {
    expect(findAnchorLine(anchors, "Alpha")?.line).toBe(1);
    expect(findAnchorLine(anchors, "中文")?.line).toBe(5);
  });

  it("带前导 # 或 URI 编码也能解析", () => {
    expect(findAnchorLine(anchors, "#alpha")?.line).toBe(1);
    expect(findAnchorLine(anchors, encodeURIComponent("中文"))?.line).toBe(5);
  });

  it("未命中返回 null", () => {
    expect(findAnchorLine(anchors, "missing")).toBeNull();
    expect(findAnchorLine(anchors, "")).toBeNull();
  });
});

describe("链接类型判定", () => {
  it("锚点：仅 # 开头且非空", () => {
    expect(isAnchorHref("#标题")).toBe(true);
    expect(isAnchorHref("#")).toBe(false);
    expect(isAnchorHref("a.md#x")).toBe(false);
  });

  it("相对文档：排除协议、协议相对与纯锚点", () => {
    expect(isRelativeDocHref("./a.md")).toBe(true);
    expect(isRelativeDocHref("../x/y.md")).toBe(true);
    expect(isRelativeDocHref("a.md#sec")).toBe(true);
    expect(isRelativeDocHref("https://a.com")).toBe(false);
    expect(isRelativeDocHref("mailto:a@b.c")).toBe(false);
    expect(isRelativeDocHref("//cdn/x.md")).toBe(false);
    expect(isRelativeDocHref("#anchor")).toBe(false);
    expect(isRelativeDocHref("")).toBe(false);
  });

  it("anchorOfHref 取出 # 之后部分", () => {
    expect(anchorOfHref("a.md#sec")).toBe("sec");
    expect(anchorOfHref("a.md")).toBeNull();
    expect(anchorOfHref("a.md#")).toBeNull();
  });
});

describe("边界：frontmatter 幻影标题 / 非法编码 / 路径逃逸", () => {
  it("YAML frontmatter 不产生标题（lezer 会把 title: x 解析成 Setext）", () => {
    const doc = "---\ntitle: 测试\ntags: [a, b]\n---\n\n# 正文标题\n";
    const anchors = collectHeadingAnchors(stateOf(doc));
    expect(anchors.map((a) => a.text)).toEqual(["正文标题"]);
    // 纯文本兜底同样跳过
    expect(headingAnchorsFromText(doc).map((a) => a.text)).toEqual(["正文标题"]);
  });

  it("空 frontmatter（---\\n---）不算剥离块", () => {
    const doc = "---\n---\n\n# 标题\n";
    expect(headingAnchorsFromText(doc).map((a) => a.text)).toEqual(["标题"]);
  });

  it("非法百分号编码不抛异常，按字面量 slug 匹配", () => {
    const anchors = headingAnchorsFromText("# 100% 完成\n");
    expect(anchors[0].id).toBe("100-完成");
    expect(() => findAnchorLine(anchors, "100% 完成")).not.toThrow();
    expect(findAnchorLine(anchors, "100% 完成")?.line).toBe(1);
  });

  it(".. 不会弹出盘符", () => {
    expect(resolveRelativeDocPath("C:\\docs", "..\\..\\..\\x.md")).toBe(
      "C:\\x.md"
    );
  });
});

describe("resolveRelativeDocPath", () => {
  const base = "C:\\docs\\notes";

  it("同目录与子目录", () => {
    expect(resolveRelativeDocPath(base, "a.md")).toBe("C:\\docs\\notes\\a.md");
    expect(resolveRelativeDocPath(base, "sub/a.md")).toBe(
      "C:\\docs\\notes\\sub\\a.md"
    );
  });

  it("上级目录与 . 段", () => {
    expect(resolveRelativeDocPath(base, "../a.md")).toBe("C:\\docs\\a.md");
    expect(resolveRelativeDocPath(base, "./sub/./b.md")).toBe(
      "C:\\docs\\notes\\sub\\b.md"
    );
  });

  it("去掉查询串与锚点", () => {
    expect(resolveRelativeDocPath(base, "a.md?x=1#sec")).toBe(
      "C:\\docs\\notes\\a.md"
    );
  });

  it("无基准目录返回 null", () => {
    expect(resolveRelativeDocPath(null, "a.md")).toBeNull();
  });
});
