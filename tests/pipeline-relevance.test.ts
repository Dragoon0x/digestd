import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPipeline } from "../src/pipeline.ts";

let tmpDir: string;
let counter = 0;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "digestd-pipe-relevance-"));
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
    <title>Rust is great</title>
    <link>https://example.com/rust</link>
    <pubDate>${new Date().toUTCString()}</pubDate>
    <description>Why rust is the future</description>
  </item>
  <item>
    <title>Celebrity gossip</title>
    <link>https://example.com/gossip</link>
    <pubDate>${new Date().toUTCString()}</pubDate>
    <description>Who wore what</description>
  </item>
  <item>
    <title>TypeScript tips</title>
    <link>https://example.com/ts</link>
    <pubDate>${new Date().toUTCString()}</pubDate>
    <description>Better generics</description>
  </item>
</channel></rss>`;

// fake anthropic response: scores rust and typescript high, gossip low
const FAKE_ANTHROPIC = (urls: string[]) => ({
  content: [
    {
      type: "text",
      text: JSON.stringify(
        urls.map((url) => {
          const score = url.includes("gossip") ? 1 : 9;
          return { id: idFromUrl(url), score };
        }),
      ),
    },
  ],
});

function idFromUrl(url: string): string {
  // mirror the itemId function approximately - for the test we extract by url
  // actually we cannot mirror it here without importing. Instead we'll set up
  // the test to make the fake provider score whatever it sees.
  return url;
}

describe("pipeline with relevance scoring", () => {
  test("filters items based on llm scores", async () => {
    counter++;
    const dbPath = join(tmpDir, `pipe-${counter}.db`);
    const outPath = join(tmpDir, `pipe-${counter}.md`);

    const originalFetch = globalThis.fetch;
    // intercept BOTH the rss fetch and the anthropic api fetch
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = url.toString();
      if (u.includes("anthropic.com")) {
        // parse the prompt to extract item ids the model was asked to score
        const body = JSON.parse((init?.body as string) ?? "{}");
        const userMsg = body.messages?.[0]?.content ?? "";
        const idLines = (userMsg.match(/id: ([a-f0-9]+)/g) ?? []) as string[];
        const ids = idLines.map((l) => l.replace("id: ", ""));
        // score each: high unless the prompt block for that id contains "gossip"
        const scored = ids.map((id) => {
          const block = userMsg
            .split("---")
            .find((b: string) => b.includes(`id: ${id}`));
          const score = block?.toLowerCase().includes("gossip") ? 1 : 9;
          return { id, score };
        });
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: JSON.stringify(scored) }],
          }),
          { status: 200 },
        );
      }
      return new Response(SAMPLE_RSS, { status: 200 });
    }) as typeof fetch;

    // set the env var the registry looks for
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-test";

    try {
      const result = await runPipeline({
        config: {
          sources: { rss: ["https://example.com/feed"] },
          deliver: [{ type: "file", path: outPath }],
          relevance: {
            enabled: true,
            preferences:
              "I care about programming languages, especially rust and typescript. Skip celebrity gossip.",
            threshold: 0.5,
          },
          llm: { provider: "anthropic" },
        },
        stateDbPath: dbPath,
        ignoreState: true,
      });

      expect(result.digest.items.length).toBe(2);
      const titles = result.digest.items.map((i) => i.title).sort();
      expect(titles).not.toContain("Celebrity gossip");
      expect(titles).toContain("Rust is great");
      expect(titles).toContain("TypeScript tips");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  test("relevance with passthrough on error keeps items", async () => {
    counter++;
    const dbPath = join(tmpDir, `pipe-${counter}.db`);
    const outPath = join(tmpDir, `pipe-${counter}.md`);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("anthropic.com")) {
        return new Response("err", { status: 500 });
      }
      return new Response(SAMPLE_RSS, { status: 200 });
    }) as typeof fetch;

    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-test";

    try {
      const result = await runPipeline({
        config: {
          sources: { rss: ["https://example.com/feed"] },
          deliver: [{ type: "file", path: outPath }],
          relevance: {
            enabled: true,
            preferences: "stuff",
            onError: "passthrough",
          },
        },
        stateDbPath: dbPath,
        ignoreState: true,
      });

      // all 3 items kept despite llm errors
      expect(result.digest.items.length).toBe(3);
      expect(result.relevanceErrors?.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  test("relevance disabled = no llm calls", async () => {
    counter++;
    const dbPath = join(tmpDir, `pipe-${counter}.db`);
    const outPath = join(tmpDir, `pipe-${counter}.md`);

    let anthropicCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("anthropic.com")) {
        anthropicCalled = true;
      }
      return new Response(SAMPLE_RSS, { status: 200 });
    }) as typeof fetch;

    try {
      const result = await runPipeline({
        config: {
          sources: { rss: ["https://example.com/feed"] },
          deliver: [{ type: "file", path: outPath }],
          relevance: {
            enabled: false,
            preferences: "stuff",
          },
        },
        stateDbPath: dbPath,
        ignoreState: true,
      });

      expect(anthropicCalled).toBe(false);
      expect(result.digest.items.length).toBe(3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
