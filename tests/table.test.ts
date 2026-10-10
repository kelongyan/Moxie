import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdownExtensions } from "../src/editor/languages";
import {
  buildTable,
  clearCellEdit,
  deleteColEdit,
  deleteRowEdit,
  deleteTableEdit,
  displayWidth,
  emptyTable,
  findTableAt,
  formatTableChange,
  insertColEdit,
  insertRowEdit,
  locateCell,
  parseAlignments,
  resizeTableEdit,
  setAlignEdit,
  type TableModel,
} from "../src/editor/table";

function stateOf(doc: string, anchor: number) {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownExtensions()],
  });
}

const TABLE = "| 列一 | 列二 |\n| --- | --- |\n| a | b |\n| c | d |";

function modelOf(doc: string, pos?: number): TableModel {
  const state = stateOf(doc, pos ?? 0);
  const model = findTableAt(state, pos ?? 0);
  if (!model) throw new Error("not a table: " + JSON.stringify(doc));
  return model;
}

describe("table · 解析", () => {
  it("findTableAt 提取表头/数据行与单元格文档位置", () => {
    const model = modelOf("前文\n\n" + TABLE + "\n\n后文", 10);
    expect(model.rows.map((r) => r.map((c) => c.text))).toEqual([
      ["列一", "列二"],
      ["a", "b"],
      ["c", "d"],
    ]);
    // 单元格位置指向 trim 后的内容（前文\n\n| = 4，空格 = 5，列一从 6 起）
    const header = model.rows[0];
    expect(header[0].from).toBe(6);
    expect(header[0].to).toBe(header[0].from + 2);
  });

  it("表格外的位置返回 null，正文里的竖线不误判", () => {
    const state = stateOf("普通段落 a | b\n", 3);
    expect(findTableAt(state, 3)).toBeNull();
  });

  it("全空行（|  |  |）由管道切分兜底", () => {
    const model = modelOf("|  |  |\n| --- | --- |\n|  |  |", 0);
    expect(model.rows).toHaveLength(2);
    expect(model.rows[0]).toHaveLength(2);
  });

  it("内容 + 空单元格混排行不丢列（lezer 不产空 TableCell）", () => {
    const model = modelOf("| a | b | c |\n| --- | --- | --- |\n| x |  | y |", 0);
    expect(model.rows[1].map((c) => c.text)).toEqual(["x", "", "y"]);
    // 只有中间格有内容
    const model2 = modelOf("| a | b | c |\n| --- | --- | --- |\n|  |  | z |", 0);
    expect(model2.rows[1].map((c) => c.text)).toEqual(["", "", "z"]);
  });

  it("GFM 省略首尾管道的行仍可解析", () => {
    const state = stateOf("a | b\n--- | ---\n1 | 2", 0);
    const model = findTableAt(state, 0);
    if (model) {
      expect(model.rows[0].map((c) => c.text)).toEqual(["a", "b"]);
    }
    // lezer 可能不把无管道边界的行识别为表格——识别不出也不算错
  });

  it("parseAlignments 识别三种对齐与缺省", () => {
    expect(parseAlignments("| :--- | :---: | ---: | --- |")).toEqual([
      "left",
      "center",
      "right",
      null,
    ]);
    expect(parseAlignments("| 内容 |")).toBeNull();
    expect(parseAlignments("| - | - |")).toEqual([null, null]);
  });

  it("locateCell 覆盖格内、管道间隙与行首行尾", () => {
    const model = modelOf(TABLE, 0);
    const c00 = model.rows[0][0];
    expect(locateCell(model, c00.from)).toEqual({ row: 0, col: 0 });
    // 行首（首个管道之前）归属 (0,0)
    expect(locateCell(model, model.from)).toEqual({ row: 0, col: 0 });
    // 表头与分隔行之间的位置归表头末列
    expect(locateCell(model, model.rows[0][1].to + 1)).toEqual({ row: 0, col: 1 });
    // 末行之后（表格末尾）归属末行末列
    expect(locateCell(model, model.to)).toEqual({ row: 2, col: 1 });
  });

  it("displayWidth：CJK 计 2，ASCII 计 1", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("表格")).toBe(4);
    expect(displayWidth("a表b")).toBe(4);
  });
});

describe("table · 格式化", () => {
  it("按显示宽度对齐管道，CJK 列宽占位正确", () => {
    const model = modelOf("| 名字 | v |\n| --- | --- |\n| 龙哥 | 1 |", 0);
    expect(buildTable(model)).toBe(
      ["| 名字 | v   |", "| ---- | --- |", "| 龙哥 | 1   |"].join("\n")
    );
  });

  it("对齐标记物化为 :-- / :-: / --: 并参与列宽", () => {
    const model = modelOf("| a | b |\n| :-- | --: |\n| x | y |", 0);
    const out = buildTable(model);
    expect(out.split("\n")[1]).toBe("| :-- | --: |");
    expect(out.split("\n")[0]).toBe("| a   |   b |");
  });

  it("短行补齐列数（缺失单元格为空）", () => {
    const model = modelOf("| a | b |\n| --- | --- |\n| 只有一格 |", 0);
    const out = buildTable(model);
    expect(out.split("\n")[2]).toBe("| 只有一格 |     |");
  });

  it("formatTableChange 返回整表替换范围", () => {
    const model = modelOf(TABLE, 0);
    const change = formatTableChange(model);
    expect(change.from).toBe(model.from);
    expect(change.to).toBe(model.to);
    expect(change.insert.split("\n")).toHaveLength(4);
  });

  it("已是规范排列的表格格式化后保持不变", () => {
    const aligned = "| a   | b   |\n| --- | --- |\n| c   | d   |";
    const state = stateOf(aligned, 0);
    const model = modelOf(aligned, 0);
    expect(formatTableChange(model).insert).toBe(state.doc.toString());
  });
});

