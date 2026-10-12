import {
  EditorSelection,
  EditorState,
  Extension,
  Prec,
  RangeSet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, EditorView, keymap } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

/**
 * 图片交互层（P0，墨记同款体验的 CodeMirror 移植）：
 * 图片恒渲染为 widget、点击=选中（高亮 + 浮动工具条）、
 * Backspace/Delete 紧邻图片先选中再删除、方向键经 atomicRanges 跨过图片。
 * 工具条宿主回调由 actions 层注入（见 setImageToolbarHost），本层不依赖状态层。
 */

export interface SelectedImageRange {
  from: number;
  to: number;
}

export const setSelectedImageEffect = StateEffect.define<SelectedImageRange | null>();

/**
 * 当前选中的图片范围（源码区间）。选中后光标停在图片两端仍视为选中
 * （左右方向键在两端微调不闪断），离开两端或范围随编辑失效即自动取消。
 */
export const selectedImageField = StateField.define<SelectedImageRange | null>({
  create: () => null,
  update(value, tr) {
    // 显式 effect 携带的坐标按「事务后文档」解释（改写源码的事务同时带 effect 与
    // docChanged，若再做 mapPos 会把新坐标二次映射回区间起点而塌陷）
    let next = value;
    let hasEffect = false;
    for (const e of tr.effects) {
      if (e.is(setSelectedImageEffect)) {
        next = e.value;
        hasEffect = true;
      }
    }
    if (!next) return null;
    if (!hasEffect && tr.docChanged) {
      const from = tr.changes.mapPos(next.from);
      const to = tr.changes.mapPos(next.to);
      // 范围塌陷或首尾不再是图片语法 → 编辑已破坏该图片，取消选中
      if (
        to - from < 4 ||
        tr.state.doc.sliceString(from, from + 2) !== "![" ||
        tr.state.doc.sliceString(to - 1, to) !== ")"
      ) {
        return null;
      }
      return { from, to };
    }
    if (tr.selection) {
      const main = tr.selection.main;
      // 光标停在图片两端仍视为选中（左右键微调不闪断），离开即取消
      if (!main.empty || (main.head !== next.from && main.head !== next.to)) {
        return null;
      }
    }
    return next;
  },
});

/** `![alt](src)` 解析（与 livePreview 的装饰规则同一条正则，语义一致） */
export function parseImageMarkdown(
  raw: string
): { alt: string; src: string } | null {
  const m = /^!\[([\s\S]*?)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)$/.exec(raw);
  if (!m) return null;
  return { alt: m[1], src: m[2] };
}

/** 图片源码 token 的统一形态：Markdown 与 HTML `<img>` 双形式 */
export interface ImageTokenInfo {
  alt: string;
  src: string;
  /** 缩放写回的宽度（字符串数字）；纯 Markdown 形式没有 */
  width?: string;
  /** data-align 对齐；纯 Markdown 形式没有 */
  align?: string;
  /** 源码是否为 HTML `<img>` 形式（缩放/对齐后整段改写为 HTML，墨记同款） */
  html: boolean;
  /** 粘贴占位（alt 为 upload-<id>、src 为 base64 预览）：落盘中，渲染转圈角标 */
  uploading?: boolean;
}

const IMG_ATTR_RE = /([a-zA-Z-]+)\s*=\s*"([^"]*)"|([a-zA-Z-]+)\s*=\s*'([^']*)'/g;

/** 解析图片源码：Markdown 形式或 HTML `<img>` 形式，其余返回 null */
export function parseImageToken(raw: string): ImageTokenInfo | null {
  const md = parseImageMarkdown(raw);
  if (md) {
    return {
      alt: md.alt,
      src: md.src,
      html: false,
      uploading: /^upload-/.test(md.alt),
    };
  }
  const tag = /^<img\s+([\s\S]*?)\/?>$/i.exec(raw.trim());
  if (!tag) return null;
  const attrs: Record<string, string> = {};
  for (const m of tag[1].matchAll(IMG_ATTR_RE)) {
    const name = (m[1] ?? m[3]).toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeAttr(m[2] ?? m[4] ?? "");
  }
  if (!attrs.src) return null;
  return {
    alt: attrs.alt ?? "",
    src: attrs.src,
    width: attrs.width || undefined,
    align: attrs["data-align"] || undefined,
    html: true,
  };
}

const escapeAttr = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** 序列化转义的逆操作（只处理我们写出的四个实体，往返无损） */
const decodeAttr = (value: string): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** 序列化回源码：无尺寸/对齐时保持纯 Markdown，否则写 HTML `<img>` */
export function serializeImageToken(info: ImageTokenInfo): string {
  if (!info.html && !info.width && !info.align) {
    return `![${info.alt}](${info.src})`;
  }
  let s = `<img src="${escapeAttr(info.src)}"`;
  if (info.alt) s += ` alt="${escapeAttr(info.alt)}"`;
  if (info.width) s += ` width="${info.width}"`;
  if (info.align) s += ` data-align="${info.align}"`;
  return `${s} />`;
}

