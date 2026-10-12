import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  chainHighlight,
  dirName,
  formatRelativeTime,
  joinPath,
  outlineIndent,
  parentDirPath,
  treeGuideLines,
  useSidebar,
} from "../src/state/sidebar";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
  isTauri: () => false,
}));

describe("formatRelativeTime", () => {
  const NOW = Date.parse("2026-09-11T18:00:00+08:00");
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it("shows 刚刚 within a minute", () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe("刚刚");
  });

  it("shows minutes and hours", () => {
    expect(formatRelativeTime(NOW - 5 * MIN, NOW)).toBe("5 分钟前");
    expect(formatRelativeTime(NOW - 3 * HOUR, NOW)).toBe("3 小时前");
  });

  it("shows days within a week", () => {
    expect(formatRelativeTime(NOW - 2 * DAY, NOW)).toBe("2 天前");
  });

  it("falls back to date beyond a week (same year)", () => {
    const ms = Date.parse("2026-09-01T10:00:00+08:00");
    expect(formatRelativeTime(ms, NOW)).toBe("9月1日");
  });

  it("includes the year for older dates", () => {
    const ms = Date.parse("2025-03-15T10:00:00+08:00");
    expect(formatRelativeTime(ms, NOW)).toBe("2025/3/15");
  });

  it("returns empty string for zero/invalid timestamps", () => {
    expect(formatRelativeTime(0, NOW)).toBe("");
  });
});

describe("dirName", () => {
  it("extracts the parent folder name", () => {
    expect(dirName("D:\\工作\\子目录\\a.md")).toBe("子目录");
    expect(dirName("D:/notes/file.ts")).toBe("notes");
  });

  it("returns empty string near the root", () => {
    expect(dirName("D:\\a.md")).toBe("D:");
    expect(dirName("a.md")).toBe("");
  });
});

describe("joinPath and parentDirPath", () => {
  it("joinPath handles backslashes on Windows", () => {
    expect(joinPath("C:\\notes", "doc.md")).toBe("C:\\notes\\doc.md");
    expect(joinPath("C:\\notes\\", "doc.md")).toBe("C:\\notes\\doc.md");
  });

  it("joinPath handles forward slashes", () => {
    expect(joinPath("/home/user/notes", "doc.md")).toBe("/home/user/notes/doc.md");
    expect(joinPath("/home/user/notes/", "doc.md")).toBe("/home/user/notes/doc.md");
  });

  it("parentDirPath returns directory without filename", () => {
    expect(parentDirPath("C:\\notes\\doc.md")).toBe("C:\\notes");
    expect(parentDirPath("/home/user/notes/doc.md")).toBe("/home/user/notes");
    expect(parentDirPath("standalone.md")).toBe("");
  });
});

describe("sidebar workspace and tabs", () => {
  it("switches active tab cleanly", () => {
    useSidebar.getState().setActiveTab("outline");
    expect(useSidebar.getState().activeTab).toBe("outline");
    useSidebar.getState().setActiveTab("files");
    expect(useSidebar.getState().activeTab).toBe("files");
  });

  it("closes workspace and clears state", () => {
    useSidebar.setState({
      workspacePath: "C:\\my-notes",
      dirChildren: { "C:\\my-notes": [] },
      expandedDirs: { "C:\\my-notes": true },
    });
    useSidebar.getState().closeWorkspace();
    expect(useSidebar.getState().workspacePath).toBeNull();
    expect(useSidebar.getState().dirChildren).toEqual({});
    expect(useSidebar.getState().expandedDirs).toEqual({});
  });
});

describe("会话内状态：不落盘、不跨启动恢复", () => {
  it("refresh 忽略磁盘上的工作区文件夹与展开状态", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "sidebar_load") {
        return {
          workspacePath: "C:\\Users\\x\\Desktop\\notes",
          expandedDirs: { "C:\\Users\\x\\Desktop\\notes": true },
          activeTab: "outline",
        };
      }
      return null;
    });
    await useSidebar.getState().refresh();
    expect(useSidebar.getState().workspacePath).toBeNull();
    expect(useSidebar.getState().expandedDirs).toEqual({});
    expect(useSidebar.getState().activeTab).toBe("outline");
  });

  it("persist 不写入 workspacePath / expandedDirs", () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockClear();
    useSidebar.getState().setActiveTab("files");
    const saveCall = invokeMock.mock.calls.find(([cmd]) => cmd === "sidebar_save");
    expect(saveCall).toBeTruthy();
    const payload = (saveCall?.[1] as { value: Record<string, unknown> }).value;
    expect(payload).not.toHaveProperty("workspacePath");
    expect(payload).not.toHaveProperty("expandedDirs");
  });

  it("pushRecent 会话内去重、置顶并封顶", () => {
    useSidebar.setState({ recent: [], missing: {} });
    const push = useSidebar.getState().pushRecent;
    push("C:\\a.md");
    push("C:\\b.md");
    push("C:\\a.md");
    expect(useSidebar.getState().recent.map((e) => e.path)).toEqual([
      "C:\\a.md",
      "C:\\b.md",
    ]);
    for (let i = 0; i < 15; i += 1) push(`C:\\n${i}.md`);
    expect(useSidebar.getState().recent).toHaveLength(12);
    expect(useSidebar.getState().recent[0].path).toBe("C:\\n14.md");
  });
});

