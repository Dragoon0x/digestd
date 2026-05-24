import type { Item } from "../core/types.ts";

export interface DedupeOptions {
  // similarity threshold for near-dup titles (0-1).
  // higher = stricter. default 0.75 (word jaccard space).
  titleThreshold?: number;
}

export function dedupe(items: Item[], options: DedupeOptions = {}): Item[] {
  const threshold = options.titleThreshold ?? 0.75;

  // step 1: dedupe by id (same normalized url).
  // keep the one with the highest score, or the earliest if tied.
  const byId = new Map<string, Item>();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }
    if (chooseBetter(item, existing) === item) {
      byId.set(item.id, item);
    }
  }

  // step 2: dedupe by near-identical title.
  // simple bigram jaccard. cheap, no deps, good enough for v1.
  const result: Item[] = [];
  const sortedByScore = [...byId.values()].sort((a, b) => {
    return (b.score ?? 0) - (a.score ?? 0);
  });

  for (const item of sortedByScore) {
    const normalizedTitle = normalizeTitle(item.title);
    if (!normalizedTitle) continue;

    const isDup = result.some((kept) => {
      const sim = jaccardBigrams(normalizedTitle, normalizeTitle(kept.title));
      return sim >= threshold;
    });

    if (!isDup) result.push(item);
  }

  return result;
}

function chooseBetter(a: Item, b: Item): Item {
  const aScore = a.score ?? 0;
  const bScore = b.score ?? 0;
  if (aScore !== bScore) return aScore > bScore ? a : b;
  // tie: prefer earlier publishedAt (the original post)
  if (a.publishedAt !== b.publishedAt) {
    return a.publishedAt < b.publishedAt ? a : b;
  }
  return a;
}

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// word-level jaccard with a stop-word filter.
// for short, lossy strings like news titles this beats character n-grams
// and word bigrams. word order doesn't matter for "same story" detection.
export function jaccardBigrams(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aSet = tokens(a);
  const bSet = tokens(b);
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let intersection = 0;
  for (const t of aSet) if (bSet.has(t)) intersection++;
  const union = aSet.size + bSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "by",
  "from",
  "as",
  "be",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
]);

function tokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.split(" ")) {
    if (w.length < 2) continue;
    if (STOPWORDS.has(w)) continue;
    out.add(w);
  }
  return out;
}
