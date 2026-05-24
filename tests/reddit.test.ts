import { test, expect, describe } from "bun:test";
import { RedditSource } from "../src/sources/reddit.ts";

const REDDIT_RESPONSE = {
  data: {
    children: [
      {
        data: {
          id: "abc1",
          title: "Cool article",
          permalink: "/r/programming/comments/abc1/cool_article/",
          url: "https://example.com/cool",
          author: "alice",
          score: 1200,
          num_comments: 87,
          created_utc: 1700000000,
          selftext: null,
          is_self: false,
          stickied: false,
          over_18: false,
          domain: "example.com",
        },
      },
      {
        data: {
          id: "abc2",
          title: "Pinned mod post",
          permalink: "/r/programming/comments/abc2/pinned/",
          url: "https://reddit.com/r/programming/comments/abc2/pinned/",
          author: "AutoMod",
          score: 50,
          num_comments: 0,
          created_utc: 1700000000,
          selftext: "mod post",
          is_self: true,
          stickied: true,
          over_18: false,
          domain: "self.programming",
        },
      },
      {
        data: {
          id: "abc3",
          title: "Low-quality post",
          permalink: "/r/programming/comments/abc3/low/",
          url: "https://example.com/low",
          author: "spammer",
          score: 5,
          num_comments: 0,
          created_utc: 1700000000,
          selftext: null,
          is_self: false,
          stickied: false,
          over_18: false,
          domain: "example.com",
        },
      },
      {
        data: {
          id: "abc4",
          title: "Self post with text",
          permalink: "/r/programming/comments/abc4/self/",
          url: "https://reddit.com/r/programming/comments/abc4/self/",
          author: "user2",
          score: 200,
          num_comments: 12,
          created_utc: 1700000000,
          selftext: "Here's a long self post body.",
          is_self: true,
          stickied: false,
          over_18: false,
          domain: "self.programming",
        },
      },
    ],
  },
};

describe("RedditSource id", () => {
  test("includes sub and sort", () => {
    const s = new RedditSource({ subreddit: "programming", sort: "top" });
    expect(s.id).toBe("reddit:programming:top");
  });

  test("strips r/ prefix", () => {
    const s = new RedditSource({ subreddit: "r/programming" });
    expect(s.id).toBe("reddit:programming:top");
  });

  test("default sort is top", () => {
    const s = new RedditSource({ subreddit: "programming" });
    expect(s.id).toBe("reddit:programming:top");
  });
});

describe("RedditSource normalize", () => {
  test("converts children to RawItems", () => {
    const s = new RedditSource({ subreddit: "programming" });
    const items = s.normalize(REDDIT_RESPONSE as any, { since: 0 });
    // 4 children, 1 stickied dropped, 3 should pass through
    expect(items).toHaveLength(3);
  });

  test("uses external url for link posts", () => {
    const s = new RedditSource({ subreddit: "programming" });
    const items = s.normalize(REDDIT_RESPONSE as any, { since: 0 });
    const cool = items.find((i) => i.title === "Cool article");
    expect(cool?.url).toBe("https://example.com/cool");
  });

  test("uses permalink for self posts", () => {
    const s = new RedditSource({ subreddit: "programming" });
    const items = s.normalize(REDDIT_RESPONSE as any, { since: 0 });
    const self = items.find((i) => i.title === "Self post with text");
    expect(self?.url).toContain("reddit.com/r/programming/comments/abc4");
  });

  test("includes selftext as summary for text posts", () => {
    const s = new RedditSource({ subreddit: "programming" });
    const items = s.normalize(REDDIT_RESPONSE as any, { since: 0 });
    const self = items.find((i) => i.title === "Self post with text");
    expect(self?.summary).toBe("Here's a long self post body.");
  });

  test("filters by minScore", () => {
    const s = new RedditSource({ subreddit: "programming", minScore: 100 });
    const items = s.normalize(REDDIT_RESPONSE as any, { since: 0 });
    // "Low-quality post" (score 5) should be dropped
    const titles = items.map((i) => i.title);
    expect(titles).not.toContain("Low-quality post");
    expect(items).toHaveLength(2);
  });

  test("filters by since", () => {
    const s = new RedditSource({ subreddit: "programming" });
    // all created at 1700000000 unix seconds = 1700000000000 ms
    const future = 1700000000 * 1000 + 1;
    const items = s.normalize(REDDIT_RESPONSE as any, { since: future });
    expect(items).toHaveLength(0);
  });

  test("skips stickied posts", () => {
    const s = new RedditSource({ subreddit: "programming" });
    const items = s.normalize(REDDIT_RESPONSE as any, { since: 0 });
    const titles = items.map((i) => i.title);
    expect(titles).not.toContain("Pinned mod post");
  });

  test("converts unix seconds to ms", () => {
    const s = new RedditSource({ subreddit: "programming" });
    const items = s.normalize(REDDIT_RESPONSE as any, { since: 0 });
    expect(items[0]?.publishedAt).toBe(1700000000 * 1000);
  });

  test("source name is r/sub format", () => {
    const s = new RedditSource({ subreddit: "programming" });
    const items = s.normalize(REDDIT_RESPONSE as any, { since: 0 });
    expect(items[0]?.source).toBe("r/programming");
  });
});

describe("RedditSource fetch", () => {
  test("builds correct url with sort and limit", async () => {
    let capturedUrl: string | undefined;
    const mockFetcher: typeof fetch = async (url) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify(REDDIT_RESPONSE), { status: 200 });
    };
    const s = new RedditSource({
      subreddit: "programming",
      sort: "top",
      timeWindow: "week",
      limit: 50,
    });
    await s.fetch({ since: 0, fetcher: mockFetcher });
    expect(capturedUrl).toContain("/r/programming/top.json");
    expect(capturedUrl).toContain("t=week");
    expect(capturedUrl).toContain("limit=50");
  });

  test("does not include t= for non-top sorts", async () => {
    let capturedUrl: string | undefined;
    const mockFetcher: typeof fetch = async (url) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify(REDDIT_RESPONSE), { status: 200 });
    };
    const s = new RedditSource({ subreddit: "programming", sort: "hot" });
    await s.fetch({ since: 0, fetcher: mockFetcher });
    expect(capturedUrl).not.toMatch(/[?&]t=/);
  });

  test("throws on http error", async () => {
    const mockFetcher: typeof fetch = async () =>
      new Response("err", { status: 429 });
    const s = new RedditSource({ subreddit: "programming" });
    await expect(s.fetch({ since: 0, fetcher: mockFetcher })).rejects.toThrow();
  });
});
