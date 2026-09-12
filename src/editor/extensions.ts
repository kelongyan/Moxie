import { EditorState, Extension, Prec } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
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
} from "@codemirror/language";
import { highlightExtension } from "./highlightTheme";
import { markdownExtensions } from "./languages";
import { livePreview, ImageSrcResolver } from "./livePreview";
import {
  markdownEnterHandler,
  renumberOrderedList,
} from "./listContinuation";
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
