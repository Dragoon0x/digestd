import type { Source } from "./types.ts";
import { RssSource } from "./rss.ts";
import { HackerNewsSource } from "./hackernews.ts";
import { YouTubeChannelSource } from "./youtube.ts";
import { RedditSource } from "./reddit.ts";
import { BookmarkSource } from "./bookmark.ts";
import type { SourcesConfig } from "../core/config.ts";

export function buildSources(config: SourcesConfig): Source[] {
  const sources: Source[] = [];

  if (config.rss) {
    for (const entry of config.rss) {
      if (typeof entry === "string") {
        sources.push(new RssSource({ url: entry }));
      } else {
        sources.push(new RssSource(entry));
      }
    }
  }

  if (config.hackernews) {
    const opts = config.hackernews === true ? {} : config.hackernews;
    sources.push(new HackerNewsSource(opts));
  }

  if (config.youtube?.channels) {
    for (const entry of config.youtube.channels) {
      if (typeof entry === "string") {
        sources.push(new YouTubeChannelSource({ channelId: entry }));
      } else {
        sources.push(new YouTubeChannelSource(entry));
      }
    }
  }

  if (config.reddit?.subreddits) {
    for (const entry of config.reddit.subreddits) {
      if (typeof entry === "string") {
        sources.push(new RedditSource({ subreddit: entry }));
      } else {
        sources.push(new RedditSource(entry));
      }
    }
  }

  if (config.bookmarks) {
    for (const entry of config.bookmarks) {
      sources.push(new BookmarkSource(entry));
    }
  }

  return sources;
}
