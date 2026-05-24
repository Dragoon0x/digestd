import { RssSource } from "./rss.ts";
import type { Source, SourceContext } from "./types.ts";
import type { RawItem, SourceKind } from "../core/types.ts";

export interface YouTubeChannelOptions {
  // youtube channel id like "UCsBjURrPoezykLs9EqgamOA"
  // not the @handle, not the user-friendly url.
  channelId: string;
  name?: string;
  limit?: number;
}

// youtube exposes a public atom feed per channel:
// https://www.youtube.com/feeds/videos.xml?channel_id={id}
// no auth, no rate limit complaints in practice. transcripts come later in v0.3.
export class YouTubeChannelSource implements Source {
  readonly id: string;
  private readonly inner: RssSource;

  constructor(private readonly options: YouTubeChannelOptions) {
    this.id = `youtube:${options.channelId}`;
    this.inner = new RssSource({
      url: `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(options.channelId)}`,
      name: options.name ?? `youtube/${options.channelId}`,
      limit: options.limit,
    });
  }

  async fetch(ctx: SourceContext): Promise<RawItem[]> {
    const items = await this.inner.fetch(ctx);
    // tag as youtube so the renderer can do video-specific formatting later
    return items.map((item) => ({
      ...item,
      sourceKind: "youtube" as SourceKind,
    }));
  }
}
