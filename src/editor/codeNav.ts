import { EditorView } from "@codemirror/view";
import { normalizeFenceLanguage } from "./languages";

/**
 * 代码块语言标注编辑：点击卡右上角语言标签 → 标签原位浮出一行纯输入框（无候选列表），
 * Enter / 失焦 / Tab 提交，Esc 取消。输入会经 normalizeFenceLanguage 归一
 * （大小写不敏感、别名与常见写法对齐规范 key），清空即移除语言标注。
 *
 * 输入框挂在 document.body 上（fixed 定位覆盖标签原位）：CodeMirror 的行装饰会随选区
 * 变化重建 widget，嵌在 widget 里的输入框会被重渲染打断，挂 body 则不受影响。
 */

type Session = {
  el: HTMLInputElement;
  done: (value: string | null) => void;
};

let session: Session | null = null;

function endSession(value: string | null): void {
  if (!session) return;
  const current = session;
  session = null;
  // 让输入框淡出收拢后再摘除（动画期间 pointer-events 已关，不挡后续操作）
  current.el.classList.remove("is-open");
  current.el.classList.add("is-closing");
  window.setTimeout(() => current.el.remove(), 200);
  current.done(value);
}

/** 关闭（取消）正在进行的语言输入，用于 Esc / 视图切换等场合 */
export function closeLangInput(): void {
  endSession(null);
}

/** 把 fence 行上的语言标注替换为 key（key 为空即移除标注） */
function writeLanguage(view: EditorView, lineNumber: number, key: string): void {
  const doc = view.state.doc;
  if (lineNumber > doc.lines) return;
  const line = doc.line(lineNumber);
  const match = /^(\s*(?:`{3,}|~{3,}))( ?)(\S*)/.exec(line.text);
  if (!match) return;
  const from = line.from + match[1].length + match[2].length;
  view.dispatch({
    changes: { from, to: from + match[3].length, insert: key },
    // 光标留在 fence 行上：语言标注保持可见，可继续编辑
    selection: { anchor: line.to },
    userEvent: "input",
  });
}

document.addEventListener(
  "mousedown",
  (e) => {
    // 点击输入框之外：按当前内容提交（值未变则等同无操作）
    if (session && !session.el.contains(e.target as Node)) endSession(session.el.value);
  },
  true
);

export function openLangInput(view: EditorView, anchor: HTMLElement, current: string): void {
  closeLangInput();
  const lineNumber = view.state.doc.lineAt(view.posAtDOM(anchor)).number;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "md-code-lang-input";
  input.value = current;
  input.placeholder = "语言";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("aria-label", "代码块语言");

  const finish = (value: string | null) => {
    // 视图可能已被关闭（标签关掉/窗口切走）：DOM 已摘除就只收摊，不再写回文档
    if (view.dom.isConnected) {
      if (value !== null) {
        const next = normalizeFenceLanguage(value);
        if (next !== current) writeLanguage(view, lineNumber, next);
      }
      view.focus();
    }
  };

  input.addEventListener("mousedown", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      endSession(input.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      endSession(null);
    }
  });
  input.addEventListener("blur", () => endSession(input.value));

  document.body.appendChild(input);

  // 与标签同位：右缘对齐、垂直居中，尺寸由 CSS 定（控件标准档），此处只算坐标
  const anchorRect = anchor.getBoundingClientRect();
  const own = input.getBoundingClientRect();
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  input.style.left = `${clamp(
    Math.round(anchorRect.right - own.width),
    8,
    Math.max(8, window.innerWidth - own.width - 8)
  )}px`;
  input.style.top = `${clamp(
    Math.round(anchorRect.top + anchorRect.height / 2 - own.height / 2),
    8,
    Math.max(8, window.innerHeight - own.height - 8)
  )}px`;
  input.classList.add("is-open");

  session = { el: input, done: finish };
  input.focus();
  input.select();
}
