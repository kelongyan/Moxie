import { describe, expect, it } from "vitest";
import {
  baseName,
  isMarkdownPath,
  pathExtension,
} from "../src/models/markdown";

describe("pathExtension", () => {
  it("extracts lowercase extension from windows paths", () => {
    expect(pathExtension("C:\\Docs\\Note.MD")).toBe("md");
    expect(pathExtension("/home/user/note.markdown")).toBe("markdown");
  });

  it("returns empty for no extension or dotfile", () => {
    expect(pathExtension("C:\\Docs\\README")).toBe("");
    expect(pathExtension("/home/.gitignore")).toBe("");
  });
});

describe("isMarkdownPath", () => {
  it("accepts markdown extensions", () => {
    expect(isMarkdownPath("C:\\Docs\\笔记.md")).toBe(true);
    expect(isMarkdownPath("/home/user/README.markdown")).toBe(true);
    expect(isMarkdownPath("doc.mdown")).toBe(true);
    expect(isMarkdownPath("doc.mkd")).toBe(true);
    expect(isMarkdownPath("doc.mkdown")).toBe(true);
  });

  it("rejects code files, plaintext and extensionless names", () => {
    expect(isMarkdownPath("script.py")).toBe(false);
    expect(isMarkdownPath("data.json")).toBe(false);
    expect(isMarkdownPath("note.txt")).toBe(false);
    expect(isMarkdownPath("Makefile")).toBe(false);
    expect(isMarkdownPath("archive.md.bak")).toBe(false);
  });
});

describe("baseName", () => {
  it("keeps the last segment on both separators", () => {
    expect(baseName("C:\\Docs\\笔记.md")).toBe("笔记.md");
    expect(baseName("/home/user/README.md")).toBe("README.md");
    expect(baseName("README.md")).toBe("README.md");
  });
});
