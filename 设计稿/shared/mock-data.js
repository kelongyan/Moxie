/* ============================================================
 * Moxie 侧栏设计稿 · 共享模拟数据与工具函数
 * 职责：一组贴近真实使用的数据（分组 / 最近文件 / 激活态 / 缺失态）
 *       + 文件类型图标 + 相对时间格式化。
 *       数据是唯一真相源，四个方案共用同一份（保证对比公平）。
 * ============================================================ */

/* 全局命名空间，避免污染 window */
window.MoxieDesign = (function () {
  "use strict";

  const NOW = Date.now();
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  /** 模拟数据：与真实侧栏结构一致（groups / recent / activePath） */
  const DATA = {
    activePath: "D:\\工作\\项目提案.md",
    groups: [
      {
        id: "g-work",
        name: "工作文档",
        expanded: true,
        paths: [
          "D:\\工作\\项目提案.md",
          "D:\\工作\\会议纪要-0911.md",
          "D:\\工作\\接口契约.md",
        ],
      },
      {
        id: "g-study",
        name: "学习笔记",
        expanded: false,
        paths: [
          "D:\\笔记\\Rust 所有权与生命周期.md",
          "D:\\笔记\\Tauri 2 IPC 笔记.md",
          "D:\\笔记\\CSS 容器查询.md",
        ],
      },
    ],
    recent: [
      { path: "D:\\工作\\项目提案.md", lastOpenedMs: NOW - 2 * MIN },
      { path: "F:\\Moxie\\src\\state\\sidebar.ts", lastOpenedMs: NOW - 18 * MIN },
      { path: "D:\\工作\\会议纪要-0911.md", lastOpenedMs: NOW - 55 * MIN },
      { path: "C:\\Users\\龙哥\\Documents\\毕业论文-终稿v7.md", lastOpenedMs: NOW - 3 * HOUR },
      { path: "D:\\笔记\\Rust 所有权与生命周期.md", lastOpenedMs: NOW - 26 * HOUR },
      { path: "F:\\Moxie\\docs\\TizuMark渲染复刻方案.md", lastOpenedMs: NOW - 2 * DAY },
      { path: "D:\\脚本\\cleanup.py", lastOpenedMs: NOW - 2 * DAY - 5 * HOUR, missing: true },
      { path: "D:\\日志\\2026-09-08.md", lastOpenedMs: NOW - 6 * DAY },
      { path: "E:\\资料\\API接口清单.json", lastOpenedMs: NOW - 30 * DAY },
    ],
  };

  /** 取文件基本名（兼容 \ 与 /） */
  function baseName(path) {
    const normalized = path.replace(/\\/g, "/");
    const idx = normalized.lastIndexOf("/");
    return idx >= 0 ? normalized.slice(idx + 1) : path;
  }

  /** 取父目录名（真实软件副标题的口径） */
  function dirName(path) {
    const normalized = path.replace(/\\/g, "/");
    const idx = normalized.lastIndexOf("/");
    if (idx <= 0) return "";
    const dir = normalized.slice(0, idx);
    const slash = dir.lastIndexOf("/");
    return slash >= 0 ? dir.slice(slash + 1) : dir;
  }

  /** 从扩展名推断语言键（与真实软件 language.ts 口径一致） */
  function languageKeyOf(path) {
    const name = baseName(path).toLowerCase();
    const ext = name.includes(".") ? name.split(".").pop() : "";
    switch (ext) {
      case "md":
      case "markdown":
        return "md";
      case "ts":
      case "tsx":
        return "ts";
      case "js":
      case "jsx":
      case "mjs":
        return "js";
      case "json":
        return "json";
      case "css":
        return "css";
      case "py":
        return "py";
      case "html":
        return "html";
      default:
        return "txt";
    }
  }

  const LANG_LABEL = {
    md: "M", ts: "TS", js: "JS", json: "{}", css: "C", py: "Py", html: "<>", txt: "T",
  };

  /**
   * 文件类型图标：统一的文档轮廓 + 右下角语言角标（灰阶，克制）。
   * 返回 SVG 字符串；color 由 CSS currentColor 控制。
   */
  function iconSvg(path) {
    const key = languageKeyOf(path);
    const label = LANG_LABEL[key] || "T";
    const badge = key === "json" ? "7.2" : "8.6";
    return (
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>' +
      '<path d="M14 2v6h6"/>' +
      '<text x="12.2" y="19.4" text-anchor="middle" font-size="' + badge + '"' +
      ' fill="currentColor" stroke="none" font-family="inherit" font-weight="600">' + label + "</text>" +
      "</svg>"
    );
  }

  /** 相对时间（阶段 2 的展示口径） */
  function relativeTime(ms) {
    const diff = Date.now() - ms;
    if (diff < MIN) return "刚刚";
    if (diff < HOUR) return Math.floor(diff / MIN) + " 分钟前";
    if (diff < DAY) return Math.floor(diff / HOUR) + " 小时前";
    if (diff < 7 * DAY) return Math.floor(diff / DAY) + " 天前";
    const d = new Date(ms);
    const now = new Date();
    if (d.getFullYear() === now.getFullYear()) {
      return d.getMonth() + 1 + "月" + d.getDate() + "日";
    }
    return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
  }

  /** 相对时间的分组键（方案 D 的时间记忆流） */
  function timeBucket(ms) {
    const diff = Date.now() - ms;
    if (diff < DAY) return { key: "today", label: "今天" };
    if (diff < 2 * DAY) return { key: "yesterday", label: "昨天" };
    if (diff < 7 * DAY) return { key: "week", label: "本周" };
    return { key: "earlier", label: "更早" };
  }

  return {
    DATA,
    baseName,
    dirName,
    languageKeyOf,
    iconSvg,
    relativeTime,
    timeBucket,
  };
})();
