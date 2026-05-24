import { test, expect, describe } from "bun:test";
import { RssSource } from "../src/sources/rss.ts";

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com</link>
    <description>Test feed</description>
    <item>
      <title>First Post</title>
      <link>https://example.com/posts/1</link>
      <pubDate>Mon, 06 Sep 2021 12:00:00 GMT</pubDate>
      <author>alice@example.com</author>
      <description>An &amp; entity test.</description>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/posts/2</link>
      <pubDate>Tue, 07 Sep 2021 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <link href="https://atom.example.com/"/>
  <entry>
    <title>Atom One</title>
    <link href="https://atom.example.com/one"/>
    <published>2022-01-01T00:00:00Z</published>
    <author><name>Bob</name></author>
    <summary>Atom summary</summary>
  </entry>
  <entry>
    <title>Atom Two</title>
    <link rel="alternate" href="https://atom.example.com/two"/>
    <updated>2022-02-01T00:00:00Z</updated>
  </entry>
</feed>`;

describe("RssSource parse", () => {
  test("parses rss 2.0 items", () => {
    const src = new RssSource({ url: "https://example.com/feed" });
    const items = src.parse(RSS_SAMPLE, { since: 0 });
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe("First Post");
    expect(items[0]?.url).toBe("https://example.com/posts/1");
    expect(items[0]?.author).toBe("alice@example.com");
    expect(items[0]?.sourceKind).toBe("rss");
  });

  test("decodes entities in description", () => {
    const src = new RssSource({ url: "https://example.com/feed" });
    const items = src.parse(RSS_SAMPLE, { since: 0 });
    // raw still has entity, normalize stage strips html
    expect(items[0]?.summary).toContain("entity test");
  });

  test("respects the since timestamp", () => {
    const src = new RssSource({ url: "https://example.com/feed" });
    // sep 7 epoch ms = 1630929600000+
    const since = Date.parse("Tue, 07 Sep 2021 00:00:00 GMT");
    const items = src.parse(RSS_SAMPLE, { since });
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Second Post");
  });

  test("respects limit", () => {
    const src = new RssSource({
      url: "https://example.com/feed",
      limit: 1,
    });
    const items = src.parse(RSS_SAMPLE, { since: 0 });
    expect(items).toHaveLength(1);
  });

  test("ctx.limit overrides instance limit", () => {
    const src = new RssSource({
      url: "https://example.com/feed",
      limit: 10,
    });
    const items = src.parse(RSS_SAMPLE, { since: 0, limit: 1 });
    expect(items).toHaveLength(1);
  });

  test("derives source name from host when not provided", () => {
    const src = new RssSource({
      url: "https://www.stratechery.com/feed",
    });
    const items = src.parse(RSS_SAMPLE, { since: 0 });
    expect(items[0]?.source).toBe("stratechery.com");
  });

  test("uses explicit name when provided", () => {
    const src = new RssSource({
      url: "https://example.com/feed",
      name: "my-feed",
    });
    const items = src.parse(RSS_SAMPLE, { since: 0 });
    expect(items[0]?.source).toBe("my-feed");
  });

  test("source id includes url", () => {
    const src = new RssSource({ url: "https://x.com/feed" });
    expect(src.id).toBe("rss:https://x.com/feed");
  });
});

describe("RssSource parse (atom)", () => {
  test("parses atom entries", () => {
    const src = new RssSource({ url: "https://atom.example.com/feed" });
    const items = src.parse(ATOM_SAMPLE, { since: 0 });
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe("Atom One");
    expect(items[0]?.url).toBe("https://atom.example.com/one");
    expect(items[0]?.sourceKind).toBe("atom");
  });

  test("extracts atom author name from nested object", () => {
    const src = new RssSource({ url: "https://atom.example.com/feed" });
    const items = src.parse(ATOM_SAMPLE, { since: 0 });
    expect(items[0]?.author).toBe("Bob");
  });

  test("handles atom link with rel=alternate", () => {
    const src = new RssSource({ url: "https://atom.example.com/feed" });
    const items = src.parse(ATOM_SAMPLE, { since: 0 });
    expect(items[1]?.url).toBe("https://atom.example.com/two");
  });

  test("uses updated as fallback when published missing", () => {
    const src = new RssSource({ url: "https://atom.example.com/feed" });
    const items = src.parse(ATOM_SAMPLE, { since: 0 });
    const updated = Date.parse("2022-02-01T00:00:00Z");
    expect(items[1]?.publishedAt).toBe(updated);
  });
});

describe("RssSource fetch with mocked fetcher", () => {
  test("calls fetcher with url and ua", async () => {
    let capturedUrl: string | undefined;
    let capturedHeaders: HeadersInit | undefined;

    const mockFetcher: typeof fetch = async (url, init) => {
      capturedUrl = url.toString();
      capturedHeaders = init?.headers;
      return new Response(RSS_SAMPLE, { status: 200 });
    };

    const src = new RssSource({ url: "https://example.com/feed" });
    const items = await src.fetch({ since: 0, fetcher: mockFetcher });

    expect(capturedUrl).toBe("https://example.com/feed");
    expect(items).toHaveLength(2);
    const headers = capturedHeaders as Record<string, string>;
    expect(headers["user-agent"]).toContain("digestd");
  });

  test("throws SourceError on non-2xx", async () => {
    const mockFetcher: typeof fetch = async () =>
      new Response("nope", { status: 404 });
    const src = new RssSource({ url: "https://example.com/feed" });
    await expect(src.fetch({ since: 0, fetcher: mockFetcher })).rejects.toThrow();
  });

  test("throws on malformed xml", async () => {
    const mockFetcher: typeof fetch = async () =>
      new Response("<not rss />", { status: 200 });
    const src = new RssSource({ url: "https://example.com/feed" });
    await expect(src.fetch({ since: 0, fetcher: mockFetcher })).rejects.toThrow();
  });
});
