import { EditorView } from "@codemirror/view";
import { FENCE_LANGUAGE_OPTIONS } from "./languages";

/**
 * 代码块语言切换浮层（墨记 codePicker 同体验的精简版）：
 * 搜索框 + 过滤列表（key/label 子串匹配），↑↓ 选择、Enter 确认、Esc 关闭，
 * 当前语言打勾；无匹配时提供「使用 "xxx"」自定义项——任意语言可写回 info string。
 */

let pickerEl: HTMLElement | null = null;

export function closeLangPicker(): void {
  pickerEl?.remove();
  pickerEl = null;
}

document.addEventListener(
  "mousedown",
  (e) => {
    if (pickerEl && !pickerEl.contains(e.target as Node)) closeLangPicker();
  },
  true
);

export function openLangPicker(
  view: EditorView,
  anchor: HTMLElement,
  current: string
): void {
  closeLangPicker();
  const pop = document.createElement("div");
  pop.className = "md-lang-picker";
  pop.setAttribute("role", "menu");

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "搜索语言…";
  input.spellcheck = false;

  const list = document.createElement("div");
  list.className = "md-lang-picker-list";

  const commit = (key: string) => {
    closeLangPicker();
    const pos = view.posAtDOM(anchor);
    const line = view.state.doc.lineAt(pos);
    const m = /^(\s*(?:`{3,}|~{3,}))( ?)(\S*)/.exec(line.text);
    if (!m) return;
    const from = line.from + m[1].length + m[2].length;
    view.dispatch({
      changes: { from, to: from + m[3].length, insert: key },
      // 光标留在 fence 行上：语言标注保持可见可继续编辑
      selection: { anchor: line.to },
      userEvent: "input",
    });
    view.focus();
  };

  let filtered = FENCE_LANGUAGE_OPTIONS;
  let highlight = 0;
  const render = () => {
    list.innerHTML = "";
    filtered.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = opt.label + (opt.key ? ` · ${opt.key}` : "");
      if (opt.key === current) btn.classList.add("current");
      if (i === highlight) btn.classList.add("highlighted");
      btn.addEventListener("mousedown", (e) => e.stopPropagation());
      btn.addEventListener("click", () => commit(opt.key));
      list.appendChild(btn);
    });
    if (filtered.length === 0 && input.value.trim()) {
      const custom = document.createElement("button");
      custom.type = "button";
      custom.textContent = `使用 "${input.value.trim()}"`;
      custom.addEventListener("mousedown", (e) => e.stopPropagation());
      custom.addEventListener("click", () => commit(input.value.trim()));
      list.appendChild(custom);
    }
    list
      .querySelector(".highlighted")
      ?.scrollIntoView({ block: "nearest" });
  };

  const applyFilter = () => {
    const q = input.value.trim().toLowerCase();
    filtered = FENCE_LANGUAGE_OPTIONS.filter(
      (o) => !q || o.key.includes(q) || o.label.toLowerCase().includes(q)
    );
    highlight = 0;
    render();
  };

  input.addEventListener("input", applyFilter);
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight = Math.min(highlight + 1, Math.max(0, filtered.length - 1));
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight = Math.max(0, highlight - 1);
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) commit(filtered[highlight].key);
      else if (input.value.trim()) commit(input.value.trim());
    } else if (e.key === "Escape") {
      closeLangPicker();
      view.focus();
    }
  });

  pop.appendChild(input);
  pop.appendChild(list);
  document.body.appendChild(pop);
  pickerEl = pop;
  const rect = anchor.getBoundingClientRect();
  pop.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 224))}px`;
  pop.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 300)}px`;
  input.focus();
  applyFilter();
}
