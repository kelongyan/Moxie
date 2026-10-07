import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

/**
 * 主窗口尺寸/最大化状态持久化（localStorage，仅主窗口）：
 * 启动时恢复（窗口先按 tauri.conf 默认尺寸创建，随后 JS 矫正，可能有一帧跳动），
 * resize/最大化时防抖保存。
 */

const KEY = "moxie.windowState";

interface WindowState {
  width: number;
  height: number;
  maximized: boolean;
}

function load(): WindowState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as WindowState;
    if (
      typeof s.width !== "number" ||
      typeof s.height !== "number" ||
      s.width < 500 ||
      s.height < 400
    ) {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function save(state: WindowState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 忽略持久化失败
  }
}

/** 主窗口启动时恢复上次尺寸/最大化；非主窗口不生效 */
export function restoreWindowState(): void {
  void (async () => {
    const win = getCurrentWindow();
    if (win.label !== "main") return;
    const state = load();
    if (!state) return;
    try {
      if (state.maximized) {
        await win.maximize();
      } else {
        await win.setSize(
          new LogicalSize(Math.round(state.width), Math.round(state.height))
        );
      }
    } catch {
      // 恢复失败保持默认尺寸
    }
  })();
}

/** 主窗口挂载后跟踪尺寸变化（防抖 600ms）；返回清理函数 */
export function trackWindowState(): () => void {
  const win = getCurrentWindow();
  if (win.label !== "main") return () => {};
  let timer: number | null = null;

  const capture = async () => {
    try {
      const maximized = await win.isMaximized();
      const prev = load();
      if (maximized) {
        save({
          width: prev?.width ?? window.innerWidth,
          height: prev?.height ?? window.innerHeight,
          maximized: true,
        });
        return;
      }
      // 从最大化还原后 innerWidth/innerHeight 即新的常规尺寸
      save({
        width: window.innerWidth,
        height: window.innerHeight,
        maximized: false,
      });
    } catch {
      // ignore
    }
  };

  const onResize = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void capture();
    }, 600);
  };

  window.addEventListener("resize", onResize);
  let unlisten: (() => void) | null = null;
  void win.onResized(onResize).then((fn) => {
    unlisten = fn;
  });

  return () => {
    if (timer !== null) window.clearTimeout(timer);
    window.removeEventListener("resize", onResize);
    unlisten?.();
  };
}
