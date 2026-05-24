import type { RawItem } from "../core/types.ts";

export interface SourceContext {
  // ms timestamp. only items at or after this should be returned (best effort).
  since: number;
  // optional: cap items per fetch. sources should respect when reasonable.
  limit?: number;
  // for testing. defaults to global fetch.
  fetcher?: typeof fetch;
}

export interface Source {
  // unique identifier for this configured source instance.
  // e.g. "rss:https://stratechery.com/feed" or "hackernews:top"
  id: string;
  fetch(ctx: SourceContext): Promise<RawItem[]>;
}

export class SourceError extends Error {
  constructor(
    message: string,
    public readonly sourceId: string,
    public readonly cause?: unknown,
  ) {
    super(`[${sourceId}] ${message}`);
    this.name = "SourceError";
  }
}
