import type { DigestdConfig } from "./core/config.ts";
import type { Digest, Item } from "./core/types.ts";
import { buildSources } from "./sources/registry.ts";
import { normalize } from "./core/normalize.ts";
import { dedupe } from "./filter/dedupe.ts";
import { renderMarkdown } from "./render/markdown.ts";
import { deliverFile } from "./deliver/file.ts";
import { State } from "./state/db.ts";
import { fnv1a64 } from "./core/hash.ts";
import { buildProvider } from "./llm/registry.ts";
import {
  scoreItems,
  type RelevanceCache,
  type RelevanceScore,
} from "./filter/relevance.ts";

export interface PipelineOptions {
  config: DigestdConfig;
  stateDbPath?: string;
  now?: number;
  ignoreState?: boolean;
  log?: (msg: string) => void;
}

export interface PipelineResult {
  digest: Digest;
  rendered: string;
  deliveries: { path: string; bytes: number }[];
  errors: { source: string; message: string }[];
  // for tests and debugging
  relevanceErrors?: string[];
}

// adapter that backs the relevance cache with sqlite, keyed by preferences hash
class SqliteRelevanceCache implements RelevanceCache {
  constructor(
    private readonly state: State,
    private readonly preferencesHash: string,
  ) {}
  get(itemId: string): RelevanceScore | undefined {
    const row = this.state.getRelevance(itemId, this.preferencesHash);
    if (!row) return undefined;
    return { itemId, score: row.score, reason: row.reason };
  }
  set(score: RelevanceScore): void {
    this.state.setRelevance(
      score.itemId,
      score.score,
      this.preferencesHash,
      score.reason,
    );
  }
}

export async function runPipeline(
  options: PipelineOptions,
): Promise<PipelineResult> {
  const log = options.log ?? (() => {});
  const now = options.now ?? Date.now();
  const windowHours = options.config.window?.hours ?? 168;
  const since = now - windowHours * 60 * 60 * 1000;

  const sources = buildSources(options.config.sources);
  log(`built ${sources.length} source(s)`);

  // 1. fetch
  const errors: { source: string; message: string }[] = [];
  const fetchResults = await Promise.allSettled(
    sources.map((s) => s.fetch({ since })),
  );

  const allRaw = [];
  for (let i = 0; i < fetchResults.length; i++) {
    const result = fetchResults[i];
    const source = sources[i];
    if (!result || !source) continue;
    if (result.status === "fulfilled") {
      allRaw.push(...result.value);
      log(`  ${source.id}: ${result.value.length} items`);
    } else {
      const msg = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      errors.push({ source: source.id, message: msg });
      log(`  ${source.id}: failed (${msg})`);
    }
  }

  // 2. normalize
  const normalized: Item[] = allRaw.map((raw) => normalize(raw, now));
  log(`normalized ${normalized.length} items`);

  // 3. dedupe
  const deduped = dedupe(normalized);
  log(`after dedupe: ${deduped.length} items`);

  // 4. state filter and 5. relevance filter
  const state = new State(options.stateDbPath ?? "./.digestd/state.db");
  const runId = state.startRun(now);
  let relevanceErrors: string[] = [];

  try {
    let finalItems = deduped;

    if (!options.ignoreState) {
      finalItems = state.filterUnseen(deduped, now);
      log(`after seen-filter: ${finalItems.length} new items`);
    } else {
      state.filterUnseen(deduped, now);
    }

    // 5. relevance scoring (if configured)
    const relevance = options.config.relevance;
    if (relevance && relevance.enabled !== false && finalItems.length > 0) {
      try {
        const provider = buildProvider({
          provider: relevance.provider ?? options.config.llm?.provider,
          model: relevance.model ?? options.config.llm?.model,
          apiKeyEnv: options.config.llm?.apiKeyEnv,
        });
        if (!provider) {
          log("relevance enabled but no provider configured, skipping");
        } else {
          const preferencesHash = fnv1a64(relevance.preferences.trim());
          const cache = new SqliteRelevanceCache(state, preferencesHash);
          const result = await scoreItems(
            finalItems,
            relevance,
            provider,
            cache,
            log,
          );
          relevanceErrors = result.errors;
          log(
            `after relevance-filter: ${result.kept.length} kept, ${result.dropped.length} dropped (threshold ${relevance.threshold ?? 0.5})`,
          );
          finalItems = result.kept;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        relevanceErrors.push(msg);
        log(`relevance scoring failed entirely: ${msg}`);
        log(`including all items (passthrough)`);
      }
    }

    // 6. sort by publishedAt desc
    finalItems.sort((a, b) => b.publishedAt - a.publishedAt);

    const digest: Digest = {
      generatedAt: now,
      windowStart: since,
      windowEnd: now,
      items: finalItems,
    };

    // 7. render
    const rendered = renderMarkdown(digest, {
      title: `digest · ${new Date(now).toISOString().slice(0, 10)}`,
    });

    // 8. deliver
    const deliveries: { path: string; bytes: number }[] = [];
    for (const d of options.config.deliver) {
      if (d.type === "file") {
        const result = await deliverFile(rendered, d, new Date(now));
        deliveries.push(result);
        log(`delivered → ${result.path} (${result.bytes} bytes)`);
      }
    }

    state.finishRun(
      runId,
      {
        itemsFetched: normalized.length,
        itemsNew: finalItems.length,
        errors: [
          ...errors.map((e) => `${e.source}: ${e.message}`),
          ...relevanceErrors.map((e) => `relevance: ${e}`),
        ],
      },
      now,
    );

    return { digest, rendered, deliveries, errors, relevanceErrors };
  } finally {
    state.close();
  }
}
