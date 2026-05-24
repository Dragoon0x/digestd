import { test, expect, describe } from "bun:test";
import { HackerNewsSource } from "../src/sources/hackernews.ts";

const HN_RESPONSE = {
  hits: [
    {
      objectID: "12345",
      title: "Big Tech Story",
      url: "https://news.example.com/story",
      author: "pg",
      points: 421,
      num_comments: 187,
      created_at_i: 1700000000,
      story_text: null,
    },
    {
      objectID: "67890",
      title: "Ask HN: Anyone using digestd?",
      url: null,
      author: "user2",
      points: 105,
      num_comments: 22,
      created_at_i: 1700001000,
      story_text: "I wonder if anyone has tried it.",
    },
  ],
};

describe("HackerNewsSource id and defaults", () => {
  test("default feed is top", () => {
    const s = new HackerNewsSource();
    expect(s.id).toBe("hackernews:top");
  });

  test("custom feed reflected in id", () => {
    const s = new HackerNewsSource({ feed: "best" });
    expect(s.id).toBe("hackernews:best");
  });
});

describe("HackerNewsSource normalize", () => {
  test("converts hits to RawItem", () => {
    const s = new HackerNewsSource();
    const items = s.normalize(HN_RESPONSE as any);
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe("Big Tech Story");
    expect(items[0]?.url).toBe("https://news.example.com/story");
    expect(items[0]?.score).toBe(421);
    expect(items[0]?.commentsCount).toBe(187);
    expect(items[0]?.commentsUrl).toBe(
      "https://news.ycombinator.com/item?id=12345",
    );
  });

  test("falls back to hn item url when url is null", () => {
    const s = new HackerNewsSource();
    const items = s.normalize(HN_RESPONSE as any);
    expect(items[1]?.url).toBe("https://news.ycombinator.com/item?id=67890");
  });

  test("converts unix seconds to ms", () => {
    const s = new HackerNewsSource();
    const items = s.normalize(HN_RESPONSE as any);
    expect(items[0]?.publishedAt).toBe(1700000000 * 1000);
  });

  test("preserves story_text as content", () => {
    const s = new HackerNewsSource();
    const items = s.normalize(HN_RESPONSE as any);
    expect(items[1]?.content).toBe("I wonder if anyone has tried it.");
  });

  test("skips hits without title", () => {
    const s = new HackerNewsSource();
    const data = {
      hits: [
        { objectID: "x", title: null, url: "x", points: 1, created_at_i: 1 },
      ],
    };
    expect(s.normalize(data as any)).toHaveLength(0);
  });

  test("handles empty response", () => {
    const s = new HackerNewsSource();
    expect(s.normalize({ hits: [] } as any)).toEqual([]);
  });
});

describe("HackerNewsSource fetch", () => {
  test("builds correct algolia url with filters", async () => {
    let capturedUrl: string | undefined;
    const mockFetcher: typeof fetch = async (url) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify(HN_RESPONSE), { status: 200 });
    };

    const s = new HackerNewsSource({ feed: "top", minScore: 50, limit: 5 });
    const items = await s.fetch({
      since: 1_700_000_000_000,
      fetcher: mockFetcher,
    });

    expect(capturedUrl).toContain("hn.algolia.com");
    expect(capturedUrl).toContain("tags=story");
    expect(capturedUrl).toContain("points%3E%3D50"); // points>=50 url-encoded
    expect(capturedUrl).toContain("hitsPerPage=5");
    expect(items).toHaveLength(2);
  });

  test("uses search_by_date for new feed", async () => {
    let capturedUrl: string | undefined;
    const mockFetcher: typeof fetch = async (url) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify(HN_RESPONSE), { status: 200 });
    };

    const s = new HackerNewsSource({ feed: "new" });
    await s.fetch({ since: 0, fetcher: mockFetcher });
    expect(capturedUrl).toContain("/search_by_date");
  });

  test("uses search for top feed", async () => {
    let capturedUrl: string | undefined;
    const mockFetcher: typeof fetch = async (url) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify(HN_RESPONSE), { status: 200 });
    };

    const s = new HackerNewsSource({ feed: "top" });
    await s.fetch({ since: 0, fetcher: mockFetcher });
    expect(capturedUrl).toContain("/search?");
  });

  test("throws on http error", async () => {
    const mockFetcher: typeof fetch = async () =>
      new Response("err", { status: 500 });
    const s = new HackerNewsSource();
    await expect(s.fetch({ since: 0, fetcher: mockFetcher })).rejects.toThrow();
  });
});