describe("treeGuideLines（文件树引导线几何）", () => {
  it("根级末项：树干停在中线（└），无贯穿线", () => {
    const g = treeGuideLines(0, [], true);
    expect(g.vlines).toEqual([]);
    expect(g.elbow).toEqual({ x: 4, stem: false });
  });

  it("根级非末项：树干延伸到底（├）", () => {
    const g = treeGuideLines(0, [], false);
    expect(g.elbow).toEqual({ x: 4, stem: true });
  });

  it("子项：祖先还有后继时在祖先级位置画贯穿竖线", () => {
    const g = treeGuideLines(1, [true], false);
    expect(g.vlines).toEqual([{ level: 0, x: 4 }]);
    expect(g.elbow).toEqual({ x: 18, stem: true });
  });

  it("末级子树：祖先无后继则不画贯穿线，本级为 └", () => {
    const g = treeGuideLines(2, [false, true], true);
    expect(g.vlines).toEqual([{ level: 1, x: 18 }]);
    expect(g.elbow).toEqual({ x: 32, stem: false });
  });

  it("深层级：贯穿线只出现在仍在延续的祖先级", () => {
    const g = treeGuideLines(3, [true, false, true], false);
    expect(g.vlines).toEqual([
      { level: 0, x: 4 },
      { level: 2, x: 32 },
    ]);
    expect(g.elbow).toEqual({ x: 46, stem: true });
  });
});

describe("outlineIndent（大纲导航缩进）", () => {
  it("基准 10 + 每级 8：h1→h6 依次 10/18/26/34/42/50", () => {
    expect(outlineIndent(1)).toBe(10);
    expect(outlineIndent(2)).toBe(18);
    expect(outlineIndent(3)).toBe(26);
    expect(outlineIndent(4)).toBe(34);
    expect(outlineIndent(5)).toBe(42);
    expect(outlineIndent(6)).toBe(50);
  });

  it("h6 以上封顶同缩进；非法层级（0/负数）回落基准", () => {
    expect(outlineIndent(9)).toBe(50);
    expect(outlineIndent(0)).toBe(10);
    expect(outlineIndent(-3)).toBe(10);
  });
});

describe("chainHighlight（祖先链追踪点亮计算）", () => {
  const chain = [
    { path: "A", index: 1 },
    { path: "B", index: 1 },
    { path: "C", index: 0 },
  ];

  it("无悬停链时全部不点亮", () => {
    expect(chainHighlight(null, [{ path: "A", index: 1 }])).toEqual({
      vlines: 0,
      onChain: false,
    });
  });

  it("目标行自身：在链上，贯穿线全点亮 + 树枝点亮", () => {
    expect(chainHighlight(chain, chain)).toEqual({ vlines: 2, onChain: true });
  });

  it("链上祖先行（A）：在链上，无贯穿线也点亮树枝", () => {
    expect(chainHighlight(chain, [{ path: "A", index: 1 }])).toEqual({
      vlines: 0,
      onChain: true,
    });
  });

  it("分叉处位于目标分支之前的前序兄弟：点亮共享祖先列（补路径段，不断链）", () => {
    // X 与 B 同级（A 的子项）、序号 0 < B 的 1 → 位于目标之前
    expect(chainHighlight(chain, [{ path: "A", index: 1 }, { path: "X", index: 0 }])).toEqual({
      vlines: 1,
      onChain: false,
    });
  });

  it("分叉处位于目标分支之后的兄弟：不点亮", () => {
    expect(chainHighlight(chain, [{ path: "A", index: 1 }, { path: "Y", index: 2 }])).toEqual({
      vlines: 0,
      onChain: false,
    });
  });

  it("根级位于目标之前/之后：根行无贯穿线，均不点亮", () => {
    expect(chainHighlight(chain, [{ path: "R0", index: 0 }])).toEqual({
      vlines: 0,
      onChain: false,
    });
    expect(chainHighlight(chain, [{ path: "R9", index: 9 }])).toEqual({
      vlines: 0,
      onChain: false,
    });
  });

  it("悬停行的后代：不在路径上，不点亮", () => {
    expect(
      chainHighlight(chain, [...chain, { path: "D", index: 0 }])
    ).toEqual({ vlines: 0, onChain: false });
  });
});
