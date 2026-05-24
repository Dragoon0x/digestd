import type { Source, SourceContext } from "./types.ts";
import { SourceError } from "./types.ts";
import type { RawItem } from "../core/types.ts";

export interface HackerNewsOptions {
  feed?: "top" | "best" | "new";
  minScore?: number;
  limit?: number;
}

interface AlgoliaHit {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string | null;
  points: number | null;
  num_comments: number | null;
  created_at_i: number; // unix seconds
  story_text: string | null;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
}

// algolia search api. no auth, generous rate limits, perfect for this.
// https://hn.algolia.com/api
const ALGOLIA_BASE = "https://hn.algolia.com/api/v1";

export class HackerNewsSource implements Source {
  readonly id: string;
  private readonly feed: "top" | "best" | "new";
  private readonly minScore: number;
  private readonly limit: number;

  constructor(options: HackerNewsOptions = {}) {
    this.feed = options.feed ?? "top";
    this.minScore = options.minScore ?? 100;
    this.limit = options.limit ?? 30;
    this.id = `hackernews:${this.feed}`;
  }

  async fetch(ctx: SourceContext): Promise<RawItem[]> {
    const fetcher = ctx.fetcher ?? fetch;
    const sinceSec = Math.floor(ctx.since / 1000);

    // search_by_date for chronological, search for ranked by relevance.
    // for "top" we want highly ranked, so use the points filter on search.
    // for "new" we use search_by_date.
    const endpoint = this.feed === "new" ? "search_by_date" : "search";

    const params = new URLSearchParams({
      tags: "story",
      numericFilters: `created_at_i>${sinceSec},points>=${this.minScore}`,
      hitsPerPage: String(ctx.limit ?? this.limit),
    });

    const url = `${ALGOLIA_BASE}/${endpoint}?${params.toString()}`;

    let res: Response;
    try {
      res = await fetcher(url, {
        headers: { "user-agent": "digestd/0.1 (+https://github.com/Dragoon0x/digestd)" },
      });
    } catch (err) {
      throw new SourceError("network error", this.id, err);
    }
    if (!res.ok) {
      throw new SourceError(`http ${res.status}`, this.id);
    }

    let data: AlgoliaResponse;
    try {
      data = (await res.json()) as AlgoliaResponse;
    } catch (err) {
      throw new SourceError("json parse failed", this.id, err);
    }

    return this.normalize(data);
  }

  normalize(data: AlgoliaResponse): RawItem[] {
    const out: RawItem[] = [];
    for (const hit of data.hits ?? []) {
      if (!hit.title) continue;
      const link = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
      out.push({
        title: hit.title,
        url: link,
        source: "hackernews",
        sourceKind: "hackernews",
        publishedAt: hit.created_at_i * 1000,
        author: hit.author ?? undefined,
        score: hit.points ?? undefined,
        commentsCount: hit.num_comments ?? undefined,
        commentsUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        content: hit.story_text ?? undefined,
      });
    }
    return out;
  }
}
