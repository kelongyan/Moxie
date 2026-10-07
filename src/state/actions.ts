import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { EditorView } from "@codemirror/view";
import { baseName, isMarkdownPath, MARKDOWN_EXTENSIONS } from "../models/markdown";
import { LineEnding } from "../models/encoding";
import { activeDocument, useDocuments } from "../state/documents";
import { resolveProfile } from "../state/performance";
import { flushDocument, replaceContent, viewFor } from "../editor/registry";
import { promptSaveChoice } from "../state/savePrompt";
import { promptInput } from "../state/prompts";
import { usePreferences } from "../state/preferences";
import { markSelfWrite, syncWatchedDirs } from "../state/externalWatch";
import {
  buildExportHtml,
  inlineLocalImages,
} from "../preview/exportHtml";
import {
  collectPreviewTokens,
  renderBody,
  renderShell,
} from "../preview/markdown";
import { directoryOf, localImagePlaceholder } from "../preview/markdownCore";
import {
  promptConflictChoice,
  promptEncodingChoice,
  promptLossyChoice,
} from "../state/fileDialogs";

export interface ReadResult {
  text: string;
  encoding: string;
  lineEnding: LineEnding;
}

export interface RevisionResult {
  identity: string;
  modifiedMs: number;
  size: number;
}

const MARKDOWN_FILTER = [{ name: "Markdown 文件", extensions: MARKDOWN_EXTENSIONS }];

export function newTabAction() {
  useDocuments.getState().createUntitled();
}

async function getRevision(path: string): Promise<RevisionResult | null> {
  try {
    return await invoke<RevisionResult>("get_file_revision", { path });
  } catch {
    return null;
  }
}

async function readDocumentContent(path: string): Promise<ReadResult | null> {
  try {
    return await invoke<ReadResult>("read_text_file", { path });
  } catch (error) {
    if (String(error) !== "not-utf8") {
      useDocuments
        .getState()
        .setStatus({ text: `无法打开文件:${error}`, kind: "error" });
      return null;
    }
  }
  for (;;) {
    const choice = await promptEncodingChoice(baseName(path));
    if (!choice) return null;
    try {
      return await invoke<ReadResult>("read_text_file_with_encoding", {
        path,
        encoding: choice,
      });
    } catch {
      useDocuments
        .getState()
        .setStatus({ text: "所选编码无法解码该文件,请尝试其他编码", kind: "error" });
    }
  }
}

export async function openPathAction(path: string): Promise<boolean> {
  if (!isMarkdownPath(path)) {
    useDocuments.getState().setStatus({
      text: "Moxie 仅支持 Markdown 文件(.md / .markdown)",
      kind: "error",
    });
    return false;
  }
  const store = useDocuments.getState();
  const revision = await getRevision(path);
  if (revision) {
    const existing = store.documents.find(
      (d) => d.fileIdentity === revision!.identity
    );
    if (existing) {
      store.setActive(existing.id);
      store.setStatus({ text: "该文件已在编辑器中打开", kind: "info" });
      return false;
    }
  }

  const content = await readDocumentContent(path);
  if (!content) return false;

  const id = store.addOpened(path, content.text);
  const bytes = new TextEncoder().encode(content.text).length;
  let lines = 1;
  for (let i = 0; i < content.text.length; i++) {
    if (content.text[i] === "\n") lines++;
  }
  useDocuments.getState().patchDocument(id, {
    encoding: content.encoding,
    lineEnding: content.lineEnding,
    fileIdentity: revision?.identity ?? null,
    fileRevision: revision,
    perfBytes: bytes,
    perfTier: resolveProfile(bytes, lines),
  });
  useDocuments.getState().setStatus(null);
  void invoke("recent_add", { path });
  return true;
}

export async function openFileAction() {
  const picked = await open({
    multiple: false,
    title: "打开 Markdown 文件",
    filters: MARKDOWN_FILTER,
  });
  if (!picked || Array.isArray(picked)) return;
  await openPathAction(picked);
}

