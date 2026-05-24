import { test, expect, describe } from "bun:test";
import {
  dedupe,
  jaccardBigrams,
  normalizeTitle,
} from "../src/filter/dedupe.ts";
import type { Item } from "../src/core/types.ts";

function makeItem(overrides: Partial<Item>): Item {
  return {
    id: overrides.id ?? "id-" + Math.random(),
    source: overrides.source ?? "test",
    sourceKind: overrides.sourceKind ?? "rss",
    title: overrides.title ?? "title",
    url: overrides.url ?? "https://example.com/" + Math.random(),
    publishedAt: overrides.publishedAt ?? Date.now(),
    fetchedAt: overrides.fetchedAt ?? Date.now(),
    score: overrides.score,
    summary: overrides.summary,
  };
}

describe("normalizeTitle", () => {
  test("lowercases and strips punctuation", () => {
    expect(normalizeTitle("Hello, World!")).toBe("hello world");
  });

  test("collapses multiple spaces", () => {
    expect(normalizeTitle("a   b  c")).toBe("a b c");
  });

  test("strips quotes and slashes", () => {
    expect(normalizeTitle(`"quoted" / slashed`)).toBe("quoted slashed");
  });
});

describe("jaccardBigrams", () => {
  test("identical strings score 1", () => {
    expect(jaccardBigrams("hello world today", "hello world today")).toBe(1);
  });

  test("disjoint strings score 0", () => {
    expect(jaccardBigrams("apple banana cherry", "xenon yttrium zinc")).toBe(0);
  });

  test("partial overlap scores between 0 and 1", () => {
    const s = jaccardBigrams("the cat sat", "the cat ran");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  test("empty strings score 0", () => {
    expect(jaccardBigrams("", "anything here")).toBe(0);
    expect(jaccardBigrams("", "")).toBe(0);
  });

  test("near-duplicate titles score high", () => {
    const a = normalizeTitle("OpenAI announces new model called GPT-5");
    const b = normalizeTitle("OpenAI announces new model: GPT-5!");
    expect(jaccardBigrams(a, b)).toBeGreaterThan(0.7);
  });
});

describe("dedupe", () => {
  test("removes items with duplicate ids", () => {
    const items = [
      makeItem({ id: "x", title: "one" }),
      makeItem({ id: "x", title: "one (duplicate)" }),
      makeItem({ id: "y", title: "two" }),
    ];
    const out = dedupe(items);
    expect(out).toHaveLength(2);
    const ids = out.map((i) => i.id).sort();
    expect(ids).toEqual(["x", "y"]);
  });

  test("keeps higher-scored version of duplicate id", () => {
    const items = [
      makeItem({ id: "x", title: "one", score: 10 }),
      makeItem({ id: "x", title: "one", score: 100 }),
    ];
    const out = dedupe(items);
    expect(out).toHaveLength(1);
    expect(out[0]?.score).toBe(100);
  });

  test("removes near-duplicate titles", () => {
    const items = [
      makeItem({
        id: "a",
        title: "OpenAI announces new model called GPT-5",
        score: 200,
      }),
      makeItem({
        id: "b",
        title: "OpenAI announces new model: GPT-5",
        score: 50,
      }),
    ];
    const out = dedupe(items);
    expect(out).toHaveLength(1);
    // higher scored one wins (sorted desc before pass)
    expect(out[0]?.id).toBe("a");
  });

  test("keeps clearly different titles", () => {
    const items = [
      makeItem({ id: "a", title: "tornadoes in oklahoma" }),
      makeItem({ id: "b", title: "rust 2.0 release notes" }),
    ];
    expect(dedupe(items)).toHaveLength(2);
  });

  test("threshold parameter changes strictness", () => {
    const items = [
      makeItem({ id: "a", title: "the new framework rocks", score: 100 }),
      makeItem({ id: "b", title: "the new framework lacks", score: 50 }),
    ];
    // strict threshold keeps both
    expect(dedupe(items, { titleThreshold: 0.95 })).toHaveLength(2);
    // loose threshold may collapse them
    const loose = dedupe(items, { titleThreshold: 0.4 });
    expect(loose.length).toBeLessThanOrEqual(2);
  });

  test("empty input returns empty", () => {
    expect(dedupe([])).toEqual([]);
  });
});
