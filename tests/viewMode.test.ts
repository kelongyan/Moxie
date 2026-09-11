import { describe, expect, it } from "vitest";
import { useDocuments } from "../src/state/documents";

describe("markdown view mode (Typora-style)", () => {
  it("新文档默认进入渲染模式（previewVisible=true）", () => {
    // 重置 store 状态
    useDocuments.setState({ documents: [], activeId: null });

    const id = useDocuments.getState().createUntitled();
    const doc = useDocuments.getState().documents.find((d) => d.id === id);
    expect(doc).toBeDefined();
    expect(doc!.previewVisible).toBe(true);
  });

  it("patchDocument 切到源码模式（previewVisible=false）后再切回渲染", () => {
    useDocuments.setState({ documents: [], activeId: null });
    const id = useDocuments.getState().createUntitled();

    // 切到源码
    useDocuments.getState().patchDocument(id, { previewVisible: false });
    expect(
      useDocuments.getState().documents.find((d) => d.id === id)!.previewVisible
    ).toBe(false);

    // 切回渲染
    useDocuments.getState().patchDocument(id, { previewVisible: true });
    expect(
      useDocuments.getState().documents.find((d) => d.id === id)!.previewVisible
    ).toBe(true);
  });

  it("不同文档的视图模式相互独立", () => {
    useDocuments.setState({ documents: [], activeId: null });
    const id1 = useDocuments.getState().createUntitled();
    const id2 = useDocuments.getState().createUntitled();

    useDocuments.getState().patchDocument(id1, { previewVisible: false });
    const [d1, d2] = useDocuments
      .getState()
      .documents.filter((d) => d.id === id1 || d.id === id2);
    expect(d1.previewVisible).toBe(false);
    expect(d2.previewVisible).toBe(true); // 不受影响
  });
});
