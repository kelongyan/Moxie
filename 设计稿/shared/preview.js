/* ============================================================
 * Moxie 侧栏设计稿 · 公共交互
 * 职责：主题切换、行移除淡出、拖拽落点高亮。
 *       各方案 scheme-x.js 只实现自己的渲染与差异化行为。
 * ============================================================ */

window.MoxiePreview = (function () {
  "use strict";

  /** 主题切换：html[data-theme] + 分段控件激活态 */
  function initThemeToggle() {
    const buttons = document.querySelectorAll(".theme-toggle button");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const theme = btn.dataset.theme;
        document.documentElement.dataset.theme = theme;
        buttons.forEach((b) => b.classList.toggle("active", b === btn));
      });
    });
  }

  /**
   * 行移除淡出：行尾 .row-action-remove 点击 → 整行折叠消失。
   * 仅设计稿演示效果，真实软件中直接从 store 移除并持久化。
   */
  function bindRemoveFade(root) {
    root.addEventListener("click", (e) => {
      const btn = e.target.closest(".row-action-remove");
      if (!btn) return;
      const row = btn.closest(".sidebar-row, .file-row");
      if (!row) return;
      row.style.transition = "height 140ms ease, opacity 140ms ease";
      row.style.height = row.offsetHeight + "px";
      requestAnimationFrame(() => {
        row.style.opacity = "0";
        row.style.height = "0";
        row.style.overflow = "hidden";
        setTimeout(() => row.remove(), 160);
      });
    });
  }

  /**
   * 拖拽落点高亮：任何 draggable 行拖入 .group-row 时高亮。
   * drop 后仅演示（行不会被真的移动），真实软件里走 addToGroup。
   */
  function bindDragHighlight(root) {
    let dragged = null;
    root.addEventListener("dragstart", (e) => {
      const row = e.target.closest(".draggable-file");
      if (row) dragged = row;
    });
    root.addEventListener("dragend", () => {
      dragged = null;
      root.querySelectorAll(".group-row.drop-target").forEach((el) => {
        el.classList.remove("drop-target");
      });
    });
    root.querySelectorAll(".group-row").forEach((group) => {
      group.addEventListener("dragover", (e) => {
        if (!dragged) return;
        e.preventDefault();
        group.classList.add("drop-target");
      });
      group.addEventListener("dragleave", () => {
        group.classList.remove("drop-target");
      });
      group.addEventListener("drop", (e) => {
        e.preventDefault();
        group.classList.remove("drop-target");
        // 设计稿演示：被拖行短暂闪一下 accent 底示意"已入组"
        if (dragged) {
          dragged.style.background = "var(--lac-accent-soft)";
          setTimeout(() => (dragged.style.background = ""), 500);
        }
      });
    });
  }

  /** 一键初始化（主题 + 通用交互） */
  function initCommon(root) {
    initThemeToggle();
    bindRemoveFade(root);
    bindDragHighlight(root);
  }

  return { initCommon };
})();
