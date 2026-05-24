import { test, expect, describe } from "bun:test";
import { normalize, stripHtml, cleanText } from "../src/core/normalize.ts";
import type { RawItem } from "../src/core/types.ts";

describe("cleanText", () => {
  test("collapses whitespace", () => {
    expect(cleanText("  hello   world  ")).toBe("hello world");
  });

  test("handles newlines and tabs", () => {
    expect(cleanText("line\n\tone\n  two")).toBe("line one two");
  });
});

describe("stripHtml", () => {
  test("removes tags", () => {
    expect(stripHtml("<p>hello <b>world</b></p>")).toBe("hello world");
  });

  test("decodes common entities", () => {
    expect(stripHtml("a &amp; b")).toBe("a & b");
    expect(stripHtml("a &lt; b")).toBe("a < b");
    expect(stripHtml("&quot;quoted&quot;")).toBe('"quoted"');
    expect(stripHtml("&nbsp;spaced")).toBe("spaced");
  });

  test("decodes numeric entities", () => {
    expect(stripHtml("&#65;&#66;&#67;")).toBe("ABC");
  });

  test("strips script and style blocks", () => {
    expect(stripHtml("<p>hi</p><script>alert(1)</script>")).toBe("hi");
    expect(stripHtml("<p>hi</p><style>p{color:red}</style>")).toBe("hi");
  });

  test("handles nested tags", () => {
    expect(stripHtml("<div><p>a</p><p>b</p></div>")).toBe("a b");
  });
});

describe("normalize", () => {
  const raw: RawItem = {
    title: "  Some Title  ",
    url: "https://example.com/post",
    source: "example",
    sourceKind: "rss",
    summary: "<p>An <strong>html</strong> summary.</p>",
    publishedAt: 1700000000000,
  };

  test("produces stable id from url", () => {
    const a = normalize(raw, 1700000000000);
    const b = normalize(raw, 1700000000000);
    expect(a.id).toBe(b.id);
  });

  test("trims title", () => {
    const item = normalize(raw, 1700000000000);
    expect(item.title).toBe("Some Title");
  });

  test("strips html from summary", () => {
    const item = normalize(raw, 1700000000000);
    expect(item.summary).toBe("An html summary.");
  });

  test("sets fetchedAt to now", () => {
    const item = normalize(raw, 1700000000000);
    expect(item.fetchedAt).toBe(1700000000000);
  });

  test("publishedAt falls back to now when missing", () => {
    const item = normalize({ ...raw, publishedAt: undefined }, 999);
    expect(item.publishedAt).toBe(999);
  });

  test("preserves score and comments fields", () => {
    const item = normalize({
      ...raw,
      score: 42,
      commentsCount: 7,
      commentsUrl: "https://hn.example/item?id=1",
    });
    expect(item.score).toBe(42);
    expect(item.commentsCount).toBe(7);
    expect(item.commentsUrl).toBe("https://hn.example/item?id=1");
  });
});
