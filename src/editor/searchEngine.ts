export interface FindOptions {
  caseSensitive: boolean;
  interpretEscapes: boolean;
}

export interface MatchCacheEntry {
  revision: number;
  query: string;
  options: FindOptions;
  positions: number[];
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

export function findMatches(
  text: string,
  query: string,
  caseSensitive: boolean
): number[] {
  const positions: number[] = [];
  if (!query) return positions;
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    positions.push(index);
    index = haystack.indexOf(needle, index + needle.length);
  }
  return positions;
}

const CACHE_LIMIT = 4;
const cache = new Map<string, MatchCacheEntry>();

export function cachedMatches(
  docId: string,
  revision: number,
  text: string,
  query: string,
  options: FindOptions
): number[] {
  const key = docId;
  const existing = cache.get(key);
  if (
    existing &&
    existing.revision === revision &&
    existing.query === query &&
    existing.options.caseSensitive === options.caseSensitive &&
    existing.options.interpretEscapes === options.interpretEscapes
  ) {
    cache.delete(key);
    cache.set(key, existing);
    return existing.positions;
  }
  const prepared = prepareQuery(query, options);
  const positions = findMatches(text, prepared, options.caseSensitive);
  const entry: MatchCacheEntry = { revision, query, options, positions };
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return positions;
}

export function invalidateMatchCache(docId: string) {
  cache.delete(docId);
}

export function selectionEqualsQuery(
  selected: string,
  query: string,
  caseSensitive: boolean
): boolean {
  if (caseSensitive) return selected === query;
  return selected.toLowerCase() === query.toLowerCase();
}
