import { test, expect, describe } from "bun:test";
import {
  buildBatchPrompt,
  parseBatchResponse,
  scoreItems,
  InMemoryCache,
} from "../src/filter/relevance.ts";
import type { LlmMessage, LlmProvider } from "../src/llm/types.ts";
import type { Item } from "../src/core/types.ts";

function makeItem(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    source: overrides.source ?? "test",
    sourceKind: "rss",
    title: overrides.title ?? `title-${id}`,
    url: overrides.url ?? `https://example.com/${id}`,
    publishedAt: overrides.publishedAt ?? Date.now(),
    fetchedAt: Date.now(),
    summary: overrides.summary,
  };
}

class FakeProvider implements LlmProvider {
  readonly name = "fake";
  readonly defaultModel = "fake-model";
  public calls = 0;
  public lastMessages: LlmMessage[] = [];

  constructor(private readonly responder: (messages: LlmMessage[]) => string) {}

  async complete(messages: LlmMessage[]): Promise<string> {
    this.calls++;
    this.lastMessages = messages;
    return this.responder(messages);
  }
}

describe("buildBatchPrompt", () => {
  test("includes preferences and item ids", () => {
    const prompt = buildBatchPrompt(
      [makeItem("aaa"), makeItem("bbb")],
      "I like rust",
    );
    expect(prompt).toContain("I like rust");
    expect(prompt).toContain("aaa");
    expect(prompt).toContain("bbb");
  });

  test("truncates very long summaries", () => {
    const longSummary = "x".repeat(2000);
    const prompt = buildBatchPrompt(
      [makeItem("aaa", { summary: longSummary })],
      "stuff",
    );
    // expect a truncation marker
    expect(prompt).toContain("…");
    // and the summary section should be far shorter than the input
    expect(prompt.length).toBeLessThan(longSummary.length);
  });
});

describe("parseBatchResponse", () => {
  test("parses a clean JSON array response", () => {
    const items = [makeItem("a"), makeItem("b")];
    const response = JSON.stringify([
      { id: "a", score: 8, reason: "yes" },
      { id: "b", score: 2, reason: "no" },
    ]);
    const scores = parseBatchResponse(response, items);
    expect(scores).toHaveLength(2);
    expect(scores.find((s) => s.itemId === "a")?.score).toBe(0.8);
    expect(scores.find((s) => s.itemId === "b")?.score).toBe(0.2);
  });

  test("handles preamble and postamble around JSON", () => {
    const items = [makeItem("a")];
    const response = `Sure, here are the scores:\n\n[{"id":"a","score":7,"reason":"ok"}]\n\nLet me know if you need more.`;
    const scores = parseBatchResponse(response, items);
    expect(scores).toHaveLength(1);
    expect(scores[0]?.score).toBe(0.7);
  });

  test("handles markdown code fences", () => {
    const items = [makeItem("a")];
    const response = "```json\n[{\"id\":\"a\",\"score\":10}]\n```";
    const scores = parseBatchResponse(response, items);
    expect(scores).toHaveLength(1);
    expect(scores[0]?.score).toBe(1);
  });

  test("clamps scores above 10", () => {
    const items = [makeItem("a")];
    const response = JSON.stringify([{ id: "a", score: 99 }]);
    const scores = parseBatchResponse(response, items);
    expect(scores[0]?.score).toBe(1);
  });

  test("clamps negative scores", () => {
    const items = [makeItem("a")];
    const response = JSON.stringify([{ id: "a", score: -5 }]);
    const scores = parseBatchResponse(response, items);
    expect(scores[0]?.score).toBe(0);
  });

  test("ignores ids not in batch", () => {
    const items = [makeItem("a")];
    const response = JSON.stringify([
      { id: "a", score: 5 },
      { id: "unknown", score: 9 },
    ]);
    const scores = parseBatchResponse(response, items);
    expect(scores).toHaveLength(1);
    expect(scores[0]?.itemId).toBe("a");
  });

  test("throws on non-array response", () => {
    const items = [makeItem("a")];
    expect(() => parseBatchResponse(`{"foo": "bar"}`, items)).toThrow();
  });

  test("throws when no array is found", () => {
    const items = [makeItem("a")];
    expect(() => parseBatchResponse("no json here", items)).toThrow();
  });
});

