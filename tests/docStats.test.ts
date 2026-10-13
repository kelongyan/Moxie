import { describe, expect, it } from "vitest";
import { countParagraphs, nextStatMode, STAT_LABELS } from "../src/hooks/useDocStats";

describe("countParagraphs（空行分段）", () => {
  it("空文档为 0 段", () => {
    expect(countParagraphs("")).toBe(0);
    expect(countParagraphs("\n\n\n")).toBe(0);
    expect(countParagraphs("   \n\t\n")).toBe(0);
  });

  it("单段（含多行软换行）算一段", () => {
    expect(countParagraphs("一行")).toBe(1);
    expect(countParagraphs("第一行\n第二行")).toBe(1);
  });

  it("空行分隔算多段", () => {
    expect(countParagraphs("段一\n\n段二")).toBe(2);
    expect(countParagraphs("段一\n\n\n段二\n\n段三")).toBe(3);
  });

  it("首尾空行与多余空白不影响计数", () => {
    expect(countParagraphs("\n\n段一\n\n段二\n\n")).toBe(2);
    expect(countParagraphs("段一\n   \n段二")).toBe(2);
  });

  it("标题/列表等行同样按非空行参与分段", () => {
    expect(countParagraphs("# 标题\n\n正文\n\n- 项一\n- 项二")).toBe(3);
  });
});

describe("统计口径切换", () => {
  it("按 字数 → 段落 → 字符 循环", () => {
    expect(nextStatMode("words")).toBe("paragraphs");
    expect(nextStatMode("paragraphs")).toBe("characters");
    expect(nextStatMode("characters")).toBe("words");
  });

  it("三口径都有中文标签", () => {
    expect(STAT_LABELS.words).toBe("字数");
    expect(STAT_LABELS.paragraphs).toBe("段落");
    expect(STAT_LABELS.characters).toBe("字符");
  });
});
