import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Source, SourceContext } from "./types.ts";
import { SourceError } from "./types.ts";
import type { RawItem, SourceKind } from "../core/types.ts";

export interface BookmarkSourceOptions {
  path: string;
  // override how source items appear. default "bookmarks".
  name?: string;
  // override sourceKind. default "custom" for generic bookmarks.
  // use "rss" if you want them rendered like feed items.
  kind?: SourceKind;
}

// minimal contract for a bookmark file: a json array of objects.
// recognized fields: title, url, text/content, author, createdAt (iso or ms),
// score, summary, source. unknown fields are ignored.
//
// also accepts a "tweets" wrapper since twitter export uses that.
interface BookmarkEntry {
  title?: string;
  url?: string;
  text?: string;
  content?: string;
  author?: string;
  username?: string;
  createdAt?: string | number;
  created_at?: string | number;
  score?: number;
  summary?: string;
  source?: string;
}

interface BookmarkFile {
  bookmarks?: BookmarkEntry[];
  tweets?: BookmarkEntry[];
  items?: BookmarkEntry[];
}

export class BookmarkSource implements Source {
  readonly id: string;
  private readonly path: string;
  private readonly name: string;
  private readonly kind: SourceKind;

  constructor(options: BookmarkSourceOptions) {
    this.path = resolve(options.path);
    this.name = options.name ?? "bookmarks";
    this.kind = options.kind ?? "custom";
    this.id = `bookmark:${this.path}`;
  }

  async fetch(ctx: SourceContext): Promise<RawItem[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf-8");
    } catch (err) {
      throw new SourceError(`cannot read ${this.path}`, this.id, err);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new SourceError("json parse failed", this.id, err);
    }

    const entries = extractEntries(parsed);
    return this.normalize(entries, ctx);
  }

  normalize(entries: BookmarkEntry[], ctx: SourceContext): RawItem[] {
    const out: RawItem[] = [];
    for (const e of entries) {
      const url = e.url;
      if (!url) continue;

      const title = e.title ?? truncate(e.text ?? e.content ?? "", 200);
      if (!title) continue;

      const publishedAt = parseTimestamp(e.createdAt ?? e.created_at);
      if (publishedAt !== undefined && publishedAt < ctx.since) continue;

      out.push({
        title,
        url,
        source: e.source ?? this.name,
        sourceKind: this.kind,
        publishedAt,
        author: e.author ?? e.username,
        score: e.score,
        summary: e.summary ?? e.text ?? e.content,
      });
    }
    return out;
  }
}

function extractEntries(parsed: unknown): BookmarkEntry[] {
  if (Array.isArray(parsed)) return parsed as BookmarkEntry[];
  if (parsed && typeof parsed === "object") {
    const obj = parsed as BookmarkFile;
    if (Array.isArray(obj.bookmarks)) return obj.bookmarks;
    if (Array.isArray(obj.tweets)) return obj.tweets;
    if (Array.isArray(obj.items)) return obj.items;
  }
  return [];
}

function parseTimestamp(v: string | number | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") {
    // distinguish seconds vs ms by magnitude. anything pre-2001 in ms is a seconds value.
    return v < 1e12 ? v * 1000 : v;
  }
  const parsed = Date.parse(v);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function truncate(s: string, max: number): string {
  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
