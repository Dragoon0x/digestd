import type { Item, RawItem } from "../core/types.ts";
import { itemId } from "../core/hash.ts";

export function normalize(raw: RawItem, now: number = Date.now()): Item {
  return {
    id: itemId(raw.url, raw.title),
    source: raw.source,
    sourceKind: raw.sourceKind,
    title: cleanText(raw.title),
    url: raw.url,
    author: raw.author ? cleanText(raw.author) : undefined,
    summary: raw.summary ? stripHtml(raw.summary) : undefined,
    content: raw.content ? stripHtml(raw.content) : undefined,
    publishedAt: raw.publishedAt ?? now,
    fetchedAt: now,
    score: raw.score,
    commentsUrl: raw.commentsUrl,
    commentsCount: raw.commentsCount,
    tags: raw.tags,
  };
}

export function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function stripHtml(html: string): string {
  // remove script and style blocks
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  // strip remaining tags
  s = s.replace(/<[^>]+>/g, " ");
  // decode common entities
  s = s.replace(/&[a-z#0-9]+;/gi, (m) => HTML_ENTITY_MAP[m.toLowerCase()] ?? m);
  // numeric entities
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  // collapse whitespace
  return s.replace(/\s+/g, " ").trim();
}
