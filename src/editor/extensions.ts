import {
  EditorState,
  Extension,
  Prec,
} from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  undo,
} from "@codemirror/commands";
import {
  codeFolding,
  foldGutter,
  foldKeymap,
  indentUnit,
  syntaxTree,
} from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { highlightExtension } from "./highlightTheme";
import { markdownExtensions } from "./languages";
import { livePreview, ImageSrcResolver } from "./livePreview";
import {
  markdownEnterHandler,
  renumberOrderedList,
} from "./listContinuation";
import {
  makeLinkHandler,
  makeQuoteHandler,
  makeWrapHandler,
} from "./formatting";
import { pasteImageExtension } from "./pasteImage";
import { focusMode, typewriterMode } from "./focusMode";
import { searchHighlightField } from "./searchHighlight";
import { PT_TO_PX } from "../state/preferences";
import { spacingScale, type BlockSpacing } from "../preview/typography";

export interface EditorOptions {
  docId: string;
  initialText: string;
  wordWrap: boolean;
  showLineNumbers: boolean;
  fontSizePt: number;
  lineSpacingPt: number;
  /** 段间距档位（缺省 standard）；仅书写面（livePreview）使用 */
  blockSpacing?: BlockSpacing;
  indentUnitText: string;
  enableHighlight: boolean;
  enableFold: boolean;
  /** 所见即所得：隐藏光标外的语法标记（大文件降级时关闭） */
  enableLivePreview: boolean;
  /** 图片 src → 可显示 URL（本地路径 → asset 协议），null 表示保持原文 */
  imageSrcResolver: ImageSrcResolver | null;
  /** Ctrl+点击书写面链接时回调（仅 http/https；未提供则不响应点击） */
  onOpenLink?: (url: string) => void;
  /** 粘贴图片时回调（落盘与插入见 actions.insertImageFileAction）；未提供则不拦截粘贴 */
  onImagePaste?: (file: File) => void;
  /** 专注模式：当前顶层块之外降透明度（仅书写面） */
  focusMode?: boolean;
  /** 打字机模式：光标行保持垂直居中（仅书写面） */
  typewriterMode?: boolean;
  onUpdate: (update: { docChanged: boolean; state: EditorState }) => void;
  onCursor: (line: number, column: number) => void;
}

function makeEnterHandler(unit: string) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const range = state.selection.main;
    const line = state.doc.lineAt(range.head);
    const before = line.text.slice(0, range.head - line.from);
    const indent = /^[\t ]*/.exec(before)?.[0] ?? "";
    const extra = /[{[]$/.test(before.trimEnd()) ? unit : "";
    view.dispatch(state.replaceSelection(`\n${indent}${extra}`), {
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  };
}

function makeTabHandler(unit: string) {
  return (view: EditorView): boolean => {
    view.dispatch(view.state.replaceSelection(unit), {
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  };
}

function makeShiftTabHandler(tabWidth: number) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const range = state.selection.main;
    const line = state.doc.lineAt(range.from);
    const leading = /^[\t ]*/.exec(line.text)?.[0] ?? "";
    if (leading.length === 0) return true;
    const removeCount = leading.startsWith("\t")
      ? 1
      : Math.min(tabWidth, leading.length);
    view.dispatch({
      changes: { from: line.from, to: line.from + removeCount, insert: "" },
      selection: {
        anchor: Math.max(line.from, range.anchor - removeCount),
        head: Math.max(line.from, range.head - removeCount),
      },
      userEvent: "delete",
    });
    return true;
  };
}

/** 标题级别快捷键（Ctrl+0-6，0=正文）：标题标记在书写面常隐藏后的级别调整入口 */
export function makeHeadingLevelHandler(level: number) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const line = state.doc.lineAt(state.selection.main.head);
    const m = /^(#{1,6})[ \t]/.exec(line.text);
    const target = level === 0 ? "" : `${"#".repeat(level)} `;
    // 已是目标级别时不动
    if (level === 0 ? !m : m !== null && m[1].length === level) return true;
    view.dispatch({
      changes: m
        ? { from: line.from, to: line.from + m[0].length, insert: target }
        : { from: line.from, to: line.from, insert: target },
      selection: { anchor: line.from + target.length },
      userEvent: "input",
      scrollIntoView: true,
    });
    return true;
  };
}

/** Ctrl+点击链接打开：命中 Link / Autolink 节点里的 http(s) URL 时交给 onOpenLink */
function linkClickExtension(onOpenLink: (url: string) => void): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;
      let link: SyntaxNode | null = null;
      for (
        let n: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 0);
        n;
        n = n.parent
      ) {
        if (n.name === "Link" || n.name === "Autolink") {
          link = n;
          break;
        }
      }
      if (!link) return false;
      let url: string | null = null;
      if (link.name === "Autolink") {
        url = view.state.sliceDoc(link.from, link.to);
      } else {
        for (let ch = link.firstChild; ch; ch = ch.nextSibling) {
          if (ch.name === "URL") {
            url = view.state.sliceDoc(ch.from, ch.to);
            break;
          }
        }
      }
      url = url?.trim() ?? "";
      if (!/^https?:\/\//i.test(url)) return false;
      event.preventDefault();
      onOpenLink(url);
      return true;
    },
  });
}

