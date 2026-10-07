import { beforeEach, describe, expect, it, vi } from "vitest";
import libRsSource from "../src-tauri/src/lib.rs?raw";
import { saveDocumentAction } from "../src/state/actions";
import { useDocuments } from "../src/state/documents";

/** 记录一次写盘流程里前端发给后端的全部命令与参数 */
const { calls } = vi.hoisted(() => ({
  calls: [] as Array<{ cmd: string; args: unknown }>,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: unknown) => {
    calls.push({ cmd, args });
    // 无冲突：所有 revision 查询返回 null
    if (cmd === "get_file_revision") return null;
    return null;
  }),
  convertFileSrc: (p: string) => `asset://${p}`,
  isTauri: () => false,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

/** 从 lib.rs 源码里取出某个 #[command] 的形参名列表 */
function rustCommandParams(source: string, name: string): string[] {
  const match = new RegExp(`fn\\s+${name}\\s*\\(([^)]*)\\)`).exec(source);
  if (!match) throw new Error(`lib.rs 中未找到命令 ${name}`);
  return match[1]
    .split(",")
    .map((param) => param.trim())
    .filter(Boolean)
    .map((param) => param.split(":")[0].trim());
}

/** 走一遍真实保存流程，返回 timeline_save 收到的参数 */
async function timelineSaveArgs(): Promise<Record<string, unknown>> {
  const id = useDocuments.getState().addOpened("C:\\docs\\demo.md", "# 正文");
  expect(await saveDocumentAction(id)).toBe(true);
  const call = calls.find((c) => c.cmd === "timeline_save");
  expect(call).toBeDefined();
  return call!.args as Record<string, unknown>;
}

describe("保存流程 · 版本时间线契约", () => {
  beforeEach(() => {
    calls.length = 0;
    useDocuments.setState({
      documents: [],
      activeId: null,
      statusMessage: null,
    });
  });

  it("写盘成功后以 Rust 形参名提交快照", async () => {
    const args = await timelineSaveArgs();
    // 关键回归点：形参名必须是 content 而非 text
    expect(args.path).toBe("C:\\docs\\demo.md");
    expect(args.content).toBe("# 正文");
    expect("text" in args).toBe(false);
  });

  it("前端传参键与 lib.rs 声明一一对应", async () => {
    const params = rustCommandParams(libRsSource, "timeline_save");
    expect(params).toEqual(["path", "content"]);

    // 与真实调用记录比对：多传/漏传/拼错都会失败
    const args = await timelineSaveArgs();
    expect(Object.keys(args).sort()).toEqual([...params].sort());
  });
});