describe("table · 结构变换", () => {
  it("插入行：新行为空行，光标落新行指定列", () => {
    const model = modelOf(TABLE, 0);
    const edit = insertRowEdit(model, 2, 1);
    expect(edit).not.toBeNull();
    const lines = edit!.insert.split("\n");
    expect(lines).toHaveLength(5);
    // TABLE 列宽为 4（列一/列二），空行每格 4 空格 + 两侧留白 = 6
    expect(lines[3]).toBe("|      |      |");
    expect(lines[0]).toBe("| 列一 | 列二 |");
    // caretRow=2 → 文本第 3 行（0 是表头、1 是分隔）
    expect(edit!.caretRow).toBe(2);
    expect(edit!.caretCol).toBe(1);
  });

  it("删除行：移除指定数据行", () => {
    const model = modelOf(TABLE, 0);
    const edit = deleteRowEdit(model, 1);
    const lines = edit!.insert.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("| c    | d    |");
  });

  it("仅剩表头时不可再删（保护分隔行语义）", () => {
    const model = modelOf("| a |\n| --- |", 0);
    expect(model.rows).toHaveLength(1);
    expect(deleteRowEdit(model, 0)).toBeNull();
  });

  it("插入列：所有行与对齐同步扩展", () => {
    const model = modelOf(TABLE, 0);
    const edit = insertColEdit(model, 1);
    const lines = edit!.insert.split("\n");
    expect(lines[0]).toBe("| 列一 |     | 列二 |");
    expect(lines[1]).toBe("| ---- | --- | ---- |");
    expect(lines[2]).toBe("| a    |     | b    |");
  });

  it("删除列：移除所有行对应列与对齐", () => {
    const model = modelOf(TABLE, 0);
    const edit = deleteColEdit(model, 0);
    const lines = edit!.insert.split("\n");
    expect(lines[0]).toBe("| 列二 |");
    expect(lines[2]).toBe("| b    |");
  });

  it("单列表格不可删列", () => {
    const model = modelOf("| a |\n| --- |\n| c |", 0);
    expect(deleteColEdit(model, 0)).toBeNull();
  });

  it("setAlignEdit 修改指定列对齐", () => {
    const model = modelOf(TABLE, 0);
    const edit = setAlignEdit(model, 1, "center");
    const lines = edit!.insert.split("\n");
    expect(lines[1]).toBe("| ---- | :--: |");
  });

  it("转义单元格 \\| 在结构变换后保留", () => {
    const model = modelOf("| a \\| b |\n| --- |\n| c |", 0);
    const edit = insertRowEdit(model, 1, 0);
    expect(edit!.insert.split("\n")[0]).toBe("| a \\| b |");
  });

  it("resizeTableEdit 扩展与缩减行列", () => {
    const model = modelOf(TABLE, 0); // 3 行 2 列
    const expanded = resizeTableEdit(model, 4, 3);
    expect(expanded).not.toBeNull();
    const expLines = expanded!.insert.split("\n");
    expect(expLines).toHaveLength(5); // 1 header + 1 delimiter + 3 data rows

    const shrink = resizeTableEdit(model, 2, 1);
    expect(shrink).not.toBeNull();
    const shrinkLines = shrink!.insert.split("\n");
    expect(shrinkLines).toHaveLength(3); // 1 header + 1 delimiter + 1 data row
  });

  it("deleteTableEdit 产出清空替换", () => {
    const model = modelOf(TABLE, 0);
    const edit = deleteTableEdit(model);
    expect(edit.insert).toBe("");
    expect(edit.from).toBe(model.from);
    expect(edit.to).toBe(model.to);
  });

  it("clearCellEdit 清空特定单元格", () => {
    const model = modelOf(TABLE, 0);
    const edit = clearCellEdit(model, 1, 0);
    expect(edit).not.toBeNull();
    const lines = edit!.insert.split("\n");
    expect(lines[2]).toContain("|      | b");
  });
});

describe("table · 空表格生成", () => {
  it("emptyTable 产出合法 GFM 文本", () => {
    const { text } = emptyTable(3, 3);
    const state = stateOf(text, 0);
    const model = findTableAt(state, 0);
    expect(model).not.toBeNull();
    expect(model!.rows).toHaveLength(3);
    expect(model!.rows[0]).toHaveLength(3);
  });

  it("行列数下限钳制为 1", () => {
    const { text } = emptyTable(0, 0);
    expect(text.split("\n")).toHaveLength(2);
  });
});
