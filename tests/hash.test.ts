import { test, expect, describe } from "bun:test";
import { fnv1a64, normalizeUrl, itemId } from "../src/core/hash.ts";

describe("fnv1a64", () => {
  test("produces 16-char hex", () => {
    expect(fnv1a64("hello")).toHaveLength(16);
    expect(fnv1a64("")).toHaveLength(16);
  });

  test("is deterministic", () => {
    expect(fnv1a64("digestd")).toBe(fnv1a64("digestd"));
  });

  test("differs for different inputs", () => {
    expect(fnv1a64("a")).not.toBe(fnv1a64("b"));
  });

  test("handles unicode", () => {
    expect(fnv1a64("café")).toHaveLength(16);
    expect(fnv1a64("🚀")).toHaveLength(16);
  });
});

describe("normalizeUrl", () => {
  test("strips utm parameters", () => {
    const got = normalizeUrl("https://example.com/post?utm_source=rss&utm_campaign=x");
    expect(got).toBe("https://example.com/post");
  });

  test("preserves other query params", () => {
    const got = normalizeUrl("https://example.com/post?id=42&utm_source=rss");
    expect(got).toBe("https://example.com/post?id=42");
  });

  test("strips fragment", () => {
    expect(normalizeUrl("https://example.com/post#section")).toBe(
      "https://example.com/post",
    );
  });

  test("lowercases hostname", () => {
    expect(normalizeUrl("https://EXAMPLE.com/post")).toBe(
      "https://example.com/post",
    );
  });

  test("strips trailing slash from path but not root", () => {
    expect(normalizeUrl("https://example.com/post/")).toBe(
      "https://example.com/post",
    );
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  test("strips fbclid and gclid", () => {
    expect(normalizeUrl("https://x.com/a?fbclid=abc")).toBe("https://x.com/a");
    expect(normalizeUrl("https://x.com/a?gclid=xyz")).toBe("https://x.com/a");
  });

  test("returns input unchanged when not a valid url", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("itemId", () => {
  test("same url yields same id", () => {
    expect(itemId("https://example.com/a")).toBe(itemId("https://example.com/a"));
  });

  test("utm-tracked url matches clean url", () => {
    const a = itemId("https://example.com/post?utm_source=rss");
    const b = itemId("https://example.com/post");
    expect(a).toBe(b);
  });

  test("case-different host yields same id", () => {
    expect(itemId("https://Example.com/a")).toBe(itemId("https://example.com/a"));
  });

  test("different urls yield different ids", () => {
    expect(itemId("https://example.com/a")).not.toBe(
      itemId("https://example.com/b"),
    );
  });

  test("falls back to title-based id when url invalid", () => {
    const id = itemId("", "fallback title");
    expect(id).toHaveLength(16);
  });
});
