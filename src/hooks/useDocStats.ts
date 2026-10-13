import { useEffect, useRef, useState } from "react";
import { countWords, featureEnabled } from "../state/performance";
import { useDocuments } from "../state/documents";

/**
 * 当前文档的字数 / 段落 / 字符统计（状态栏展示，点击循环切换口径）。
 *
 * - 数据源是 store 里的 `doc.text`，它本身已由 registry 以 350ms 防抖回写，
 *   这里不再叠一层防抖；
 * - 沿用 countWords 的大文件分块异步（10 万字符以上不阻塞输入），文档切换或
 *   卸载时 cancel；
 * - 受 performance.ts 的 wordCount 特性开关门控：large / extreme 档自动关闭，
 *   可在状态栏「大文件模式」里手动覆盖——这是该开关唯一的消费者。
 */

export type StatMode = "words" | "paragraphs" | "characters";

export const STAT_LABELS: Record<StatMode, string> = {
  words: "字数",
  paragraphs: "段落",
  characters: "字符",
};

const MODE_ORDER: StatMode[] = ["words", "paragraphs", "characters"];

export function nextStatMode(mode: StatMode): StatMode {
  return MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
}

export interface DocStats {
  words: number;
  paragraphs: number;
  characters: number;
}

/** 段落：连续非空行算一段（空行分段，与书写面视觉一致） */
export function countParagraphs(text: string): number {
  let count = 0;
  let inParagraph = false;
  for (const line of text.split("\n")) {
    const blank = line.trim() === "";
    if (!blank && !inParagraph) count += 1;
    inParagraph = !blank;
  }
  return count;
}

/** 活动文档统计；wordCount 开关关闭（大文件档或手动覆盖）时返回 null */
export function useDocStats(): DocStats | null {
  const docId = useDocuments((s) => s.activeId);
  const text = useDocuments(
    (s) => s.documents.find((d) => d.id === s.activeId)?.text ?? ""
  );
  const tier = useDocuments(
    (s) => s.documents.find((d) => d.id === s.activeId)?.perfTier ?? "standard"
  );
  const overrides = useDocuments(
    (s) => s.documents.find((d) => d.id === s.activeId)?.featureOverrides
  );
  const [stats, setStats] = useState<DocStats | null>(null);
  const handleRef = useRef<{ cancel: () => void } | null>(null);

  const enabled = featureEnabled("wordCount", tier, overrides ?? {});

  useEffect(() => {
    handleRef.current?.cancel();
    handleRef.current = null;

    if (!docId || !enabled) {
      setStats(null);
      return;
    }

    let disposed = false;
    const handle = countWords(text);
    handleRef.current = handle;
    void handle.promise.then((words) => {
      if (disposed || words === null) return;
      setStats({
        words,
        paragraphs: countParagraphs(text),
        characters: text.length,
      });
    });

    return () => {
      disposed = true;
      handle.cancel();
      handleRef.current = null;
    };
  }, [docId, text, enabled]);

  return stats;
}
