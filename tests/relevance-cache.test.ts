import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { State } from "../src/state/db.ts";

let tmpDir: string;
let counter = 0;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "digestd-relevance-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function fresh(): State {
  counter++;
  return new State(join(tmpDir, `state-${counter}.db`));
}

describe("State relevance cache", () => {
  test("get returns undefined for missing entry", () => {
    const s = fresh();
    expect(s.getRelevance("missing", "hash")).toBeUndefined();
    s.close();
  });

  test("set then get round-trips", () => {
    const s = fresh();
    s.setRelevance("id-a", 0.75, "hash-1", "good match");
    const got = s.getRelevance("id-a", "hash-1");
    expect(got).toEqual({ score: 0.75, reason: "good match" });
    s.close();
  });

  test("returns undefined for different preferences hash", () => {
    const s = fresh();
    s.setRelevance("id-a", 0.9, "hash-1");
    expect(s.getRelevance("id-a", "hash-2")).toBeUndefined();
    s.close();
  });

  test("replace overwrites prior value", () => {
    const s = fresh();
    s.setRelevance("id-a", 0.1, "hash-1");
    s.setRelevance("id-a", 0.9, "hash-1");
    expect(s.getRelevance("id-a", "hash-1")?.score).toBe(0.9);
    s.close();
  });

  test("countScored returns total", () => {
    const s = fresh();
    s.setRelevance("a", 0.5, "h");
    s.setRelevance("b", 0.5, "h");
    expect(s.countScored()).toBe(2);
    s.close();
  });

  test("handles null reason", () => {
    const s = fresh();
    s.setRelevance("a", 0.5, "h"); // no reason arg
    const got = s.getRelevance("a", "h");
    expect(got?.reason).toBeUndefined();
    s.close();
  });

  test("persists across instances", () => {
    const path = join(tmpDir, "persist-rel.db");
    const s1 = new State(path);
    s1.setRelevance("id-x", 0.42, "h", "cached");
    s1.close();

    const s2 = new State(path);
    expect(s2.getRelevance("id-x", "h")?.score).toBe(0.42);
    s2.close();
  });
});