async function writeToFile(
  docId: string,
  target: string,
  encodingOverride?: string
): Promise<boolean> {
  const store = useDocuments.getState();
  const doc = store.documents.find((d) => d.id === docId);
  if (!doc) return false;

  const targetRevision = await getRevision(target);
  if (targetRevision) {
    const occupied = useDocuments
      .getState()
      .documents.find(
        (d) => d.id !== docId && d.fileIdentity === targetRevision.identity
      );
    if (occupied) {
      store.setActive(occupied.id);
      store.setStatus({
        text: "该文件已在 Moxie 的另一个标签中打开",
        kind: "error",
      });
      return false;
    }
  }

  const encoding = encodingOverride ?? doc.encoding;
  store.patchDocument(docId, { ioState: "saving" });
  try {
    await invoke("write_text_file", {
      path: target,
      text: doc.text,
      encoding,
      lineEnding: doc.lineEnding,
    });
  } catch (error) {
    store.patchDocument(docId, { ioState: "idle" });
    if (String(error) === "unrepresentable") {
      const choice = await promptLossyChoice(doc.name);
      if (choice === "save-utf8") {
        return writeToFile(docId, target, "utf-8");
      }
      return false;
    }
    store.setStatus({ text: `保存失败:${error}`, kind: "error" });
    return false;
  }

  const newRevision = await getRevision(target);
  const after = useDocuments.getState();
  after.updateLocation(docId, target);
  after.patchDocument(docId, {
    ioState: "idle",
    encoding,
    fileIdentity: newRevision?.identity ?? null,
    fileRevision: newRevision,
    savedText: doc.text,
    isDirty: false,
  });
  // 自身写盘也会触发 notify 事件：记录时间窗供 externalWatch 抑制
  markSelfWrite(target);
  void syncWatchedDirs();
  // 本地版本时间线：每次成功写盘记一份快照（Rust 形参名为 content）
  void invoke("timeline_save", { path: target, content: doc.text }).catch(() => {});

  const liveText = viewFor(docId)?.state.doc.toString();
  if (liveText !== undefined && liveText !== doc.text) {
    after.markDirty(docId, true);
    after.setStatus({
      text: "已保存先前版本,仍有未保存更改",
      kind: "info",
    });
  } else {
    after.setStatus(null);
  }
  void invoke("recent_add", { path: target });
  return true;
}

async function reloadFromDisk(docId: string, path: string): Promise<void> {
  const content = await readDocumentContent(path);
  if (!content) return;
  const revision = await getRevision(path);
  replaceContent(docId, content.text);
  const store = useDocuments.getState();
  store.syncText(docId, content.text);
  store.updateLocation(docId, path);
  store.patchDocument(docId, {
    encoding: content.encoding,
    lineEnding: content.lineEnding,
    fileIdentity: revision?.identity ?? null,
    fileRevision: revision,
    savedText: content.text,
    isDirty: false,
  });
  store.setStatus({ text: "已重新载入磁盘版本", kind: "info" });
}

/** 外部修改监听的重载入口（干净文档静默重载，脏文档经确认后调用） */
export async function reloadFromDiskAction(
  docId: string,
  path: string
): Promise<boolean> {
  const doc = useDocuments.getState().documents.find((d) => d.id === docId);
  if (!doc || doc.path !== path) return false;
  await reloadFromDisk(docId, path);
  return true;
}

export async function saveDocumentAction(docId: string): Promise<boolean> {
  const store = useDocuments.getState();
  const doc = store.documents.find((d) => d.id === docId);
  if (!doc || doc.ioState === "saving") return false;
  flushDocument(docId);
  const current = useDocuments.getState().documents.find((d) => d.id === docId);
  if (!current) return false;

  let target = current.path;
  if (!target) {
    const picked = await save({
      title: "保存文件",
      defaultPath: current.name === "未命名" ? "未命名.md" : current.name,
      filters: MARKDOWN_FILTER,
    });
    if (!picked) return false;
    target = picked;
  }

  if (current.fileRevision && current.path === target) {
    const now = await getRevision(target);
    const old = current.fileRevision;
    const changed =
      now !== null &&
      (now.identity !== old.identity ||
        now.modifiedMs !== old.modifiedMs ||
        now.size !== old.size);
    if (changed) {
      const choice = await promptConflictChoice(current.name);
      if (choice === "cancel") return false;
      if (choice === "reload") {
        await reloadFromDisk(docId, target);
        return true;
      }
      if (choice === "save-as") {
        const picked = await save({
          title: "另存为",
          defaultPath: target,
          filters: MARKDOWN_FILTER,
        });
        if (!picked) return false;
        target = picked;
      }
    }
  }

  return writeToFile(docId, target);
}

