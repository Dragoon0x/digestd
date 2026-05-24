import type { Item } from "../core/types.ts";
import type { LlmProvider } from "../llm/types.ts";
import { LlmError } from "../llm/types.ts";

export interface RelevanceOptions {
  // free-text description of what the user wants to read about.
  preferences: string;
  // 0-1 cutoff. items scoring below are excluded. default 0.5.
  threshold?: number;
  // how many items to score per llm call. default 10.
  batchSize?: number;
  // when llm fails, "passthrough" includes all items, "exclude" drops them.
  // default "passthrough" - never lose content to a network blip.
  onError?: "passthrough" | "exclude";
  // optional model override
  model?: string;
}

export interface RelevanceScore {
  itemId: string;
  score: number; // 0-1, normalized from llm 0-10
  reason?: string;
}

export interface RelevanceCache {
  get(itemId: string): RelevanceScore | undefined;
  set(score: RelevanceScore): void;
}

export class InMemoryCache implements RelevanceCache {
  private readonly map = new Map<string, RelevanceScore>();
  get(itemId: string) {
    return this.map.get(itemId);
  }
  set(score: RelevanceScore) {
    this.map.set(score.itemId, score);
  }
}

export interface ScoreResult {
  // items at or above threshold, with score attached as item.tags-style metadata
  // (left on item.score? no - that's the source score. relevance is separate.)
  // we attach it inline via the .tags? no. simplest: return parallel arrays.
  kept: Item[];
  dropped: Item[];
  scores: Map<string, RelevanceScore>; // id → score for all items
  errors: string[];
}

const SYSTEM_PROMPT = `You are a curator helping someone decide which items belong in their personal digest. You will be given the user's preferences and a numbered list of items. For each item, rate how relevant it is to the user's preferences on a scale of 0 to 10:

- 10: directly on-topic, must include
- 7-9: clearly related, very likely interesting
- 4-6: tangentially related, maybe
- 1-3: only weakly related
- 0: not related, exclude

Respond with ONLY a JSON array, no preamble or commentary. Format:
[{"id":"<id from input>","score":<0-10>,"reason":"<short reason, max 15 words>"}]`;

export async function scoreItems(
  items: Item[],
  options: RelevanceOptions,
  provider: LlmProvider,
  cache: RelevanceCache,
  log: (msg: string) => void = () => {},
): Promise<ScoreResult> {
  const threshold = options.threshold ?? 0.5;
  const batchSize = options.batchSize ?? 10;
  const onError = options.onError ?? "passthrough";

  const scores = new Map<string, RelevanceScore>();
  const errors: string[] = [];

  // partition into cached vs needs-scoring
  const toScore: Item[] = [];
  for (const item of items) {
    const cached = cache.get(item.id);
    if (cached) {
      scores.set(item.id, cached);
    } else {
      toScore.push(item);
    }
  }

  if (toScore.length > 0) {
    log(
      `scoring ${toScore.length} new item(s) in ${Math.ceil(toScore.length / batchSize)} batch(es) (${scores.size} cached)`,
    );
  } else if (items.length > 0) {
    log(`all ${items.length} items already scored (cache hit)`);
  }

  // batch
  for (let i = 0; i < toScore.length; i += batchSize) {
    const batch = toScore.slice(i, i + batchSize);
    try {
      const batchScores = await scoreBatch(batch, options, provider);
      for (const s of batchScores) {
        scores.set(s.itemId, s);
        cache.set(s);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      log(`batch ${i / batchSize + 1} failed: ${msg}`);
      // apply error policy
      for (const item of batch) {
        if (onError === "passthrough") {
          // synthesize a passing score so item is kept
          const fallback: RelevanceScore = {
            itemId: item.id,
            score: 1,
            reason: "scoring failed, included by passthrough policy",
          };
          scores.set(item.id, fallback);
          // do not cache fallback scores; we want to retry next run
        }
        // for "exclude", just don't add a score; item will be dropped below
      }
    }
  }

  // partition into kept and dropped
  const kept: Item[] = [];
  const dropped: Item[] = [];
  for (const item of items) {
    const s = scores.get(item.id);
    if (!s) {
      dropped.push(item);
      continue;
    }
    if (s.score >= threshold) {
      kept.push(item);
    } else {
      dropped.push(item);
    }
  }

  return { kept, dropped, scores, errors };
}

async function scoreBatch(
  batch: Item[],
  options: RelevanceOptions,
  provider: LlmProvider,
): Promise<RelevanceScore[]> {
  const userContent = buildBatchPrompt(batch, options.preferences);

  const response = await provider.complete(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    {
      model: options.model,
      maxTokens: 2048,
      temperature: 0,
    },
  );

  return parseBatchResponse(response, batch);
}

export function buildBatchPrompt(batch: Item[], preferences: string): string {
  const lines: string[] = [];
  lines.push("User preferences:");
  lines.push(preferences.trim());
  lines.push("");
  lines.push(`Items to score (${batch.length}):`);
  for (const item of batch) {
    lines.push("---");
    lines.push(`id: ${item.id}`);
    lines.push(`title: ${item.title}`);
    if (item.source) lines.push(`source: ${item.source}`);
    if (item.summary) {
      const trimmed = item.summary.length > 400
        ? item.summary.slice(0, 400) + "…"
        : item.summary;
      lines.push(`summary: ${trimmed}`);
    }
  }
  lines.push("");
  lines.push(
    "Return a JSON array with one entry per item. ONLY the JSON, no other text.",
  );
  return lines.join("\n");
}

export function parseBatchResponse(
  response: string,
  batch: Item[],
): RelevanceScore[] {
  const json = extractJson(response);
  if (!json) {
    throw new LlmError(`could not find JSON array in response`, "relevance");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new LlmError("response was not valid JSON", "relevance", err);
  }

  if (!Array.isArray(parsed)) {
    throw new LlmError("response was not a JSON array", "relevance");
  }

  const validIds = new Set(batch.map((i) => i.id));
  const out: RelevanceScore[] = [];

  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id : null;
    const rawScore = typeof e.score === "number" ? e.score : null;
    if (!id || rawScore === null) continue;
    if (!validIds.has(id)) continue;
    // normalize 0-10 to 0-1, clamp
    const normalized = Math.max(0, Math.min(1, rawScore / 10));
    out.push({
      itemId: id,
      score: normalized,
      reason: typeof e.reason === "string" ? e.reason : undefined,
    });
  }

  return out;
}

// strip any preamble/postamble and find the JSON array.
function extractJson(text: string): string | null {
  // strip code fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1] ?? null;

  // find the first [ and the matching last ]
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}
