import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Item } from "../core/types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS seen_items (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seen_last ON seen_items(last_seen);
CREATE INDEX IF NOT EXISTS idx_seen_source ON seen_items(source);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  items_fetched INTEGER NOT NULL DEFAULT 0,
  items_new INTEGER NOT NULL DEFAULT 0,
  errors TEXT
);

CREATE TABLE IF NOT EXISTS relevance_scores (
  item_id TEXT PRIMARY KEY,
  score REAL NOT NULL,
  reason TEXT,
  preferences_hash TEXT NOT NULL,
  scored_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relevance_prefs ON relevance_scores(preferences_hash);
`;

export interface RunRecord {
  id: number;
  startedAt: number;
  finishedAt?: number;
  itemsFetched: number;
  itemsNew: number;
  errors?: string;
}

export class State {
  private readonly db: Database;

  constructor(path: string) {
    const absolute = resolve(path);
    mkdirSync(dirname(absolute), { recursive: true });
    this.db = new Database(absolute);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // returns the subset of items that have never been seen before.
  // also records all of them as seen.
  filterUnseen(items: Item[], now: number = Date.now()): Item[] {
    if (items.length === 0) return [];

    const unseen: Item[] = [];
    const seenStmt = this.db.prepare("SELECT id FROM seen_items WHERE id = ?");
    const insertStmt = this.db.prepare(
      "INSERT INTO seen_items (id, url, title, source, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const updateStmt = this.db.prepare(
      "UPDATE seen_items SET last_seen = ? WHERE id = ?",
    );

    const tx = this.db.transaction((batch: Item[]) => {
      for (const item of batch) {
        const existing = seenStmt.get(item.id);
        if (existing) {
          updateStmt.run(now, item.id);
        } else {
          insertStmt.run(item.id, item.url, item.title, item.source, now, now);
          unseen.push(item);
        }
      }
    });
    tx(items);

    return unseen;
  }

  // start a run, returns run id
  startRun(now: number = Date.now()): number {
    const stmt = this.db.prepare(
      "INSERT INTO runs (started_at, items_fetched, items_new) VALUES (?, 0, 0)",
    );
    const info = stmt.run(now);
    return Number(info.lastInsertRowid);
  }

  finishRun(
    runId: number,
    update: { itemsFetched: number; itemsNew: number; errors?: string[] },
    now: number = Date.now(),
  ): void {
    const errors = update.errors && update.errors.length > 0
      ? JSON.stringify(update.errors)
      : null;
    this.db
      .prepare(
        "UPDATE runs SET finished_at = ?, items_fetched = ?, items_new = ?, errors = ? WHERE id = ?",
      )
      .run(now, update.itemsFetched, update.itemsNew, errors, runId);
  }

  // for testing / debugging
  countSeen(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM seen_items").get() as {
      c: number;
    };
    return row.c;
  }

  recentRuns(limit = 10): RunRecord[] {
    const rows = this.db
      .prepare(
        "SELECT id, started_at, finished_at, items_fetched, items_new, errors FROM runs ORDER BY id DESC LIMIT ?",
      )
      .all(limit) as Array<{
      id: number;
      started_at: number;
      finished_at: number | null;
      items_fetched: number;
      items_new: number;
      errors: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      finishedAt: r.finished_at ?? undefined,
      itemsFetched: r.items_fetched,
      itemsNew: r.items_new,
      errors: r.errors ?? undefined,
    }));
  }

  // relevance cache - keyed by item id AND a hash of preferences.
  // when the user changes their preferences, scores are re-computed.
  getRelevance(itemId: string, preferencesHash: string):
    | { score: number; reason?: string }
    | undefined {
    const row = this.db
      .prepare(
        "SELECT score, reason FROM relevance_scores WHERE item_id = ? AND preferences_hash = ?",
      )
      .get(itemId, preferencesHash) as
      | { score: number; reason: string | null }
      | undefined;
    if (!row) return undefined;
    return { score: row.score, reason: row.reason ?? undefined };
  }

  setRelevance(
    itemId: string,
    score: number,
    preferencesHash: string,
    reason?: string,
    now: number = Date.now(),
  ): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO relevance_scores (item_id, score, reason, preferences_hash, scored_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(itemId, score, reason ?? null, preferencesHash, now);
  }

  countScored(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as c FROM relevance_scores")
      .get() as { c: number };
    return row.c;
  }
}
