import { parse as parseYaml } from "yaml";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface RssSourceConfig {
  url: string;
  name?: string;
  limit?: number;
}

export interface HackerNewsSourceConfig {
  feed?: "top" | "best" | "new";
  minScore?: number;
  limit?: number;
}

export interface YouTubeSourceConfig {
  channelId: string;
  name?: string;
  limit?: number;
}

export interface RedditSourceConfig {
  subreddit: string;
  sort?: "hot" | "top" | "new" | "rising";
  timeWindow?: "hour" | "day" | "week" | "month" | "year" | "all";
  minScore?: number;
  limit?: number;
}

export interface BookmarkSourceConfig {
  path: string;
  name?: string;
}

export interface SourcesConfig {
  rss?: (string | RssSourceConfig)[];
  hackernews?: HackerNewsSourceConfig | boolean;
  youtube?: { channels?: (string | YouTubeSourceConfig)[] };
  reddit?: { subreddits?: (string | RedditSourceConfig)[] };
  bookmarks?: BookmarkSourceConfig[];
}

export interface DeliverFileConfig {
  type: "file";
  path: string;
}

export type DeliverConfig = DeliverFileConfig;

export interface RelevanceConfig {
  enabled?: boolean;
  preferences: string;
  threshold?: number;
  batchSize?: number;
  onError?: "passthrough" | "exclude";
  provider?: string;
  model?: string;
}

export interface LlmConfig {
  provider?: string;
  model?: string;
  apiKeyEnv?: string;
}

export interface DigestdConfig {
  window?: { hours?: number };
  sources: SourcesConfig;
  deliver: DeliverConfig[];
  llm?: LlmConfig;
  voice?: { file?: string };
  relevance?: RelevanceConfig;
}

export const DEFAULT_CONFIG: DigestdConfig = {
  window: { hours: 168 },
  sources: {},
  deliver: [{ type: "file", path: "./digests/{{date}}.md" }],
};

export async function loadConfig(path: string): Promise<DigestdConfig> {
  const absolute = resolve(path);
  const raw = await readFile(absolute, "utf-8");
  const parsed = parseYaml(raw) as Partial<DigestdConfig> | null;
  return mergeConfig(DEFAULT_CONFIG, parsed ?? {});
}

export function mergeConfig(
  base: DigestdConfig,
  override: Partial<DigestdConfig>,
): DigestdConfig {
  return {
    window: { ...base.window, ...override.window },
    sources: { ...base.sources, ...override.sources },
    deliver: override.deliver ?? base.deliver,
    llm: { ...base.llm, ...override.llm },
    voice: { ...base.voice, ...override.voice },
    relevance: override.relevance ?? base.relevance,
  };
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
