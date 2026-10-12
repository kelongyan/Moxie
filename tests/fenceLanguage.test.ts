import { describe, expect, it } from "vitest";
import { normalizeFenceLanguage } from "../src/editor/languages";

/** 语言标注输入归一化：大小写不敏感、别名/常见写法对齐规范 key，未收录写法保留（小写） */
describe("normalizeFenceLanguage", () => {
  it("大小写不敏感", () => {
    expect(normalizeFenceLanguage("JS")).toBe("js");
    expect(normalizeFenceLanguage("Python")).toBe("python");
    expect(normalizeFenceLanguage("TYPESCRIPT")).toBe("typescript");
    expect(normalizeFenceLanguage("Rust")).toBe("rust");
  });

  it("名称与别名对齐规范 key", () => {
    expect(normalizeFenceLanguage("TypeScript")).toBe("typescript");
    expect(normalizeFenceLanguage("JavaScript")).toBe("javascript");
    expect(normalizeFenceLanguage("Shell")).toBe("bash");
    expect(normalizeFenceLanguage("Bash")).toBe("bash");
    expect(normalizeFenceLanguage("C#")).toBe("csharp");
    expect(normalizeFenceLanguage("golang")).toBe("go");
    expect(normalizeFenceLanguage("yml")).toBe("yaml");
    expect(normalizeFenceLanguage("markdown")).toBe("markdown");
  });

  it("首尾空白与内部空白规整", () => {
    expect(normalizeFenceLanguage("  rust  ")).toBe("rust");
    expect(normalizeFenceLanguage("\tpython\n")).toBe("python");
  });

  it("空输入与纯文本写法归一为无标注", () => {
    expect(normalizeFenceLanguage("")).toBe("");
    expect(normalizeFenceLanguage("   ")).toBe("");
    expect(normalizeFenceLanguage("text")).toBe("");
    expect(normalizeFenceLanguage("plaintext")).toBe("");
  });

  it("未收录语言保留小写原样，不改写用户写法", () => {
    expect(normalizeFenceLanguage("Dart")).toBe("dart");
    expect(normalizeFenceLanguage("nix")).toBe("nix");
    expect(normalizeFenceLanguage("C++")).toBe("c++");
    expect(normalizeFenceLanguage("tsx")).toBe("tsx");
    expect(normalizeFenceLanguage("scss")).toBe("scss");
  });
});
