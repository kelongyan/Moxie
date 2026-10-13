import { describe, expect, it } from "vitest";
import {
  arrayBufferToBase64,
  inlineKatexFonts,
} from "../src/preview/exportHtml";

/**
 * KaTeX 字体导出内联的纯函数部分（docs/渲染优化方案.md O-10，方案 B）：
 * CSS 中 src 声明的 woff2 引用替换为 data URI（并去掉相邻 woff/ttf 后备）。
 * 实际 fetch 字体转 base64 依赖运行环境，由实机导出验证。
 */
describe("inlineKatexFonts", () => {
  const DATA = "data:font/woff2;base64,AAAA";

  it("构建形态：/assets/ 绝对路径的 woff2 source 整段替换为 data URI", () => {
    const css =
      '@font-face{font-family:KaTeX_AMS;src:url(/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2)format("woff2"),url(/assets/KaTeX_AMS-Regular-DMm9YOAa.woff)format("woff"),url(/assets/KaTeX_AMS-Regular-DRggAlZN.ttf)format("truetype");font-weight:400}';
    const map = new Map([["/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2", DATA]]);
    const out = inlineKatexFonts(css, map);
    expect(out).toContain(`src:url(${DATA}) format("woff2")`);
    expect(out).not.toContain(".woff2)");
    expect(out).not.toContain(".woff)");
    expect(out).not.toContain(".ttf)");
    // 其他属性不受影响
    expect(out).toContain("font-family:KaTeX_AMS");
    expect(out).toContain("font-weight:400");
  });

  it("源包形态：带空格的 relative 路径同样替换", () => {
    const css =
      'src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2"), url(fonts/KaTeX_Main-Regular.woff) format("woff"), url(fonts/KaTeX_Main-Regular.ttf) format("truetype");';
    const map = new Map([["fonts/KaTeX_Main-Regular.woff2", DATA]]);
    const out = inlineKatexFonts(css, map);
    expect(out).toBe(`src:url(${DATA}) format("woff2");`);
  });

  it("dataUris 中缺失的路径保持原样（优雅降级）", () => {
    const css =
      'src:url(/assets/KaTeX_Math-Italic-t53AETM-.woff2)format("woff2"),url(/assets/x.woff)format("woff");';
    const out = inlineKatexFonts(css, new Map());
    expect(out).toBe(css);
  });

  it("多段 src 声明各自独立替换", () => {
    const css =
      'a{src:url(/assets/A1.woff2)format("woff2");}b{src:url(/assets/B1.woff2)format("woff2");}';
    const map = new Map([
      ["/assets/A1.woff2", DATA],
      ["/assets/B1.woff2", DATA],
    ]);
    const out = inlineKatexFonts(css, map);
    expect(out).toBe(`a{src:url(${DATA}) format("woff2");}b{src:url(${DATA}) format("woff2");}`);
  });
});

describe("arrayBufferToBase64", () => {
  it("逐字节转 base64（含跨分块）", () => {
    expect(arrayBufferToBase64(new Uint8Array([72, 105]).buffer)).toBe("SGk=");
    const big = new Uint8Array(20000).fill(65);
    const b64 = arrayBufferToBase64(big.buffer);
    expect(b64.length).toBe(Math.ceil(20000 / 3) * 4);
    expect(btoa(String.fromCharCode(...new Uint8Array(20000).fill(65)))).not.toBe("");
  });
});
