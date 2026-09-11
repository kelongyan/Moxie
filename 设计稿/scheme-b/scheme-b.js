/* ============================================================
 * 方案 B · 双行卡片 —— 渲染
 * 依赖：shared/mock-data.js、shared/preview.js
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
    warn: '<svg class="warn" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    settings: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  };

  /** 双行卡片：副标题按区块语义分流（分组→目录名，最近→相对时间） */
  function fileRow(entry, variant, groupId) {
    const name = D.baseName(entry.path);
    const missing = Boolean(entry.missing);
    const open = D.DATA.activePath === entry.path;
    const sub = variant === "recent"
      ? D.relativeTime(entry.lastOpenedMs) + (missing ? " · 文件已移动或删除" : "")
      : D.dirName(entry.path);
    const classes = ["file-row", "draggable-file", open ? "is-open" : "", missing ? "is-missing" : ""]
      .filter(Boolean).join(" ");

    return (
      '<div class="' + classes + '" draggable="' + (missing ? "false" : "true") + '"' +
      ' data-path="' + entry.path + '"' + (groupId ? ' data-group="' + groupId + '"' : "") + ">" +
      '<span class="row-indicator"></span>' +
      '<span class="row-icon">' + (missing ? ICON.warn : D.iconSvg(entry.path)) + "</span>" +
      '<span class="row-text">' +
      '<span class="row-title" title="' + entry.path.replace(/"/g, "&quot;") + '">' + name + "</span>" +
      '<span class="row-sub">' + sub + "</span>" +
      "</span>" +
      '<span class="row-end"><button class="row-action row-action-remove" title="移除">' + ICON.x + "</button></span>" +
      "</div>"
    );
  }

  function render() {
    const d = D.DATA;
    let html = "";

    html += '<div class="section-header"><span class="section-chevron expanded">' + ICON.chevron + '</span>' +
      '<span class="section-title">分组</span><span class="section-count">' + d.groups.length + "</span></div>";
    for (const group of d.groups) {
      html += '<div class="group-row' + (group.expanded ? " expanded" : "") + '" data-group="' + group.id + '">' +
        '<span class="group-chevron">' + ICON.chevron + "</span>" +
        '<span class="group-icon">' + (group.expanded ? ICON.folderOpen : ICON.folder) + "</span>" +
        '<span class="group-name">' + group.name + "</span>" +
        '<span class="group-count">' + group.paths.length + "</span></div>";
      if (group.expanded) {
        html += '<div class="group-children">' +
          group.paths.map((p) => fileRow({ path: p }, "group", group.id)).join("") +
          "</div>";
      }
    }

    html += '<div class="section-header"><span class="section-chevron expanded">' + ICON.chevron + '</span>' +
      '<span class="section-title">最近文件</span><span class="section-count">' + d.recent.length + '</span>' +
      '<span class="spacer"></span>' +
      '<button class="section-trash" title="清除最近文件">' + ICON.trash + "</button></div>";
    html += d.recent.map((entry) => fileRow(entry, "recent")).join("");

    html += '<div class="sidebar-footer"><button class="sidebar-settings">' + ICON.settings + "<span>设置</span></button></div>";

    sidebar.innerHTML = html;
  }

  render();
  window.MoxiePreview.initCommon(sidebar);
})();
