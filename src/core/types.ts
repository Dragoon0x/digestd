// canonical shape everything normalizes to.
// every source produces Items. every stage consumes Items.

export type SourceKind =
  | "rss"
  | "atom"
  | "hackernews"
  | "youtube"
  | "reddit"
  | "substack"
  | "custom";

export interface Item {
  // stable identifier. derived from url when possible, falls back to hash.
  id: string;

  // origin
  source: string; // human label, e.g. "stratechery" or "hn:top"
  sourceKind: SourceKind;

  // content
  title: string;
  url: string;
  author?: string;
  summary?: string; // raw description from feed, may be html
  content?: string; // full text body when available

  // signals
  publishedAt: number; // unix ms
  fetchedAt: number; // unix ms
  score?: number; // upvotes, points, etc.
  commentsUrl?: string;
  commentsCount?: number;

  // for downstream stages
  tags?: string[];
}

export interface RawItem extends Partial<Item> {
  url: string;
  title: string;
  source: string;
  sourceKind: SourceKind;
}

export interface Digest {
  generatedAt: number;
  windowStart: number;
  windowEnd: number;
  items: Item[];
  // groupings populated by later stages (cluster, compose).
  // session 1 keeps items chronological only.
  clusters?: Cluster[];
}

export interface Cluster {
  topic: string;
  items: Item[];
  summary?: string;
}
