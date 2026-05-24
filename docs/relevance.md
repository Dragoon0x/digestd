# relevance filtering

v0.2 ships an optional llm-based filter that scores each item against
a free-text description of what you want to read. items below your
threshold are dropped.

## how it works

```
items → batched into groups of 10
     → sent to llm with your preferences as the system prompt
     → llm returns JSON with score 0-10 per item
     → cache result keyed by (item_id, preferences_hash)
     → drop items below your threshold
```

scores are normalized from 0-10 (what the llm sees) to 0-1 (what your
threshold uses). default threshold is 0.5.

## config

```yaml
relevance:
  enabled: true
  threshold: 0.5
  batchSize: 10        # items per llm call. default 10.
  onError: passthrough # or "exclude". default passthrough.
  preferences: |
    I'm interested in <topics>.
    Skip: <topics to drop>.

llm:
  provider: anthropic
  model: claude-haiku-4-5-20251001  # default
  apiKeyEnv: ANTHROPIC_API_KEY      # default
```

set the api key in your environment:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## writing preferences

be specific. "tech stuff" gets bad results. "rust, typescript, local-first
software, ai agents — skip crypto, web3, generic vc news" gets good ones.

a few patterns that work:

```yaml
preferences: |
  Include:
  - Programming languages: rust, typescript, go
  - AI agents and developer tools
  - Local-first software, indie hacker stories

  Skip:
  - Crypto, web3, NFTs
  - Politics, current events
  - Generic startup news without technical content
```

or a more narrative form:

```yaml
preferences: |
  I'm a backend engineer interested in distributed systems, postgres
  internals, and rust. I read for technical depth, not breadth. Skip
  anything about ML hype, generic productivity advice, or news cycle
  commentary. I care about implementation details, not announcements.
```

## cost

with haiku at default settings:

- ~50 items per week
- ~5 batched calls
- ~3000 input tokens + 500 output tokens per call
- estimated cost: well under $0.01 per week

scores are cached. re-running the same week is free (cache hit). only
new items hit the api.

changing your preferences invalidates the cache and re-scores. the
hash is computed from the trimmed preferences string, so whitespace
changes don't cause re-scoring.

## error handling

three things can fail: network, rate limit, malformed response.

default `onError: passthrough` means: if a batch fails, include those
items in the digest with a synthetic score. you'll see "scoring failed,
included by passthrough policy" in the score reason. items are NOT
cached when this happens, so the next run will retry.

`onError: exclude` drops items from failed batches. use this only if
you'd rather miss content than see noise.

the whole relevance stage is wrapped in try/catch. if the entire stage
errors out (e.g. missing api key), the pipeline logs it and proceeds
with all items included.

## disabling

just remove the `relevance:` section, or:

```yaml
relevance:
  enabled: false
  preferences: ""  # required by schema but ignored when disabled
```

## what the llm sees

the system prompt is fixed. the user prompt has your preferences plus
the batch:

```
User preferences:
<your preferences text>

Items to score (10):
---
id: abc123
title: Rust 2.0 released
source: hackernews
summary: ...
---
id: def456
title: ...
```

it's instructed to return only a JSON array. the parser handles
preamble, postamble, and markdown code fences just in case.

## providers

v0.2 ships anthropic only. v0.3 will add openai and ollama (for
fully-local scoring with no api spend). the provider interface in
`src/llm/types.ts` is intentionally tiny - adding a new one is
maybe 80 lines.
EOF
echo "ok"