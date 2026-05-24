import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BookmarkSource } from "../src/sources/bookmark.ts";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "digestd-bookmark-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeFixture(name: string, data: unknown): Promise<string> {
  const path = join(tmpDir, name);
  await writeFile(path, JSON.stringify(data), "utf-8");
  return path;
}

describe("BookmarkSource", () => {
  test("reads plain array format", async () => {
    const path = await writeFixture("plain.json", [
      {
        title: "An article",
        url: "https://example.com/a",
        author: "alice",
        createdAt: "2024-01-15T00:00:00Z",
      },
    ]);
    const s = new BookmarkSource({ path });
    const items = await s.fetch({ since: 0 });
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("An article");
    expect(items[0]?.author).toBe("alice");
  });

  test("reads {bookmarks: [...]} format", async () => {
    const path = await writeFixture("wrapped.json", {
      bookmarks: [{ title: "X", url: "https://x.com/a" }],
    });
    const items = await new BookmarkSource({ path }).fetch({ since: 0 });
    expect(items).toHaveLength(1);
  });

  test("reads {tweets: [...]} format (twitter export shape)", async () => {
    const path = await writeFixture("tweets.json", {
      tweets: [
        {
          text: "this is the tweet body",
          url: "https://twitter.com/u/status/1",
          username: "bob",
          created_at: "2024-01-15T00:00:00Z",
        },
      ],
    });
    const items = await new BookmarkSource({ path }).fetch({ since: 0 });
    expect(items).toHaveLength(1);
    expect(items[0]?.author).toBe("bob");
    // title derived from text when no explicit title
    expect(items[0]?.title).toContain("this is the tweet body");
  });

  test("skips entries without url", async () => {
    const path = await writeFixture("no-url.json", [
      { title: "no url here", author: "x" },
      { title: "has url", url: "https://x.com/a" },
    ]);
    const items = await new BookmarkSource({ path }).fetch({ since: 0 });
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("has url");
  });

  test("filters by since timestamp", async () => {
    const path = await writeFixture("dated.json", [
      {
        title: "Old",
        url: "https://x.com/old",
        createdAt: "2020-01-01T00:00:00Z",
      },
      {
        title: "Recent",
        url: "https://x.com/recent",
        createdAt: "2024-06-01T00:00:00Z",
      },
    ]);
    const since = Date.parse("2024-01-01T00:00:00Z");
    const items = await new BookmarkSource({ path }).fetch({ since });
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Recent");
  });

  test("parses numeric ms timestamps", async () => {
    const path = await writeFixture("ms.json", [
      {
        title: "ms-stamped",
        url: "https://x.com/a",
        createdAt: 1700000000000,
      },
    ]);
    const items = await new BookmarkSource({ path }).fetch({ since: 0 });
    expect(items[0]?.publishedAt).toBe(1700000000000);
  });

  test("parses numeric seconds timestamps", async () => {
    const path = await writeFixture("sec.json", [
      {
        title: "sec-stamped",
        url: "https://x.com/a",
        createdAt: 1700000000,
      },
    ]);
    const items = await new BookmarkSource({ path }).fetch({ since: 0 });
    expect(items[0]?.publishedAt).toBe(1700000000 * 1000);
  });

  test("derives title from text when title missing", async () => {
    const long = "long tweet text body ".repeat(20);
    const path = await writeFixture("text-only.json", [
      { url: "https://x.com/a", text: long },
    ]);
    const items = await new BookmarkSource({ path }).fetch({ since: 0 });
    expect(items[0]?.title.length).toBeLessThanOrEqual(200);
    expect(items[0]?.title).toContain("long tweet text body");
  });

  test("uses custom name when provided", async () => {
    const path = await writeFixture("named.json", [
      { title: "x", url: "https://x.com/a" },
    ]);
    const items = await new BookmarkSource({
      path,
      name: "my-bookmarks",
    }).fetch({ since: 0 });
    expect(items[0]?.source).toBe("my-bookmarks");
  });

  test("throws when file is missing", async () => {
    const s = new BookmarkSource({ path: "/tmp/nonexistent-digestd.json" });
    await expect(s.fetch({ since: 0 })).rejects.toThrow();
  });

  test("throws when file is not valid json", async () => {
    const path = join(tmpDir, "bad.json");
    await writeFile(path, "{ not json", "utf-8");
    await expect(
      new BookmarkSource({ path }).fetch({ since: 0 }),
    ).rejects.toThrow();
  });
});
