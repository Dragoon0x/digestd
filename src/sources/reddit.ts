import type { Source, SourceContext } from "./types.ts";
import { SourceError } from "./types.ts";
import type { RawItem } from "../core/types.ts";

export interface RedditSourceOptions {
  subreddit: string;
  // "hot" | "top" | "new" | "rising". default "top"
  sort?: "hot" | "top" | "new" | "rising";
  // when sort is "top", the time window. default "week"
  timeWindow?: "hour" | "day" | "week" | "month" | "year" | "all";
  minScore?: number;
  limit?: number;
}

interface RedditChild {
  data: {
    id: string;
    title: string;
    permalink: string;
    url: string;
    author: string;
    score: number;
    num_comments: number;
    created_utc: number;
    selftext: string | null;
    is_self: boolean;
    stickied: boolean;
    over_18: boolean;
    domain: string;
  };
}

interface RedditListing {
  data: {
    children: RedditChild[];
  };
}

export class RedditSource implements Source {
  readonly id: string;
  private readonly subreddit: string;
  private readonly sort: "hot" | "top" | "new" | "rising";
  private readonly timeWindow: string;
  private readonly minScore: number;
  private readonly limit: number;

  constructor(options: RedditSourceOptions) {
    // strip leading r/ if user included it
    this.subreddit = options.subreddit.replace(/^\/?r\//i, "");
    this.sort = options.sort ?? "top";
    this.timeWindow = options.timeWindow ?? "week";
    this.minScore = options.minScore ?? 0;
    this.limit = options.limit ?? 25;
    this.id = `reddit:${this.subreddit}:${this.sort}`;
  }

  async fetch(ctx: SourceContext): Promise<RawItem[]> {
    const fetcher = ctx.fetcher ?? fetch;
    const limit = ctx.limit ?? this.limit;

    // reddit json endpoint. for "top", append t=window. for others, ignored.
    const params = new URLSearchParams({
      limit: String(Math.min(limit, 100)),
    });
    if (this.sort === "top") params.set("t", this.timeWindow);

    const url = `https://www.reddit.com/r/${encodeURIComponent(this.subreddit)}/${this.sort}.json?${params}`;

    let res: Response;
    try {
      res = await fetcher(url, {
        headers: {
          "user-agent": "digestd/0.2 (+https://github.com/Dragoon0x/digestd)",
          accept: "application/json",
        },
      });
    } catch (err) {
      throw new SourceError("network error", this.id, err);
    }

    if (!res.ok) {
      throw new SourceError(`http ${res.status}`, this.id);
    }

    let data: RedditListing;
    try {
      data = (await res.json()) as RedditListing;
    } catch (err) {
      throw new SourceError("json parse failed", this.id, err);
    }

    return this.normalize(data, ctx);
  }

  normalize(data: RedditListing, ctx: SourceContext): RawItem[] {
    const out: RawItem[] = [];
    const children = data.data?.children ?? [];
    const since = ctx.since;

    for (const child of children) {
      const d = child.data;
      if (!d?.title) continue;
      if (d.stickied) continue; // skip pinned mod posts
      if (d.score < this.minScore) continue;

      const publishedAt = d.created_utc * 1000;
      if (publishedAt < since) continue;

      const commentsUrl = `https://www.reddit.com${d.permalink}`;
      // is_self means it's a text post, the url is the same as the permalink
      const link = d.is_self ? commentsUrl : d.url;

      out.push({
        title: d.title,
        url: link,
        source: `r/${this.subreddit}`,
        sourceKind: "reddit",
        publishedAt,
        author: d.author,
        score: d.score,
        commentsCount: d.num_comments,
        commentsUrl,
        summary: d.selftext || undefined,
      });
    }

    return out;
  }
}
