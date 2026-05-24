import { XMLParser } from "fast-xml-parser";
import type { Source, SourceContext } from "./types.ts";
import { SourceError } from "./types.ts";
import type { RawItem, SourceKind } from "../core/types.ts";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false, // keep everything as strings, normalize ourselves
  textNodeName: "_text",
});

export interface RssSourceOptions {
  url: string;
  name?: string;
  limit?: number;
}

export class RssSource implements Source {
  readonly id: string;
  private readonly name: string;
  private readonly limit?: number;

  constructor(private readonly options: RssSourceOptions) {
    this.id = `rss:${options.url}`;
    this.name = options.name ?? hostFromUrl(options.url);
    this.limit = options.limit;
  }

  async fetch(ctx: SourceContext): Promise<RawItem[]> {
    const fetcher = ctx.fetcher ?? fetch;
    let res: Response;
    try {
      res = await fetcher(this.options.url, {
        headers: { "user-agent": "digestd/0.1 (+https://github.com/Dragoon0x/digestd)" },
      });
    } catch (err) {
      throw new SourceError("network error", this.id, err);
    }
    if (!res.ok) {
      throw new SourceError(`http ${res.status}`, this.id);
    }
    const xml = await res.text();
    return this.parse(xml, ctx);
  }

  parse(xml: string, ctx: SourceContext): RawItem[] {
    let doc: any;
    try {
      doc = parser.parse(xml);
    } catch (err) {
      throw new SourceError("xml parse failed", this.id, err);
    }

    const items: RawItem[] = [];
    const limit = ctx.limit ?? this.limit;

    // rss 2.0: <rss><channel><item>...
    if (doc?.rss?.channel) {
      const channel = doc.rss.channel;
      const raw = arrayify(channel.item);
      for (const entry of raw) {
        const item = parseRssItem(entry, this.name);
        if (item && item.publishedAt && item.publishedAt >= ctx.since) {
          items.push(item);
        } else if (item && !item.publishedAt) {
          // no date, include conservatively
          items.push(item);
        }
        if (limit && items.length >= limit) break;
      }
      return items;
    }

    // atom: <feed><entry>...
    if (doc?.feed?.entry !== undefined) {
      const raw = arrayify(doc.feed.entry);
      for (const entry of raw) {
        const item = parseAtomEntry(entry, this.name);
        if (item && item.publishedAt && item.publishedAt >= ctx.since) {
          items.push(item);
        } else if (item && !item.publishedAt) {
          items.push(item);
        }
        if (limit && items.length >= limit) break;
      }
      return items;
    }

    throw new SourceError("not a recognized rss/atom document", this.id);
  }
}

function arrayify<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node: unknown): string | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === "string") return node.trim() || undefined;
  if (typeof node === "object" && node !== null) {
    const obj = node as Record<string, unknown>;
    if (typeof obj._text === "string") return obj._text.trim() || undefined;
    if (typeof obj["#text"] === "string") return (obj["#text"] as string).trim() || undefined;
  }
  return undefined;
}

function parseRssItem(raw: any, sourceName: string): RawItem | null {
  const title = textOf(raw.title);
  const link = textOf(raw.link) ?? textOf(raw.guid);
  if (!title || !link) return null;

  const pubDate = textOf(raw.pubDate) ?? textOf(raw["dc:date"]);
  const publishedAt = pubDate ? parseDate(pubDate) : undefined;

  return {
    title,
    url: link,
    source: sourceName,
    sourceKind: "rss" as SourceKind,
    publishedAt,
    author: textOf(raw.author) ?? textOf(raw["dc:creator"]),
    summary: textOf(raw.description) ?? textOf(raw["content:encoded"]),
    content: textOf(raw["content:encoded"]),
  };
}

function parseAtomEntry(raw: any, sourceName: string): RawItem | null {
  const title = textOf(raw.title);
  if (!title) return null;

  // <link href="..."/> or <link>...</link>
  let url: string | undefined;
  const links = arrayify(raw.link);
  for (const l of links) {
    if (typeof l === "string") {
      url = l;
      break;
    }
    if (l && typeof l === "object") {
      const rel = (l as any)["@_rel"];
      const href = (l as any)["@_href"];
      if (href && (!rel || rel === "alternate")) {
        url = href;
        break;
      }
    }
  }
  if (!url) return null;

  const published = textOf(raw.published) ?? textOf(raw.updated);
  const publishedAt = published ? parseDate(published) : undefined;

  const authorNode = raw.author;
  const author =
    typeof authorNode === "object" && authorNode !== null
      ? textOf((authorNode as any).name)
      : textOf(authorNode);

  return {
    title,
    url,
    source: sourceName,
    sourceKind: "atom" as SourceKind,
    publishedAt,
    author,
    summary: textOf(raw.summary),
    content: textOf(raw.content),
  };
}

function parseDate(s: string): number | undefined {
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
