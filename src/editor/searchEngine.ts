export interface FindOptions {
  caseSensitive: boolean;
  interpretEscapes: boolean;
  /** 按正则表达式解释查找内容 */
  useRegex?: boolean;
  /** 全词匹配（正则模式下给表达式补词边界） */
  wholeWord?: boolean;
}

export interface MatchRange {
  from: number;
  to: number;
}

export interface MatchResult {
  ranges: MatchRange[];
  /** 正则语法错误等用户输入问题；非空时应提示并放弃本次查找 */
  error: string | null;
}

export function interpretEscapes(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const next = input[i + 1];
    if (next === undefined) {
      out += "\\";
      continue;
    }
    switch (next) {
      case "n":
        out += "\n";
        i++;
        break;
      case "r":
        out += "\r";
        i++;
        break;
      case "t":
        out += "\t";
        i++;
        break;
      case "s":
        out += " ";
        i++;
        break;
      case "0":
        out += "\0";
        i++;
        break;
      case "\\":
        out += "\\";
        i++;
        break;
      default:
        out += "\\";
    }
  }
  return out;
}

export function prepareQuery(raw: string, options: FindOptions): string {
  return options.interpretEscapes ? interpretEscapes(raw) : raw;
}

const MAX_MATCHES = 10000;

function escapeLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rangesFromRegex(re: RegExp, text: string): MatchRange[] {
  const ranges: MatchRange[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push({ from: m.index, to: m.index + m[0].length });
    if (ranges.length >= MAX_MATCHES) break;
    // 零宽匹配（如 a*）手动前进，避免死循环
    re.lastIndex = Math.max(re.lastIndex, m.index + 1);
  }
  return ranges;
}

/**
 * 按选项计算全部匹配区间。
 * useRegex：用户表达式（语法错误走 result.error）；
 * wholeWord：字面量转义或用户表达式外包 \w 边界；
 * 其余为大小写不敏感的字面量扫描（快速路径）。
 */
export function findMatchRanges(
  text: string,
  prepared: string,
  options: FindOptions
): MatchResult {
  if (!prepared) return { ranges: [], error: null };
  try {
    if (options.useRegex || options.wholeWord) {
      let source = options.useRegex ? prepared : escapeLiteral(prepared);
      if (options.wholeWord) source = `(?<![\\w])(?:${source})(?![\\w])`;
      const re = new RegExp(source, options.caseSensitive ? "g" : "gi");
      return { ranges: rangesFromRegex(re, text), error: null };
    }
  } catch (e) {
    return { ranges: [], error: `正则表达式无效:${String(e)}` };
  }
  const ranges: MatchRange[] = [];
  const haystack = options.caseSensitive ? text : text.toLowerCase();
  const needle = options.caseSensitive ? prepared : prepared.toLowerCase();
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    ranges.push({ from: index, to: index + needle.length });
    if (ranges.length >= MAX_MATCHES) break;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return { ranges, error: null };
}

const CACHE_LIMIT = 4;

interface MatchCacheEntry {
  revision: number;
  query: string;
  options: FindOptions;
  result: MatchResult;
}

const cache = new Map<string, MatchCacheEntry>();

function sameOptions(a: FindOptions, b: FindOptions): boolean {
  return (
    a.caseSensitive === b.caseSensitive &&
    a.interpretEscapes === b.interpretEscapes &&
    (a.useRegex ?? false) === (b.useRegex ?? false) &&
    (a.wholeWord ?? false) === (b.wholeWord ?? false)
  );
}

export function cachedMatches(
  docId: string,
  revision: number,
  text: string,
  query: string,
  options: FindOptions
): MatchResult {
  const key = docId;
  const existing = cache.get(key);
  if (
    existing &&
    existing.revision === revision &&
    existing.query === query &&
    sameOptions(existing.options, options)
  ) {
    cache.delete(key);
    cache.set(key, existing);
    return existing.result;
  }
  const prepared = prepareQuery(query, options);
  const result = findMatchRanges(text, prepared, options);
  const entry: MatchCacheEntry = { revision, query, options, result };
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return result;
}

export function invalidateMatchCache(docId: string) {
  cache.delete(docId);
}

/** 当前选区是否命中查询：字面量比对，正则则做完整匹配测试 */
export function selectionMatchesQuery(
  selected: string,
  prepared: string,
  options: FindOptions
): boolean {
  if (!prepared) return false;
  if (options.useRegex) {
    try {
      const re = new RegExp(
        options.wholeWord ? `(?<![\\w])(?:${prepared})(?![\\w])` : prepared,
        options.caseSensitive ? "" : "i"
      );
      const m = re.exec(selected);
      return m !== null && m[0] === selected;
    } catch {
      return false;
    }
  }
  if (options.caseSensitive) return selected === prepared;
  return selected.toLowerCase() === prepared.toLowerCase();
}
