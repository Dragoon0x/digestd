import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { State } from "../src/state/db.ts";
import type { Item } from "../src/core/types.ts";

function makeItem(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    source: overrides.source ?? "test",
    sourceKind: "rss",
    title: overrides.title ?? "title-" + id,
    url: overrides.url ?? "https://example.com/" + id,
    publishedAt: overrides.publishedAt ?? Date.now(),
    fetchedAt: overrides.fetchedAt ?? Date.now(),
  };
}

let tmpDir: string;
let dbPath: string;
let counter = 0;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "digestd-state-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function freshState(): State {
  counter++;
  dbPath = join(tmpDir, `state-${counter}.db`);
  return new State(dbPath);
}

describe("State.filterUnseen", () => {
  test("first call returns all items as unseen", () => {
    const s = freshState();
    const items = [makeItem("a"), makeItem("b"), makeItem("c")];
    const unseen = s.filterUnseen(items);
    expect(unseen).toHaveLength(3);
    s.close();
  });

  test("second call returns nothing for same items", () => {
    const s = freshState();
    const items = [makeItem("a"), makeItem("b")];
    s.filterUnseen(items);
    const unseen = s.filterUnseen(items);
    expect(unseen).toHaveLength(0);
    s.close();
  });

  test("only new items appear on subsequent calls", () => {
    const s = freshState();
    s.filterUnseen([makeItem("a"), makeItem("b")]);
    const next = s.filterUnseen([
      makeItem("b"),
      makeItem("c"),
      makeItem("d"),
    ]);
    expect(next.map((i) => i.id).sort()).toEqual(["c", "d"]);
    s.close();
  });

  test("count seen accumulates correctly", () => {
    const s = freshState();
    s.filterUnseen([makeItem("a"), makeItem("b")]);
    s.filterUnseen([makeItem("c")]);
    expect(s.countSeen()).toBe(3);
    s.close();
  });

  test("empty input returns empty", () => {
    const s = freshState();
    expect(s.filterUnseen([])).toEqual([]);
    s.close();
  });

  test("persists across instances", () => {
    const path = join(tmpDir, "persist.db");
    const s1 = new State(path);
    s1.filterUnseen([makeItem("a")]);
    s1.close();

    const s2 = new State(path);
    const unseen = s2.filterUnseen([makeItem("a"), makeItem("b")]);
    expect(unseen.map((i) => i.id)).toEqual(["b"]);
    s2.close();
  });
});

describe("State runs", () => {
  test("startRun returns increasing ids", () => {
    const s = freshState();
    const a = s.startRun();
    const b = s.startRun();
    expect(b).toBeGreaterThan(a);
    s.close();
  });

  test("finishRun records counts and finished_at", () => {
    const s = freshState();
    const id = s.startRun(1000);
    s.finishRun(
      id,
      { itemsFetched: 10, itemsNew: 3, errors: [] },
      2000,
    );
    const runs = s.recentRuns();
    expect(runs[0]?.itemsFetched).toBe(10);
    expect(runs[0]?.itemsNew).toBe(3);
    expect(runs[0]?.finishedAt).toBe(2000);
    s.close();
  });

  test("errors are stored as json", () => {
    const s = freshState();
    const id = s.startRun();
    s.finishRun(id, {
      itemsFetched: 0,
      itemsNew: 0,
      errors: ["source-a: failed", "source-b: timeout"],
    });
    const runs = s.recentRuns();
    expect(runs[0]?.errors).toContain("source-a");
    expect(runs[0]?.errors).toContain("source-b");
    s.close();
  });

  test("recentRuns is reverse chronological", () => {
    const s = freshState();
    const a = s.startRun();
    const b = s.startRun();
    const c = s.startRun();
    const runs = s.recentRuns();
    expect(runs.map((r) => r.id)).toEqual([c, b, a]);
    s.close();
  });
});
