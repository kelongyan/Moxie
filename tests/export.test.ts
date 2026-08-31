import { describe, expect, it, vi } from "vitest";
import {
  buildExportHtml,
  inlineLocalImages,
  localImagePlaceholder,
} from "../src/preview/exportHtml";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "read_file_base64") return "QUJD";
    return "";
  }),
  convertFileSrc: (p: string) => `asset://${p}`,
  isTauri: () => false,
}));

describe("localImagePlaceholder", () => {
  it("encodes the absolute path", () => {
    expect(localImagePlaceholder("D:\\a b.png")).toBe(
      "moxieimg://" + encodeURIComponent("D:\\a b.png")
    );
  });
});

describe("inlineLocalImages", () => {
  it("replaces placeholders with base64 data urls", async () => {
    const html = `<img src="${localImagePlaceholder("D:\\x.png")}">`;
    const out = await inlineLocalImages(html);
    expect(out).toContain('src="data:image/png;base64,QUJD"');
    expect(out).not.toContain("moxieimg://");
  });

  it("maps mime type by extension", async () => {
    const html = `<img src="${localImagePlaceholder("D:\\x.jpg")}">`;
    const out = await inlineLocalImages(html);
    expect(out).toContain("data:image/jpeg;base64,");
  });

  it("leaves remote and data images untouched", async () => {
    const html = '<img src="https://a.com/x.png"><img src="data:image/png;base64,AA">';
    expect(await inlineLocalImages(html)).toBe(html);
  });
});

describe("buildExportHtml", () => {
  it("inlines katex css and injects the body", () => {
    const shell =
      '<html><head><link rel="stylesheet" href="katex.css"></head><body><article></article></body></html>';
    const out = buildExportHtml(shell, "<p>hi</p>");
    expect(out).toContain("<article><p>hi</p></article>");
    expect(out).not.toContain('<link rel="stylesheet"');
    expect(out).toContain("<style>");
  });
});
