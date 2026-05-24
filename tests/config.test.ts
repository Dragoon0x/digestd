import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadConfig,
  mergeConfig,
  renderTemplate,
  DEFAULT_CONFIG,
} from "../src/core/config.ts";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "digestd-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  test("loads a minimal yaml", async () => {
    const path = join(tmpDir, "min.yaml");
    await writeFile(
      path,
      `sources:
  rss:
    - https://example.com/feed
deliver:
  - type: file
    path: ./out.md
`,
    );
    const c = await loadConfig(path);
    expect(c.sources.rss).toEqual(["https://example.com/feed"]);
    expect(c.deliver).toEqual([{ type: "file", path: "./out.md" }]);
  });

  test("applies defaults for window", async () => {
    const path = join(tmpDir, "no-window.yaml");
    await writeFile(path, `sources: {}\ndeliver: []`);
    const c = await loadConfig(path);
    expect(c.window?.hours).toBe(168);
  });

  test("overrides window when present", async () => {
    const path = join(tmpDir, "custom-window.yaml");
    await writeFile(
      path,
      `window:\n  hours: 24\nsources: {}\ndeliver: []`,
    );
    const c = await loadConfig(path);
    expect(c.window?.hours).toBe(24);
  });

  test("handles hackernews shorthand", async () => {
    const path = join(tmpDir, "hn-short.yaml");
    await writeFile(
      path,
      `sources:\n  hackernews: true\ndeliver: []`,
    );
    const c = await loadConfig(path);
    expect(c.sources.hackernews).toBe(true);
  });

  test("handles hackernews with options", async () => {
    const path = join(tmpDir, "hn-opts.yaml");
    await writeFile(
      path,
      `sources:\n  hackernews:\n    feed: best\n    minScore: 50\ndeliver: []`,
    );
    const c = await loadConfig(path);
    expect(c.sources.hackernews).toEqual({ feed: "best", minScore: 50 });
  });
});

describe("mergeConfig", () => {
  test("override wins for present keys", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      window: { hours: 24 },
    });
    expect(merged.window?.hours).toBe(24);
  });

  test("base wins for absent keys", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {});
    expect(merged.window?.hours).toBe(168);
  });

  test("deliver array is replaced not merged", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      deliver: [{ type: "file", path: "x.md" }],
    });
    expect(merged.deliver).toHaveLength(1);
    expect(merged.deliver[0]?.path).toBe("x.md");
  });
});

describe("renderTemplate", () => {
  test("substitutes named variables", () => {
    expect(renderTemplate("hello {{name}}", { name: "world" })).toBe(
      "hello world",
    );
  });

  test("handles multiple vars", () => {
    expect(
      renderTemplate("{{a}}/{{b}}", { a: "1", b: "2" }),
    ).toBe("1/2");
  });

  test("empty for unknown vars", () => {
    expect(renderTemplate("x {{missing}} y", {})).toBe("x  y");
  });

  test("leaves text without vars alone", () => {
    expect(renderTemplate("plain text", {})).toBe("plain text");
  });
});