export async function saveActiveAction(): Promise<boolean> {
  const doc = activeDocument();
  if (!doc) return false;
  return saveDocumentAction(doc.id);
}

export async function saveAsAction(): Promise<boolean> {
  const doc = activeDocument();
  if (!doc) return false;
  flushDocument(doc.id);
  const picked = await save({
    title: "另存为",
    defaultPath: doc.path ?? (doc.name === "未命名" ? "未命名.md" : doc.name),
    filters: MARKDOWN_FILTER,
  });
  if (!picked) return false;
  return writeToFile(doc.id, picked);
}

export async function closeTabAction(docId: string): Promise<void> {
  const store = useDocuments.getState();
  const doc = store.documents.find((d) => d.id === docId);
  if (!doc) return;
  flushDocument(docId);
  const current = useDocuments.getState().documents.find((d) => d.id === docId);
  if (!current) return;

  if (current.isDirty) {
    const choice = await promptSaveChoice(current.name);
    if (choice === "cancel") return;
    if (choice === "save") {
      const saved = await saveDocumentAction(docId);
      if (!saved) return;
    }
  }
  useDocuments.getState().close(docId);
  // 渲染进程在销毁最后一个编辑器视图时会崩溃（v1.0.0 既有问题，与 UI 改动无关）。
  // 关闭最后一个标签后同步重建空白标签，使 React 永远看不到空文档中间态；
  // 兜底模式与 windows.ts 的"移入新窗口"路径一致。
  if (useDocuments.getState().documents.length === 0) {
    useDocuments.getState().createUntitled();
  }
}

export async function closeOtherTabsAction(keepId: string): Promise<void> {
  const ids = useDocuments
    .getState()
    .documents.filter((d) => d.id !== keepId)
    .map((d) => d.id);
  for (const id of ids) {
    await closeTabAction(id);
    if (useDocuments.getState().documents.find((d) => d.id === id)) return;
  }
}

export async function closeTabsToRightAction(anchorId: string): Promise<void> {
  const docs = useDocuments.getState().documents;
  const index = docs.findIndex((d) => d.id === anchorId);
  if (index < 0) return;
  for (const doc of docs.slice(index + 1)) {
    await closeTabAction(doc.id);
  }
}

// ---------- 跳转到行 ----------

/** Ctrl+L：输入行号并跳转（越界夹取，非法输入提示） */
export async function gotoLineAction(): Promise<boolean> {
  const doc = activeDocument();
  const view = doc ? viewFor(doc.id) : undefined;
  if (!doc || !view) return false;
  const store = useDocuments.getState();
  const current = store.documents.find((d) => d.id === doc.id)?.cursorLine ?? 1;
  const input = await promptInput(
    `跳转到行(1-${view.state.doc.lines}):`,
    String(current)
  );
  if (!input) return false;
  const n = Number.parseInt(input.trim(), 10);
  if (!Number.isFinite(n) || String(n) !== input.trim()) {
    store.setStatus({ text: "请输入有效的行号数字", kind: "error" });
    return false;
  }
  const line = Math.min(Math.max(1, n), view.state.doc.lines);
  const pos = view.state.doc.line(line).from;
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: "center" }),
  });
  view.focus();
  return true;
}

// ---------- 图片插入（粘贴 / 拖入共用一条落盘链路） ----------

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
};

