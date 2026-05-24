import { test, expect, describe } from "bun:test";
import { YouTubeChannelSource } from "../src/sources/youtube.ts";

const YT_ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Channel</title>
  <entry>
    <title>Video One</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
    <published>2024-06-01T00:00:00Z</published>
    <author><name>Channel</name></author>
  </entry>
</feed>`;

describe("YouTubeChannelSource", () => {
  test("id includes channel id", () => {
    const s = new YouTubeChannelSource({ channelId: "UC123" });
    expect(s.id).toBe("youtube:UC123");
  });

  test("constructs correct feed url", async () => {
    let capturedUrl: string | undefined;
    const mockFetcher: typeof fetch = async (url) => {
      capturedUrl = url.toString();
      return new Response(YT_ATOM, { status: 200 });
    };
    const s = new YouTubeChannelSource({ channelId: "UCxyz" });
    await s.fetch({ since: 0, fetcher: mockFetcher });
    expect(capturedUrl).toContain("youtube.com/feeds/videos.xml");
    expect(capturedUrl).toContain("channel_id=UCxyz");
  });

  test("tags items with sourceKind=youtube", async () => {
    const mockFetcher: typeof fetch = async () =>
      new Response(YT_ATOM, { status: 200 });
    const s = new YouTubeChannelSource({ channelId: "UC1" });
    const items = await s.fetch({ since: 0, fetcher: mockFetcher });
    expect(items).toHaveLength(1);
    expect(items[0]?.sourceKind).toBe("youtube");
    expect(items[0]?.title).toBe("Video One");
  });

  test("respects custom name", async () => {
    const mockFetcher: typeof fetch = async () =>
      new Response(YT_ATOM, { status: 200 });
    const s = new YouTubeChannelSource({
      channelId: "UC1",
      name: "marques",
    });
    const items = await s.fetch({ since: 0, fetcher: mockFetcher });
    expect(items[0]?.source).toBe("marques");
  });

  test("derives default name from channel id", async () => {
    const mockFetcher: typeof fetch = async () =>
      new Response(YT_ATOM, { status: 200 });
    const s = new YouTubeChannelSource({ channelId: "UC1" });
    const items = await s.fetch({ since: 0, fetcher: mockFetcher });
    expect(items[0]?.source).toBe("youtube/UC1");
  });

  test("url-encodes the channel id", async () => {
    let capturedUrl: string | undefined;
    const mockFetcher: typeof fetch = async (url) => {
      capturedUrl = url.toString();
      return new Response(YT_ATOM, { status: 200 });
    };
    const s = new YouTubeChannelSource({ channelId: "weird id with spaces" });
    await s.fetch({ since: 0, fetcher: mockFetcher });
    expect(capturedUrl).toContain("weird%20id%20with%20spaces");
  });
});