export function buildEditorState(options: EditorOptions): EditorState {
  const fontSizePx = options.fontSizePt * PT_TO_PX;
  // 行距偏好以默认 4pt（= TizuMark 1.7 行高）为零点，仅把偏离量叠加到基准 1.7em
  const lineSpacingPx = (options.lineSpacingPt - 4) * PT_TO_PX;
  const tabWidth = options.indentUnitText === "\t" ? 4 : options.indentUnitText.length;
  // 书写面 vs 源码视图（大文件降级即时渲染时回到源码形态）
  const editable = options.enableLivePreview;

  const theme = EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: `${fontSizePx}px`,
        backgroundColor: "var(--lac-bg)",
        color: "var(--lac-text)",
      },
      ".cm-scroller": {
        fontFamily: editable ? "var(--font-ui)" : "var(--font-mono)",
        // 基准 1.7em（TizuMark 正文行高）+ 行距偏离量；默认 lineSpacingPt=4 → 恰好 1.7
        lineHeight: `calc(1.7em + ${lineSpacingPx}px)`,
        // 中文排版增强，与导出 renderShell 对齐（markdown.ts）：全角标点挤压、
        // 等宽数字、kern/liga；旧 WebView2 不识别时无害回落
        textSpacingTrim: "space-first",
        fontVariantNumeric: "tabular-nums",
        fontFeatureSettings: '"kern" 1, "liga" 1, "calt" 1',
        // 书写面：正文区限宽居中（--measure-writing），两端留白；16/24 内边距由 .cm-content padding 提供
        // 源码视图：整块（行号 + 正文）居中并限制列宽；56px 是行号槽的预留宽度
        paddingInline: editable
          ? "max(0px, calc((100% - var(--measure-writing)) / 2))"
          : "max(0px, calc((100% - var(--measure) - 56px) / 2))",
      },
      ".cm-content": {
        caretColor: "var(--lac-accent)",
        padding: editable ? "24px 24px 32px" : "24px 0 32px",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--lac-accent)",
        borderLeftWidth: "2px",
      },
      "& .cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "var(--lac-selection)",
      },
      ".cm-activeLine": {
        backgroundColor: editable ? "transparent" : "var(--lac-current-line)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--lac-bg)",
        color: "var(--lac-text-tertiary)",
        border: "none",
        borderRight: "1px solid var(--lac-border)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        fontFamily: "var(--font-mono)",
        fontSize: "0.85em",
        minWidth: "40px",
        padding: "0 8px",
        fontVariantNumeric: "tabular-nums",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "var(--lac-text-secondary)",
      },
      ".cm-matchingBracket": {
        backgroundColor: "var(--lac-accent-soft)",
        outline: "none",
      },
      ".cm-foldGutter .cm-gutterElement": {
        padding: "0 4px",
        cursor: "pointer",
      },
      ".cm-foldPlaceholder": {
        fontFamily: "var(--font-mono)",
        border: "1px solid var(--lac-border)",
        color: "var(--lac-text-secondary)",
        borderRadius: "var(--radius-xs)",
      },
    },
    { dark: document.documentElement.dataset.theme === "dark" }
  );

  const enterBindings = [
    { key: "Enter", run: markdownEnterHandler },
    { key: "Enter", run: makeEnterHandler(options.indentUnitText) },
  ];

  const customKeys = keymap.of([
    ...enterBindings,
    { key: "Tab", run: makeTabHandler(options.indentUnitText) },
    { key: "Shift-Tab", run: makeShiftTabHandler(tabWidth) },
    { key: "Mod-z", run: undo },
    { key: "Mod-Shift-z", run: redo },
    // 书写面格式化：加粗/斜体/行内代码/链接/引用块
    { key: "Mod-b", run: makeWrapHandler("**") },
    { key: "Mod-i", run: makeWrapHandler("*") },
    { key: "Mod-e", run: makeWrapHandler("`") },
    { key: "Mod-k", run: makeLinkHandler() },
    { key: "Mod-Shift-q", run: makeQuoteHandler() },
    // 标题级别：Ctrl+0 正文、Ctrl+1-6 一到六级
    { key: "Mod-0", run: makeHeadingLevelHandler(0) },
    { key: "Mod-1", run: makeHeadingLevelHandler(1) },
    { key: "Mod-2", run: makeHeadingLevelHandler(2) },
    { key: "Mod-3", run: makeHeadingLevelHandler(3) },
    { key: "Mod-4", run: makeHeadingLevelHandler(4) },
    { key: "Mod-5", run: makeHeadingLevelHandler(5) },
    { key: "Mod-6", run: makeHeadingLevelHandler(6) },
  ]);

  const extensions: Extension[] = [
    theme,
    history(),
    drawSelection(),
    // 多光标与列选择：Alt+Click 加光标（Ctrl+Click 留给链接），Alt+拖拽列选；
    // livePreview 的 selectionTouches 遍历全部选区，装饰天然兼容
    EditorState.allowMultipleSelections.of(true),
    EditorView.clickAddsSelectionRange.of(
      (e) => e.altKey && !e.ctrlKey && !e.shiftKey
    ),
    rectangularSelection({
      eventFilter: (e) => e.altKey && e.shiftKey,
    }),
    searchHighlightField,
    indentUnit.of(options.indentUnitText),
    Prec.highest(customKeys),
    keymap.of([...foldKeymap, ...defaultKeymap, ...historyKeymap]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged || update.selectionSet) {
        const { state } = update;
        const head = state.selection.main.head;
        const line = state.doc.lineAt(head);
        options.onCursor(line.number, head - line.from + 1);
      }
      if (update.docChanged) {
        options.onUpdate({ docChanged: true, state: update.state });
      }
    }),
  ];
  // 当前行高亮是源码编辑器的痕迹，书写面（Typora/TizuMark）没有
  if (!editable) {
    extensions.push(highlightActiveLine(), highlightActiveLineGutter());
  }

  if (options.enableHighlight) {
    extensions.push(highlightExtension());
    extensions.push(...markdownExtensions());
  }
  if (options.enableLivePreview && options.imageSrcResolver) {
    extensions.push(
      livePreview(
        options.imageSrcResolver,
        spacingScale(fontSizePx, options.blockSpacing ?? "standard")
      )
    );
  }
  if (options.onOpenLink) {
    extensions.push(linkClickExtension(options.onOpenLink));
  }
  if (options.onImagePaste) {
    extensions.push(pasteImageExtension(options.onImagePaste));
  }
  if (editable && options.focusMode) {
    extensions.push(focusMode());
  }
  if (editable && options.typewriterMode) {
    extensions.push(typewriterMode());
  }
  if (options.enableFold) {
    extensions.push(codeFolding());
    // 折叠箭头槽只在源码视图出现；书写面靠键盘快捷键折叠
    if (!editable) {
      extensions.push(
        foldGutter({
          markerDOM: (open) => {
            const el = document.createElement("span");
            el.className = "fold-marker";
            el.innerHTML = open
              ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'
              : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
            return el;
          },
        })
      );
    }
  }

  extensions.push(
    EditorView.updateListener.of((update) => {
      if (!update.docChanged || !update.view) return;
      let crossed = false;
      let touchesNumber = false;
      update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        const insertedText = inserted.toString();
        if (insertedText.includes("\n")) crossed = true;
        if (fromA !== toA) {
          const removed = update.startState.sliceDoc(fromA, toA);
          if (removed.includes("\n")) crossed = true;
        }
        if (!crossed) return;
        const beforeText = update.startState.sliceDoc(0, fromA);
        const lineNumber = beforeText.split("\n").length;
        if (lineNumber > update.startState.doc.lines) return;
        const lineObj = update.startState.doc.line(lineNumber);
        const m = /^(\s*)(\d+)[.)]/.exec(lineObj.text);
        if (m) {
          const numStart = lineObj.from + m[1].length;
          const numEnd = numStart + m[2].length;
          if (fromA < numEnd && toA > numStart) touchesNumber = true;
        }
      });
      if (crossed && !touchesNumber) {
        renumberOrderedList(update.view);
      }
    })
  );

  if (options.showLineNumbers && !editable) {
    extensions.push(lineNumbers());
  }
  if (options.wordWrap) {
    extensions.push(EditorView.lineWrapping);
  }

  return EditorState.create({ doc: options.initialText, extensions });
}