function imageFileName(prefix: string, ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${prefix}-${stamp}.${ext}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function insertImageIntoActiveDoc(
  base64: string,
  ext: string,
  displayName: string
): Promise<boolean> {
  const store = useDocuments.getState();
  const doc = activeDocument();
  const view = doc ? viewFor(doc.id) : undefined;
  if (!doc || !view) {
    store.setStatus({ text: "没有可插入图片的文档", kind: "error" });
    return false;
  }
  const baseDir = doc.path ? directoryOf(doc.path) : null;
  if (!baseDir) {
    store.setStatus({ text: "请先保存文档，再插入图片", kind: "error" });
    return false;
  }
  const folder = (usePreferences.getState().imageFolder || "assets")
    .replace(/[\\/]+/g, "\\")
    .replace(/^\\+|\\+$/g, "");
  const name = imageFileName(displayName, ext);
  const target = `${baseDir}\\${folder}\\${name}`;
  try {
    await invoke("write_file_base64", { path: target, dataBase64: base64 });
  } catch (error) {
    store.setStatus({ text: `图片保存失败:${error}`, kind: "error" });
    return false;
  }
  const rel = `${folder.replace(/\\/g, "/")}/${name}`;
  view.dispatch(view.state.replaceSelection(`![${displayName}](${rel})`), {
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

/** 粘贴图片：落盘到文档图片目录并在光标处插入引用 */
export async function insertImageFileAction(file: File): Promise<boolean> {
  const ext = IMAGE_EXT_BY_MIME[file.type] ?? "png";
  const base64 = await fileToBase64(file);
  return insertImageIntoActiveDoc(base64, ext, "图片");
}

/** 拖入磁盘图片：复制到文档图片目录并在光标处插入引用 */
export async function insertImagePathAction(path: string): Promise<boolean> {
  const ext = (path.split(".").pop() ?? "png").toLowerCase();
  const name = path.split(/[\\/]/).pop() ?? "图片";
  let base64: string;
  try {
    base64 = await invoke<string>("read_file_base64", { path });
  } catch (error) {
    useDocuments.getState().setStatus({ text: `无法读取图片:${error}`, kind: "error" });
    return false;
  }
  return insertImageIntoActiveDoc(base64, ext, name.replace(/\.[^.]+$/, ""));
}

// ---------- 复制为富文本 ----------

/** 把渲染 HTML（双格式）写入系统剪贴板；ClipboardItem 不可用时退纯文本 */
async function writeClipboardRich(html: string, plainText: string): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // 双格式写入失败（无用户激活等），退纯文本
    }
  }
  await navigator.clipboard.writeText(plainText);
}

/**
 * 复制为富文本：当前文档（或选区）渲染为 HTML，本地图片内联 base64，
 * 连同 shell 样式一起写入剪贴板，粘贴到 Word/微信等保留排版。
 */
export async function copyRichTextAction(): Promise<boolean> {
  const doc = activeDocument();
  const view = doc ? viewFor(doc.id) : undefined;
  if (!doc || !view) return false;
  const prefs = usePreferences.getState();
  const sel = view.state.selection.main;
  const text = sel.empty
    ? view.state.doc.toString()
    : view.state.sliceDoc(sel.from, sel.to);
  const baseDir = doc.path ? directoryOf(doc.path) : null;
  const body = renderBody(text, {
    baseDir,
    assetUrl: localImagePlaceholder,
    breaks: prefs.markdownBreaks,
    typographer: prefs.markdownTypographer,
    allowHtml: prefs.markdownAllowHtml,
  });
  const withImages = await inlineLocalImages(body);
  const full = buildExportHtml(
    renderShell(
      collectPreviewTokens({
        theme: prefs.exportTheme,
        codeLineNumbers: prefs.exportCodeLineNumbers,
        narrow: prefs.exportNarrow,
      }),
      doc.name
    ),
    withImages
  );
  const styles = (full.match(/<style>[\s\S]*?<\/style>/g) ?? []).join("\n");
  const article = /<article>[\s\S]*?<\/article>/.exec(full)?.[0] ?? withImages;
  try {
    await writeClipboardRich(`${styles}${article}`, text);
  } catch (error) {
    useDocuments.getState().setStatus({ text: `复制失败:${error}`, kind: "error" });
    return false;
  }
  useDocuments.getState().setStatus({ text: "已复制为富文本", kind: "info" });
  return true;
}