// —— 工具条宿主回调（actions 层注入） ——

export interface ImageToolbarHost {
  /** 在系统文件管理器中显示图片文件（rawSrc 为 Markdown 里的路径） */
  revealInExplorer(rawSrc: string): void;
  /** 弹出文件选择并把图片落盘到文档图片目录；返回相对路径，取消返回 null */
  pickAndSaveImage(): Promise<string | null>;
}

let host: ImageToolbarHost = {
  revealInExplorer: () => {},
  pickAndSaveImage: async () => null,
};

export function setImageToolbarHost(next: Partial<ImageToolbarHost>): void {
  host = { ...host, ...next };
}

// —— 选中与删除 ——

export function selectImageRange(
  view: EditorView,
  from: number,
  to: number
): void {
  const current = view.state.field(selectedImageField, false);
  // 已选中同一张图：不重复 dispatch（会触发装饰全量重算导致 <img> 重载闪烁）
  if (current && current.from === from && current.to === to) return;
  view.dispatch({
    selection: EditorSelection.cursor(to),
    effects: setSelectedImageEffect.of({ from, to }),
  });
  showImageToolbar(view, from, to);
}

export function deleteSelectedImage(view: EditorView): boolean {
  const sel = view.state.field(selectedImageField, false);
  if (!sel) return false;
  view.dispatch({
    changes: { from: sel.from, to: sel.to },
    selection: EditorSelection.cursor(sel.from),
    effects: setSelectedImageEffect.of(null),
    userEvent: "delete",
  });
  return true;
}

/** 改写图片源码并保持选中（一个事务完成，工具条跟随新范围重建） */
function applyImageRewrite(
  view: EditorView,
  from: number,
  to: number,
  info: ImageTokenInfo
): void {
  const text = serializeImageToken(info);
  view.dispatch({
    changes: { from, to, insert: text },
    selection: EditorSelection.cursor(from + text.length),
    effects: setSelectedImageEffect.of({ from, to: from + text.length }),
    userEvent: "input",
  });
  showImageToolbar(view, from, from + text.length);
}

/** 对齐：null = 内联（回纯 Markdown 形式）；有对齐/尺寸时整段写 HTML `<img>`（墨记同款） */
export function alignImageTo(
  view: EditorView,
  from: number,
  to: number,
  align: "left" | "center" | "right" | null
): void {
  const info = parseImageToken(view.state.doc.sliceString(from, to));
  if (!info) return;
  applyImageRewrite(view, from, to, { ...info, align: align ?? undefined });
}

/** 缩放提交：把拖拽出的宽度写回源码 */
export function resizeImageTo(
  view: EditorView,
  from: number,
  to: number,
  width: number
): void {
  const info = parseImageToken(view.state.doc.sliceString(from, to));
  if (!info) return;
  applyImageRewrite(view, from, to, { ...info, width: String(width) });
}

/** 光标紧邻的图片：side=before 找结尾在 pos 的图（Backspace），after 找开头在 pos 的（Delete） */
function isImageNodeRaw(
  state: EditorState,
  from: number,
  to: number,
  name: string
): boolean {
  if (name === "Image") return true;
  if (name !== "HTMLTag") return false;
  // 缩放/对齐后的图片源码是 HTML `<img>`（lezer 解析为 HTMLTag）
  return /^<img[\s>/]/i.test(
    state.doc.sliceString(from, Math.min(to, from + 12)).trimStart()
  );
}

function imageAtBoundary(
  state: EditorState,
  pos: number,
  side: "before" | "after"
): SelectedImageRange | null {
  const line = state.doc.lineAt(pos);
  let found: SelectedImageRange | null = null;
  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter: (node) => {
      if (found) return false;
      if (!isImageNodeRaw(state, node.from, node.to, node.name)) {
        return undefined;
      }
      if (side === "before" && node.to === pos) {
        found = { from: node.from, to: node.to };
        return false;
      }
      if (side === "after" && node.from === pos) {
        found = { from: node.from, to: node.to };
        return false;
      }
      return undefined;
    },
  });
  return found;
}

// —— 浮动工具条 ——

let toolbarEl: HTMLElement | null = null;
let toolbarAnchor: { view: EditorView; from: number; to: number } | null = null;
let editPopoverEl: HTMLElement | null = null;

export function closeImageToolbar(): void {
  toolbarEl?.remove();
  toolbarEl = null;
  toolbarAnchor = null;
  closeEditPopover();
}

