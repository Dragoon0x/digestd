import { test, expect, describe } from "bun:test";
import { renderMarkdown } from "../src/render/markdown.ts";
import type { Digest, Item } from "../src/core/types.ts";

function makeItem(overrides: Partial<Item>): Item {
  return {
    id: overrides.id ?? "id-x",
    source: overrides.source ?? "example",
    sourceKind: overrides.sourceKind ?? "rss",
    title: overrides.title ?? "Sample Title",
    url: overrides.url ?? "https://example.com/post",
    publishedAt: overrides.publishedAt ?? Date.parse("2024-01-15T00:00:00Z"),
    fetchedAt: overrides.fetchedAt ?? Date.parse("2024-01-15T00:00:00Z"),
    summary: overrides.summary,
    author: overrides.author,
    score: overrides.score,
    commentsCount: overrides.commentsCount,
    commentsUrl: overrides.commentsUrl,
  };
}

function makeDigest(items: Item[]): Digest {
  return {
    generatedAt: Date.parse("2024-01-20T12:00:00Z"),
    windowStart: Date.parse("2024-01-13T00:00:00Z"),
    windowEnd: Date.parse("2024-01-20T00:00:00Z"),
    items,
  };
}

describe("renderMarkdown", () => {
  test("includes title heading", () => {
    const md = renderMarkdown(makeDigest([makeItem({})]), { title: "weekly" });
    expect(md).toContain("# weekly");
  });

  test("shows item count and date range", () => {
    const md = renderMarkdown(makeDigest([makeItem({}), makeItem({ id: "y" })]));
    expect(md).toContain("2 items");
    expect(md).toContain("2024-01-13");
    expect(md).toContain("2024-01-20");
  });

  test("renders item title as link", () => {
    const md = renderMarkdown(
      makeDigest([
        makeItem({ title: "The Story", url: "https://x.com/a" }),
      ]),
    );
    expect(md).toContain("[The Story](https://x.com/a)");
  });

  test("escapes brackets in title", () => {
    const md = renderMarkdown(
      makeDigest([makeItem({ title: "[Ask HN] question" })]),
    );
    expect(md).toContain("\\[Ask HN\\]");
  });

  test("includes meta line with author, date, score, comments", () => {
    const md = renderMarkdown(
      makeDigest([
        makeItem({
          author: "alice",
          score: 42,
          commentsCount: 7,
          commentsUrl: "https://hn/x",
        }),
      ]),
    );
    expect(md).toContain("alice");
    expect(md).toContain("42 points");
    expect(md).toContain("7 comments");
  });

  test("groups items by source by default", () => {
    const md = renderMarkdown(
      makeDigest([
        makeItem({ source: "alpha", title: "a1" }),
        makeItem({ source: "beta", title: "b1" }),
        makeItem({ source: "alpha", title: "a2" }),
      ]),
    );
    expect(md).toContain("## alpha");
    expect(md).toContain("## beta");
  });

  test("flat list when groupBySource is false", () => {
    const md = renderMarkdown(
      makeDigest([
        makeItem({ source: "alpha", title: "a1" }),
        makeItem({ source: "beta", title: "b1" }),
      ]),
      { groupBySource: false },
    );
    expect(md).not.toContain("## alpha");
    expect(md).not.toContain("## beta");
    expect(md).toContain("a1");
    expect(md).toContain("b1");
  });

  test("truncates long summaries", () => {
    const long = "x".repeat(500);
    const md = renderMarkdown(
      makeDigest([makeItem({ summary: long })]),
      { maxSummaryChars: 50 },
    );
    expect(md).toContain("…");
    // 49 x's + ellipsis = 50 chars, not 500
    expect(md).not.toContain("x".repeat(100));
  });

  test("omits summary when includeSummary false", () => {
    const md = renderMarkdown(
      makeDigest([makeItem({ summary: "secret summary content" })]),
      { includeSummary: false },
    );
    expect(md).not.toContain("secret summary content");
  });

  test("renders empty-state message for empty digest", () => {
    const md = renderMarkdown(makeDigest([]));
    expect(md).toContain("nothing to digest");
  });

  test("includes generation footer", () => {
    const md = renderMarkdown(makeDigest([makeItem({})]));
    expect(md).toContain("generated");
    expect(md).toContain("digestd");
  });
});
