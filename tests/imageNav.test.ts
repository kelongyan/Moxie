import { describe, expect, it } from "vitest";
import {
  parseImageToken,
  serializeImageToken,
} from "../src/editor/imageNav";

/**
 * 图片源码双形式（Markdown / HTML <img>）的解析与序列化。
 * P1 起：缩放/对齐后整段改写为 HTML `<img>`（墨记同款），往返必须无损。
 */
describe("imageNav · 图片源码解析与序列化", () => {
  it("纯 Markdown 形式往返无损", () => {
    const info = parseImageToken("![logo](./assets/a.png)");
    expect(info).toEqual({
      alt: "logo",
      src: "./assets/a.png",
      html: false,
      uploading: false,
    });
    expect(serializeImageToken(info!)).toBe("![logo](./assets/a.png)");
  });

  it("HTML 形式解析出 src/alt/width/align，序列化保序", () => {
    const raw = '<img src="./a.png" alt="徽标" width="600" data-align="center" />';
    const info = parseImageToken(raw);
    expect(info).toEqual({
      alt: "徽标",
      src: "./a.png",
      width: "600",
      align: "center",
      html: true,
    });
    expect(serializeImageToken(info!)).toBe(raw);
  });

  it("Markdown 加宽度 → 序列化为 HTML 形式（缩放写回）", () => {
    const info = parseImageToken("![logo](./a.png)");
    expect(serializeImageToken({ ...info!, width: "480" })).toBe(
      '<img src="./a.png" alt="logo" width="480" />'
    );
  });

  it("内联（取消对齐与宽度）→ 序列化回纯 Markdown", () => {
    const info = parseImageToken(
      '<img src="./a.png" alt="logo" width="480" data-align="center" />'
    );
    expect(
      serializeImageToken({ ...info!, width: undefined, align: undefined, html: false })
    ).toBe("![logo](./a.png)");
  });

  it("属性值含引号时转义往返", () => {
    const info = parseImageToken(
      '<img src="./a.png" alt="说&quot;你好&quot;" />'
    );
    expect(info?.alt).toBe('说"你好"');
    const out = serializeImageToken(info!);
    expect(out).toBe('<img src="./a.png" alt="说&quot;你好&quot;" />');
    expect(parseImageToken(out)?.alt).toBe('说"你好"');
  });

  it("非图片源码返回 null", () => {
    expect(parseImageToken("[链接](https://x)")).toBeNull();
    expect(parseImageToken("<div>块</div>")).toBeNull();
    expect(parseImageToken("<img>")).toBeNull();
  });

  it("粘贴占位（alt=upload-<id>）解析出 uploading 标记", () => {
    const info = parseImageToken("![upload-lx2k-ab12](data:image/png;base64,iVBOR)");
    expect(info?.uploading).toBe(true);
    expect(info?.html).toBe(false);
    expect(parseImageToken("![普通描述](./a.png)")?.uploading).toBe(false);
  });
});
