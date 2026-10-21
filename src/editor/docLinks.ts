import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { frontmatterRange } from "./livePreview";
import { headingIdsOf, slugify } from "../preview/markdownCore";

/**
 * 书写面锚点跳转：`[标题](#锚点)` 的解析（纯函数，便于单测）。
 *
 * 锚点 id 必须与导出侧一致（`markdownCore` 的 `moxie_heading_ids` 规则：
 * slugify + 重复标题 `-2`/`-3` 去重），所以这里复用 `headingIdsOf`，
 * 而不是另写一套。ATX（#）与 Setext（=== / ---）标题都参与。
 */

export interface HeadingAnchor {
  /** 标题所在行号（1 基） */
  line: number;
  /** 导出侧同款 id */
  id: string;
  /** 标题原文（去标记） */
  text: string;
}

const ATX_RE = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const SETEXT_UNDERLINE_RE = /^[ \t]*(?:=+|-+)[ \t]*$/;
/** lezer-markdown 的标题节点名（ATX 1~6 + Setext 1~2） */
const HEADING_NODE_RE = /^(?:ATX|Setext)Heading[1-6]$/;

/**
 * 收集文档中的全部标题（顺序与导出侧一致）。
 * 跳过 YAML frontmatter：lezer 不认识它，会把 `title: x` + 收尾 `---`
 * 解析成 Setext 标题，而导出侧 `splitFrontmatter` 会先剥离——不跳过就会
 * 让书写面的 id 序列整体错位。
 */
export function collectHeadingAnchors(state: EditorState): HeadingAnchor[] {
  const doc = state.doc;
  const fm = frontmatterRange(doc);
  const found: { line: number; text: string }[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (!HEADING_NODE_RE.test(node.name)) return;
      if (fm && node.from >= fm.from && node.to <= fm.to) return;
      const startLine = doc.lineAt(node.from);
      // Setext 标题跨"正文 + 下划线"两行，取首行正文；ATX 本身就是单行
      found.push({
        line: startLine.number,
        text: cleanHeadingText(doc.sliceString(startLine.from, startLine.to)),
      });
    },
  });
  const ids = headingIdsOf(found.map((h) => h.text));
  return found.map((h, i) => ({ line: h.line, id: ids[i], text: h.text }));
}

/**
 * 纯文本版标题收集（视图尚未创建时的兜底：打开文档后立刻带锚点跳转）。
 * 逐行扫描，规则与 `collectHeadingAnchors` 的 ATX 部分一致；Setext 也支持
 * （正文行 + 下一行全 `=` / `-`）。
 */
export function headingAnchorsFromText(text: string): HeadingAnchor[] {
  const lines = text.split("\n");
  const found: { line: number; text: string }[] = [];
  // frontmatter 整块跳过（与 collectHeadingAnchors / 导出侧一致）
  let start = 0;
  if (lines.length > 1 && /^﻿?---[ \t]*$/.test(lines[0])) {
    for (let i = 1; i < lines.length; i++) {
      if (!/^(?:---|\.\.\.)[ \t]*$/.test(lines[i])) continue;
      // 空头 `---\n---`：整块视为空 frontmatter，两行都跳过
      // （否则首行 `---` 会被当成下一行的 Setext 下划线）
      start = i > 1 ? i + 1 : 2;
      break;
    }
  }
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const atx = ATX_RE.exec(raw);
    if (atx) {
      found.push({ line: i + 1, text: atx[2].trim() });
      continue;
    }
    const next = lines[i + 1];
    if (
      next !== undefined &&
      SETEXT_UNDERLINE_RE.test(next) &&
      raw.trim() !== ""
    ) {
      found.push({ line: i + 1, text: raw.trim() });
      i += 1; // 跳过下划线行
    }
  }
  const ids = headingIdsOf(found.map((h) => h.text));
  return found.map((h, i) => ({ line: h.line, id: ids[i], text: h.text }));
}

/** 去掉标题标记（ATX 的 # 前缀、Setext 无标记），得到用于 slug 的纯文本 */
export function cleanHeadingText(lineText: string): string {
  const atx = ATX_RE.exec(lineText);
  if (atx) return atx[2].trim();
  return lineText.trim();
}

/** 安全解码：手写的 `#100%` 之类非法百分号编码不能让跳转崩掉 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 按锚点定位标题行；未命中返回 null。支持导出侧去重后缀（`标题-2`） */
export function findAnchorLine(
  anchors: HeadingAnchor[],
  anchor: string
): HeadingAnchor | null {
  const raw = safeDecode(anchor).replace(/^#/, "").trim();
  if (!raw) return null;
  const direct = anchors.find((a) => a.id === raw);
  if (direct) return direct;
  // 用户手写的锚点可能没做 slugify（如中文标题直接写 #标题）
  const slug = slugify(raw);
  return anchors.find((a) => a.id === slug) ?? null;
}

/** 判断链接目标是否为文档内锚点（#xxx，排除空 # 与协议） */
export function isAnchorHref(href: string): boolean {
  return /^#[^#]/.test(href.trim());
}

/** 判断链接目标是否为相对路径的本地文件（非 http(s)/mailto/协议相对） */
export function isRelativeDocHref(href: string): boolean {
  const value = href.trim();
  if (!value || value.startsWith("#")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false; // http: / mailto: / file: …
  if (value.startsWith("//")) return false;
  return true;
}

/** 相对路径 → 绝对路径（Windows 反斜杠），与项目其余路径处理保持一致 */
export function resolveRelativeDocPath(
  baseDir: string | null,
  href: string
): string | null {
  if (!baseDir) return null;
  // 去掉查询串与锚点，只保留路径部分
  const pathPart = safeDecode(href.trim().replace(/[?#].*$/, ""));
  if (!pathPart) return null;
  const sep = baseDir.includes("\\") ? "\\" : "/";
  const segments = baseDir.split(/[\\/]+/).filter(Boolean);
  // 根保护：盘符（`C:`）与 UNC 前缀（`\\server\share`）不能被 `..` 弹掉
  const isDrive = /^[A-Za-z]:$/.test(segments[0] ?? "");
  const floor = isDrive ? 1 : 0;
  for (const part of pathPart.split(/[\\/]+/)) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (segments.length > floor) segments.pop();
    } else {
      segments.push(part);
    }
  }
  return segments.join(sep);
}

/** 从链接目标里取出锚点部分（`a.md#x` → `x`；无锚点返回 null） */
export function anchorOfHref(href: string): string | null {
  const idx = href.indexOf("#");
  if (idx < 0) return null;
  const anchor = href.slice(idx + 1).trim();
  return anchor || null;
}
