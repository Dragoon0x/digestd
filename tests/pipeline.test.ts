import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPipeline } from "../src/pipeline.ts";

let tmpDir: string;
let counter = 0;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "digestd-pipe-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Test</title>
  <link>https://example.com</link>
  <description>x</description>
  <item>
    <title>Post One</title>
    <link>https://example.com/1</link>
    <pubDate>${new Date().toUTCString()}</pubDate>
  </item>
  <item>
    <title>Post Two</title>
    <link>https://example.com/2</link>
    <pubDate>${new Date().toUTCString()}</pubDate>
  </item>
</channel></rss>`;

describe("runPipeline", () => {
  test("produces digest with items from rss source", async () => {
    counter++;
    const dbPath = join(tmpDir, `pipe-${counter}.db`);
    const outPath = join(tmpDir, `pipe-${counter}.md`);

    // monkey-patch global fetch for this test
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(SAMPLE_RSS, { status: 200 })) as typeof fetch;

    try {
      const result = await runPipeline({
        config: {
          window: { hours: 168 },
          sources: { rss: ["https://example.com/feed"] },
          deliver: [{ type: "file", path: outPath }],
        },
        stateDbPath: dbPath,
        ignoreState: true,
      });

      expect(result.digest.items.length).toBeGreaterThan(0);
      expect(result.deliveries).toHaveLength(1);

      const written = await readFile(result.deliveries[0]!.path, "utf-8");
      expect(written).toContain("Post One");
      expect(written).toContain("Post Two");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("second run with state returns no new items", async () => {
    counter++;
    const dbPath = join(tmpDir, `pipe-${counter}.db`);
    const outPath = join(tmpDir, `pipe-${counter}.md`);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(SAMPLE_RSS, { status: 200 })) as typeof fetch;

    try {
      const first = await runPipeline({
        config: {
          sources: { rss: ["https://example.com/feed"] },
          deliver: [{ type: "file", path: outPath }],
        },
        stateDbPath: dbPath,
      });
      expect(first.digest.items.length).toBeGreaterThan(0);

      const second = await runPipeline({
        config: {
          sources: { rss: ["https://example.com/feed"] },
          deliver: [{ type: "file", path: outPath }],
        },
        stateDbPath: dbPath,
      });
      expect(second.digest.items).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("records errors per source without failing whole run", async () => {
    counter++;
    const dbPath = join(tmpDir, `pipe-${counter}.db`);
    const outPath = join(tmpDir, `pipe-${counter}.md`);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("good")) return new Response(SAMPLE_RSS, { status: 200 });
      return new Response("err", { status: 500 });
    }) as typeof fetch;

    try {
      const result = await runPipeline({
        config: {
          sources: {
            rss: [
              "https://example.com/good",
              "https://example.com/bad",
            ],
          },
          deliver: [{ type: "file", path: outPath }],
        },
        stateDbPath: dbPath,
        ignoreState: true,
      });

      expect(result.errors.length).toBe(1);
      expect(result.digest.items.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("empty sources produces empty digest", async () => {
    counter++;
    const dbPath = join(tmpDir, `pipe-${counter}.db`);
    const outPath = join(tmpDir, `pipe-${counter}.md`);

    const result = await runPipeline({
      config: {
        sources: {},
        deliver: [{ type: "file", path: outPath }],
      },
      stateDbPath: dbPath,
    });

    expect(result.digest.items).toHaveLength(0);
    expect(result.deliveries).toHaveLength(1);
    const written = await readFile(result.deliveries[0]!.path, "utf-8");
    expect(written).toContain("nothing to digest");
  });
});