describe("scoreItems", () => {
  test("scores items in batches and partitions by threshold", async () => {
    const items = [
      makeItem("a", { title: "great" }),
      makeItem("b", { title: "ok" }),
      makeItem("c", { title: "bad" }),
    ];

    const provider = new FakeProvider(() =>
      JSON.stringify([
        { id: "a", score: 9 },
        { id: "b", score: 5 },
        { id: "c", score: 1 },
      ]),
    );

    const cache = new InMemoryCache();
    const result = await scoreItems(
      items,
      { preferences: "tech", threshold: 0.5 },
      provider,
      cache,
    );

    expect(provider.calls).toBe(1);
    expect(result.kept.map((i) => i.id).sort()).toEqual(["a", "b"]);
    expect(result.dropped.map((i) => i.id)).toEqual(["c"]);
  });

  test("uses cache to avoid re-scoring", async () => {
    const items = [makeItem("a"), makeItem("b")];
    const cache = new InMemoryCache();
    cache.set({ itemId: "a", score: 0.9 });
    cache.set({ itemId: "b", score: 0.1 });

    const provider = new FakeProvider(() => {
      throw new Error("should not be called");
    });

    const result = await scoreItems(
      items,
      { preferences: "tech", threshold: 0.5 },
      provider,
      cache,
    );

    expect(provider.calls).toBe(0);
    expect(result.kept.map((i) => i.id)).toEqual(["a"]);
  });

  test("partial cache - only scores new items", async () => {
    const items = [makeItem("a"), makeItem("b"), makeItem("c")];
    const cache = new InMemoryCache();
    cache.set({ itemId: "a", score: 0.9 });

    const provider = new FakeProvider(() =>
      JSON.stringify([
        { id: "b", score: 7 },
        { id: "c", score: 2 },
      ]),
    );

    const result = await scoreItems(
      items,
      { preferences: "tech", threshold: 0.5 },
      provider,
      cache,
    );

    expect(provider.calls).toBe(1);
    expect(result.kept.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  test("respects batchSize", async () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem(`item-${i}`));
    const provider = new FakeProvider(() => {
      // return scores for all ids that were in the last messages call
      const userMsg = provider.lastMessages.find((m) => m.role === "user");
      const idMatches = (userMsg?.content ?? "").match(/id: (item-\d+)/g) ?? [];
      const ids = idMatches.map((s) => s.replace("id: ", ""));
      return JSON.stringify(ids.map((id) => ({ id, score: 8 })));
    });

    const result = await scoreItems(
      items,
      { preferences: "stuff", batchSize: 2 },
      provider,
      new InMemoryCache(),
    );

    expect(provider.calls).toBe(3); // ceil(5/2)
    expect(result.kept).toHaveLength(5);
  });

  test("passthrough on error includes items", async () => {
    const items = [makeItem("a"), makeItem("b")];
    const provider = new FakeProvider(() => {
      throw new Error("network down");
    });

    const result = await scoreItems(
      items,
      { preferences: "x", onError: "passthrough" },
      provider,
      new InMemoryCache(),
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.kept).toHaveLength(2);
  });

  test("exclude on error drops items", async () => {
    const items = [makeItem("a"), makeItem("b")];
    const provider = new FakeProvider(() => {
      throw new Error("boom");
    });

    const result = await scoreItems(
      items,
      { preferences: "x", onError: "exclude" },
      provider,
      new InMemoryCache(),
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.kept).toHaveLength(0);
  });

  test("empty input returns empty", async () => {
    const provider = new FakeProvider(() => "");
    const result = await scoreItems(
      [],
      { preferences: "x" },
      provider,
      new InMemoryCache(),
    );
    expect(result.kept).toHaveLength(0);
    expect(provider.calls).toBe(0);
  });
});
