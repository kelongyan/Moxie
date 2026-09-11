/* ============================================================
 * 方案 A · 单行索引 —— 渲染与方案内交互
 * 依赖：shared/mock-data.js（MoxieDesign）、shared/preview.js
 * ============================================================ */

(function () {
  "use strict";

  const D = window.MoxieDesign;
  const sidebar = document.getElementById("sidebar");

  const ICON = {
    chevron: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    folder: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    folderOpen: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>',
    trash: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    x: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    locate: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-3.5-3.5"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>',
    warn: '<svg class="warn" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    settings: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    history: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
  };

  /** 生成文件行 HTML（方案 A：单行 + 行尾状态） */
  function fileRow(entry, variant, groupId) {
    const name = D.baseName(entry.path);
    const missing = Boolean(entry.missing);
    const open = D.DATA.activePath === entry.path;
    const classes = [
      "file-row",
      "draggable-file",
      open ? "is-open" : "",
      missing ? "is-missing" : "",
    ].filter(Boolean).join(" ");

    // 行尾：missing → 重定位；正常 → 时间（hover 让位给 X）
    const end = missing
      ? '<span class="row-end"><button class="row-action row-locate" title="重新定位">' + ICON.locate + "</button></span>"
      : '<span class="row-end">' +
        (variant === "recent" ? '<span class="row-time">' + D.relativeTime(entry.lastOpenedMs) + "</span>" : "") +
        '<button class="row-action row-action-remove" title="' + (variant === "recent" ? "移除" : "移出分组") + '">' + ICON.x + "</button>" +
        "</span>";

    return (
      '<div class="' + classes + '" draggable="' + (missing ? "false" : "true") + '"' +
      ' data-path="' + entry.path + '" data-variant="' + variant + '"' +
      (groupId ? ' data-group="' + groupId + '"' : "") + ">" +
      '<span class="row-indicator"></span>' +
      '<span class="row-icon">' + (missing ? ICON.warn : D.iconSvg(entry.path)) + "</span>" +
      '<span class="row-name" title="' + entry.path.replace(/"/g, "&quot;") + '">' + name + "</span>" +
      end +
      "</div>"
    );
  }

  /** 渲染整个侧栏 */
  function render() {
    const d = D.DATA;
    const recentCount = d.recent.length;

    let html = "";

    // 分组区块
    html += '<div class="section-header"><span class="section-chevron expanded">' + ICON.chevron + '</span>' +
      '<span class="section-title">分组</span><span class="section-count">' + d.groups.length + "</span></div>";
    for (const group of d.groups) {
      html += '<div class="group-row' + (group.expanded ? " expanded" : "") + '" data-group="' + group.id + '">' +
        '<span class="group-chevron">' + ICON.chevron + "</span>" +
        '<span class="group-icon">' + (group.expanded ? ICON.folderOpen : ICON.folder) + "</span>" +
        '<span class="group-name">' + group.name + "</span>" +
        '<span class="group-count">' + group.paths.length + "</span></div>";
      if (group.expanded) {
        html += '<div class="group-children">';
        html += group.paths.length
          ? group.paths.map((p) => fileRow({ path: p }, "group", group.id)).join("")
          : '<div class="group-empty">拖入文件，或右键分组添加</div>';
        html += "</div>";
      }
    }

    // 最近文件区块
    html += '<div class="section-header"><span class="section-chevron expanded">' + ICON.chevron + '</span>' +
      '<span class="section-title">最近文件</span><span class="section-count">' + recentCount + '</span>' +
      '<span class="spacer"></span>' +
      '<button class="section-trash" title="清除最近文件">' + ICON.trash + "</button></div>";
    if (recentCount === 0) {
      html += '<div class="section-empty"><span>暂无最近文件</span><button class="section-empty-button">打开文件…</button></div>';
    } else {
      html += d.recent.map((entry) => fileRow(entry, "recent")).join("");
    }

    // 底部
    html += '<div class="sidebar-footer"><button class="sidebar-settings">' + ICON.settings + "<span>设置</span></button></div>";

    sidebar.innerHTML = html;
  }

  render();
  window.MoxiePreview.initCommon(sidebar);

  /* tooltip：行悬停 600ms 显示完整路径（模拟真实软件的 Tooltip 组件） */
  let tipTimer = null;
  let tipEl = null;
  sidebar.addEventListener("mouseover", (e) => {
    const row = e.target.closest(".file-row");
    if (!row || tipEl) return;
    tipTimer = setTimeout(() => {
      tipEl = document.createElement("div");
      tipEl.className = "row-tip";
      tipEl.textContent = row.dataset.path;
      document.body.appendChild(tipEl);
      const rect = row.getBoundingClientRect();
      tipEl.style.left = Math.max(8, rect.left - 120) + "px";
      tipEl.style.top = rect.bottom + 6 + "px";
    }, 600);
  });
  sidebar.addEventListener("mouseout", (e) => {
    if (!e.target.closest(".file-row")) return;
    clearTimeout(tipTimer);
    if (tipEl) {
      tipEl.remove();
      tipEl = null;
    }
  });
})();
