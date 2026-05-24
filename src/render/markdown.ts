import type { Digest, Item } from "../core/types.ts";

export interface RenderOptions {
  title?: string;
  groupBySource?: boolean; // default true
  includeSummary?: boolean; // default true
  maxSummaryChars?: number; // default 280
}

export function renderMarkdown(
  digest: Digest,
  options: RenderOptions = {},
): string {
  const title = options.title ?? "weekly digest";
  const groupBySource = options.groupBySource ?? true;
  const includeSummary = options.includeSummary ?? true;
  const maxSummaryChars = options.maxSummaryChars ?? 280;

  const lines: string[] = [];

  // header
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(
    `${digest.items.length} items, ${formatRange(digest.windowStart, digest.windowEnd)}`,
  );
  lines.push("");

  if (digest.items.length === 0) {
    lines.push("_nothing to digest. check your sources or widen the window._");
    return lines.join("\n");
  }

  if (groupBySource) {
    const grouped = groupItemsBySource(digest.items);
    for (const [source, items] of grouped) {
      lines.push(`## ${source}`);
      lines.push("");
      for (const item of items) {
        lines.push(renderItem(item, { includeSummary, maxSummaryChars }));
        lines.push("");
      }
    }
  } else {
    for (const item of digest.items) {
      lines.push(renderItem(item, { includeSummary, maxSummaryChars }));
      lines.push("");
    }
  }

  // trailing footer
  lines.push("---");
  lines.push(`_generated ${new Date(digest.generatedAt).toISOString()} by digestd_`);

  return lines.join("\n");
}

function renderItem(
  item: Item,
  opts: { includeSummary: boolean; maxSummaryChars: number },
): string {
  const parts: string[] = [];

  // title as link
  const escapedTitle = escapeMarkdown(item.title);
  parts.push(`### [${escapedTitle}](${item.url})`);

  // meta line
  const meta: string[] = [];
  if (item.author) meta.push(item.author);
  if (item.publishedAt) meta.push(formatDate(item.publishedAt));
  if (item.score !== undefined) meta.push(`${item.score} points`);
  if (item.commentsCount !== undefined) {
    const link = item.commentsUrl
      ? `[${item.commentsCount} comments](${item.commentsUrl})`
      : `${item.commentsCount} comments`;
    meta.push(link);
  }
  if (meta.length) parts.push(meta.join(" · "));

  // summary
  if (opts.includeSummary && item.summary) {
    const summary = truncate(item.summary, opts.maxSummaryChars);
    parts.push("");
    parts.push(summary);
  }

  return parts.join("\n");
}

function groupItemsBySource(items: Item[]): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const arr = groups.get(item.source) ?? [];
    arr.push(item);
    groups.set(item.source, arr);
  }
  // sort items within group by publishedAt desc
  for (const arr of groups.values()) {
    arr.sort((a, b) => b.publishedAt - a.publishedAt);
  }
  return groups;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function escapeMarkdown(s: string): string {
  return s.replace(/([\[\]])/g, "\\$1");
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function formatRange(start: number, end: number): string {
  return `${formatDate(start)} → ${formatDate(end)}`;
}