function closeEditPopover(): void {
  editPopoverEl?.remove();
  editPopoverEl = null;
}

document.addEventListener(
  "mousedown",
  (e) => {
    if (!toolbarEl) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest(".md-image, .md-image-toolbar")) return;
    closeImageToolbar();
    // 点到编辑器别处：同步清掉选中态（与 selectedImageField 的光标规则一致收口）
    toolbarAnchor?.view.dispatch({
      effects: setSelectedImageEffect.of(null),
    });
  },
  true
);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && toolbarEl) {
    e.stopPropagation();
    closeImageToolbar();
  }
});

const SVG = {
  edit: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
  folder: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  swap: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.55-4"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/></svg>`,
  inline: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><path d="M14 8l4 4-4 4"/><path d="M10 16l-4-4 4-4" transform="translate(0 0)" opacity="0"/></svg>`,
  left: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="12" height="8" rx="1"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  center: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="5" width="12" height="8" rx="1"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  right: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="5" width="12" height="8" rx="1"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
};

function toolbarButton(
  label: string,
  icon: string,
  onClick: () => void,
  active = false
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  if (active) btn.className = "is-active";
  btn.innerHTML = icon;
  btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function positionToolbar(view: EditorView, from: number, to: number): void {
  if (!toolbarEl) return;
  const leftEdge = view.coordsAtPos(from);
  const rightEdge = view.coordsAtPos(to);
  if (!leftEdge || !rightEdge) {
    closeImageToolbar();
    return;
  }
  const rect = toolbarEl.getBoundingClientRect();
  const centerX = (leftEdge.left + rightEdge.right) / 2;
  const top = Math.min(leftEdge.top, rightEdge.top);
  toolbarEl.style.left = `${Math.max(
    8,
    Math.min(centerX - rect.width / 2, window.innerWidth - rect.width - 8)
  )}px`;
  toolbarEl.style.top = `${Math.max(8, top - rect.height - 6)}px`;
}

function showImageToolbar(view: EditorView, from: number, to: number): void {
  closeImageToolbar();
  const raw = view.state.doc.sliceString(from, to);
  const info = parseImageToken(raw);
  if (!info) return;
  toolbarAnchor = { view, from, to };

  const bar = document.createElement("div");
  bar.className = "md-image-toolbar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "图片工具条");

  bar.appendChild(
    toolbarButton("编辑图片", SVG.edit, () => openEditPopover(view, from, to, info))
  );
  // 对齐四键（墨记同款）：内联回纯 Markdown，左/中/右写 data-align
  bar.appendChild(
    toolbarButton("内联（取消对齐）", SVG.inline, () => alignImageTo(view, from, to, null), !info.align)
  );
  bar.appendChild(
    toolbarButton("左对齐", SVG.left, () => alignImageTo(view, from, to, "left"), info.align === "left")
  );
  bar.appendChild(
    toolbarButton("居中", SVG.center, () => alignImageTo(view, from, to, "center"), info.align === "center")
  );
  bar.appendChild(
    toolbarButton("右对齐", SVG.right, () => alignImageTo(view, from, to, "right"), info.align === "right")
  );
  bar.appendChild(
    toolbarButton("在资源管理器中显示", SVG.folder, () => {
      host.revealInExplorer(info.src);
    })
  );
  bar.appendChild(
    toolbarButton("复制图片路径", SVG.copy, () => {
      void navigator.clipboard.writeText(info.src);
    })
  );
  bar.appendChild(
    toolbarButton("删除图片", SVG.trash, () => {
      closeImageToolbar();
      deleteSelectedImage(view);
    })
  );

  document.body.appendChild(bar);
  toolbarEl = bar;
  positionToolbar(view, from, to);
}

/** 编辑浮层：改 alt 与路径（保留宽度/对齐属性）；「替换图片文件」经宿主落盘后回填路径 */
function openEditPopover(
  view: EditorView,
  from: number,
  to: number,
  info: ImageTokenInfo
): void {
  closeEditPopover();
  const pop = document.createElement("div");
  pop.className = "md-image-edit-popover";

  const altLabel = document.createElement("label");
  altLabel.textContent = "描述（alt）";
  const altInput = document.createElement("input");
  altInput.value = info.alt;
  altInput.placeholder = "图片描述";
  altLabel.appendChild(altInput);

  const srcLabel = document.createElement("label");
  srcLabel.textContent = "路径";
  const srcRow = document.createElement("div");
  srcRow.className = "md-image-edit-src-row";
  const srcInput = document.createElement("input");
  srcInput.value = info.src;
  srcInput.placeholder = "assets/图片.png";
  const pickBtn = document.createElement("button");
  pickBtn.type = "button";
  pickBtn.title = "替换图片文件";
  pickBtn.setAttribute("aria-label", "替换图片文件");
  pickBtn.innerHTML = SVG.swap;
  pickBtn.addEventListener("mousedown", (e) => e.stopPropagation());
  pickBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    pickBtn.disabled = true;
    try {
      const rel = await host.pickAndSaveImage();
      if (rel) srcInput.value = rel;
    } finally {
      pickBtn.disabled = false;
    }
  });
  srcRow.appendChild(srcInput);
  srcRow.appendChild(pickBtn);
  srcLabel.appendChild(srcRow);

  const actions = document.createElement("div");
  actions.className = "md-image-edit-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeEditPopover();
  });
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "is-primary";
  saveBtn.textContent = "保存";
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    save();
  });
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  const save = () => {
    const alt = altInput.value.trim();
    const src = srcInput.value.trim();
    if (!src) return;
    closeEditPopover();
    closeImageToolbar();
    applyImageRewrite(view, from, to, { ...info, alt, src });
    view.focus();
  };
  pop.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
    // Escape 由 document 级监听关闭工具条
  });

  pop.appendChild(altLabel);
  pop.appendChild(srcLabel);
  pop.appendChild(actions);
  document.body.appendChild(pop);
  editPopoverEl = pop;
  // 紧贴工具条下方
  if (toolbarEl) {
    const rect = toolbarEl.getBoundingClientRect();
    pop.style.left = `${Math.max(
      8,
      Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8)
    )}px`;
    pop.style.top = `${rect.bottom + 6}px`;
  } else {
    const edge = view.coordsAtPos(from);
    if (edge) {
      pop.style.left = `${Math.max(8, edge.left)}px`;
      pop.style.top = `${Math.max(8, edge.bottom + 6)}px`;
    }
  }
  altInput.focus();
  altInput.select();
}

/** 工具条随选中态/几何变化同步：范围失效即关，范围不动则重定位（跟随滚动） */
function syncToolbar(view: EditorView): void {
  if (!toolbarEl || !toolbarAnchor || toolbarAnchor.view !== view) return;
  const sel = view.state.field(selectedImageField, false);
  if (!sel || sel.from !== toolbarAnchor.from || sel.to !== toolbarAnchor.to) {
    closeImageToolbar();
    return;
  }
  positionToolbar(view, toolbarAnchor.from, toolbarAnchor.to);
}

// —— 扩展装配 ——

/**
 * 图片交互扩展：
 * - selectedImageField 必须排在 livePreview 装饰字段之前（装饰计算要读选中态）；
 * - atomicRanges 让方向键跨过整张图片，光标只能落在图片两端；
 * - 键位：Backspace/Delete 紧邻图片先选中、选中态再按删除；Escape 取消选中。
 */
export function imageInteraction(): Extension {
  const atomic = EditorView.atomicRanges.of((view) => {
    // 复用 replace 装饰构造 Range（@lezer 的 Range 构造器不公开）；值本身不参与比较
    const ranges: ReturnType<Decoration["range"]>[] = [];
    const tree = syntaxTree(view.state);
    tree.iterate({
      from: view.viewport.from,
      to: view.viewport.to,
      enter: (node) => {
        if (isImageNodeRaw(view.state, node.from, node.to, node.name)) {
          ranges.push(Decoration.replace({}).range(node.from, node.to));
          return false;
        }
        return undefined;
      },
    });
    return RangeSet.of(ranges);
  });

  const keys = Prec.highest(
    keymap.of([
      {
        key: "Backspace",
        run: (view) => {
          if (deleteSelectedImage(view)) return true;
          if (!view.state.selection.main.empty) return false;
          const sel = imageAtBoundary(
            view.state,
            view.state.selection.main.head,
            "before"
          );
          if (!sel) return false;
          selectImageRange(view, sel.from, sel.to);
          return true;
        },
      },
      {
        key: "Delete",
        run: (view) => {
          if (deleteSelectedImage(view)) return true;
          if (!view.state.selection.main.empty) return false;
          const sel = imageAtBoundary(
            view.state,
            view.state.selection.main.head,
            "after"
          );
          if (!sel) return false;
          selectImageRange(view, sel.from, sel.to);
          return true;
        },
      },
      {
        key: "Escape",
        run: (view) => {
          if (!view.state.field(selectedImageField, false)) return false;
          view.dispatch({ effects: setSelectedImageEffect.of(null) });
          return true;
        },
      },
    ])
  );

  const sync = EditorView.updateListener.of((update) => {
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.geometryChanged
    ) {
      syncToolbar(update.view);
    }
  });

  return [selectedImageField, atomic, keys, sync];
}
