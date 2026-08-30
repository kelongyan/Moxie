export type PerfTier = "standard" | "large" | "extreme";

export type FeatureKey =
  | "wordWrap"
  | "preview"
  | "highlight"
  | "fold"
  | "wordCount";

export type FeatureOverrides = Partial<Record<FeatureKey, boolean>>;

export const LARGE_BYTES = 20 * 1024 * 1024;
export const EXTREME_BYTES = 50 * 1024 * 1024;
export const LARGE_LINES = 250_000;

export function resolveProfile(byteLength: number, lineCount: number): PerfTier {
  if (byteLength > EXTREME_BYTES) return "extreme";
  if (byteLength > LARGE_BYTES || lineCount > LARGE_LINES) return "large";
  return "standard";
}

export function featureEnabled(
  key: FeatureKey,
  tier: PerfTier,
  overrides: FeatureOverrides
): boolean {
  if (overrides[key] !== undefined) return overrides[key]!;
  switch (key) {
    case "wordWrap":
    case "preview":
    case "fold":
    case "wordCount":
      return tier === "standard";
    case "highlight":
      return tier !== "extreme";
  }
}

const CJK_RE = /[\u2E80-\u9FFF\uF900-\uFAFF\u3400-\u4DBF\u3000-\u303F]/;
const WORD_CHAR_RE = /[A-Za-z0-9_]/;

export function countWordsRange(text: string, from: number, to: number): number {
  let count = 0;
  let inWord = false;
  for (let i = from; i < to; i++) {
    const ch = text[i];
    if (CJK_RE.test(ch)) {
      count++;
      inWord = false;
    } else if (WORD_CHAR_RE.test(ch)) {
      if (!inWord) {
        count++;
        inWord = true;
      }
    } else {
      inWord = false;
    }
  }
  return count;
}

export interface WordCountHandle {
  cancel: () => void;
  promise: Promise<number | null>;
}

const ASYNC_THRESHOLD = 100_000;
const CHUNK_SIZE = 262_144;

export function countWords(text: string): WordCountHandle {
  let cancelled = false;

  const promise = (async () => {
    if (text.length <= ASYNC_THRESHOLD) {
      return countWordsRange(text, 0, text.length);
    }
    let total = 0;
    let pos = 0;
    let carry = false;
    while (pos < text.length) {
      if (cancelled) return null;
      const end = Math.min(pos + CHUNK_SIZE, text.length);
      let inWord: boolean = carry;
      let count = 0;
      for (let i = pos; i < end; i++) {
        const ch = text[i];
        if (CJK_RE.test(ch)) {
          count++;
          inWord = false;
        } else if (WORD_CHAR_RE.test(ch)) {
          if (!inWord) {
            count++;
            inWord = true;
          }
        } else {
          inWord = false;
        }
      }
      total += count;
      carry = inWord;
      pos = end;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return cancelled ? null : total;
  })();

  return {
    cancel: () => {
      cancelled = true;
    },
    promise,
  };
}
