# digestd

your own newsletter, from your own feeds, in your own voice.

local-first. runs on cron. zero saas. zero signup. byo llm.

```
$ digestd init
$ digestd run

built 4 source(s)
  rss:https://hnrss.org/frontpage: 20 items
  hackernews:top: 20 items
  reddit:programming:top: 25 items
  youtube:UCBJycsmduvYEL83R_U4JriQ: 12 items
normalized 77 items
after dedupe: 71 items
after seen-filter: 71 new items
scoring 71 new item(s) in 8 batch(es) (0 cached)
after relevance-filter: 23 kept, 48 dropped (threshold 0.5)
delivered → ./digests/2026-05-24.md (4892 bytes)
```

## why

every other newsletter tool is saas, opinionated, and writes in
corporate voice. digestd runs on your machine, reads your feeds, and
filters by what you actually want. v0.3 adds voice-aware composition
so the digest reads like you wrote it.

## install

### option 1: clone and run

```bash
git clone https://github.com/Dragoon0x/digestd
cd digestd
bun install
bun start
```

### option 2: prebuilt binary (v0.4+)

```bash
curl -fsSL https://github.com/Dragoon0x/digestd/releases/latest/download/digestd-$(uname -s)-$(uname -m) -o digestd
chmod +x digestd
./digestd init
```

requires [bun](https://bun.sh) 1.1+. node 22 also works (see `docs/node.md`).

## quickstart

```bash
digestd init                  # scaffold config + voice.md
# edit digestd.config.yaml, add your feeds
digestd run                   # fetch + filter + render + write
digestd run --dry             # see the output without saving
digestd run --ignore-state    # include items even if already seen
digestd status                # show recent runs
```

cron it:

```cron
0 8 * * 1   cd /path/to/digestd && digestd run
```

## sources (v0.2)

```yaml
sources:
  rss:
    - https://hnrss.org/frontpage
    - url: https://overreacted.io/rss.xml
      name: overreacted
      limit: 10

  hackernews:
    feed: top      # top | best | new
    minScore: 100

  youtube:
    channels:
      - UCBJycsmduvYEL83R_U4JriQ           # marques brownlee
      - channelId: UCsXVk37bltHxD1rDPwtNM8Q
        name: kurzgesagt
        limit: 5

  reddit:
    subreddits:
      - programming
      - subreddit: MachineLearning
        sort: top
        timeWindow: week
        minScore: 50

  bookmarks:
    - path: ./bookmarks.json
      name: x-bookmarks
```

### the twitter/x situation

twitter's api is hostile and paid. instead of fighting it, digestd reads
your bookmark export as a json file. nitter-style scraping is fragile;
files are not.

export your bookmarks however you want (browser extension, manual, etc),
drop them in a json file, point digestd at it. format is forgiving — any
of these shapes work:

```json
[{"title": "...", "url": "...", "createdAt": "..."}]
{"bookmarks": [...]}
{"tweets": [{"text": "...", "url": "...", "username": "...", "created_at": "..."}]}
```

## relevance filtering (v0.2)

set up an llm-based filter that knows what you care about:

```yaml
relevance:
  enabled: true
  threshold: 0.5       # 0-1, items below are dropped
  preferences: |
    I care about AI agents, programming languages (especially rust
    and typescript), local-first software, and indie hacker stories.
    Skip: crypto, web3, generic startup news, and politics.

llm:
  provider: anthropic
  model: claude-haiku-4-5-20251001   # optional, default is haiku
  apiKeyEnv: ANTHROPIC_API_KEY       # optional, this is the default
```

then `export ANTHROPIC_API_KEY=sk-...` and run.

scores are cached in sqlite keyed by `(item_id, preferences_hash)`. that
means:

- re-running with the same preferences re-uses cached scores (cheap)
- changing your preferences invalidates the cache and re-scores
- a typical week is ~50 items, ~5 batched calls, well under $0.01 on haiku

if scoring fails (rate limit, network), default behavior is
**passthrough**: include items, log the error, retry next run. set
`onError: exclude` to drop them instead.

## what's in v0.2 (shipped)

- rss + atom sources
- hackernews via algolia api
- youtube channel rss
- reddit json api (top/hot/new/rising, time window, min score)
- twitter/x bookmark file import
- dedupe by url + near-duplicate title (word-jaccard)
- llm-based relevance filtering with batched scoring and sqlite cache
- anthropic provider (more in v0.3)
- sqlite state for seen-tracking
- markdown rendering grouped by source
- file delivery with templated paths
- `init`, `run`, `status` cli with `--dry`, `--ignore-state` flags
- 182 tests, all passing

## what's coming

- **v0.3**: `voice.md` profile, embeddings, topic clustering, voice-aware
  composition. this is the release that makes it sound like you.
- **v0.4**: html + email rendering, smtp + webhook delivery, prebuilt
  binaries for macos/linux/windows, docker image
- **v0.5**: plugin sdk for custom sources, ollama + openai providers,
  landing page

see [`docs/roadmap.md`](docs/roadmap.md) for detail.

## architecture

```
sources → normalize → dedupe → state filter → relevance filter
       → render → deliver
```

every stage is a separate folder under `src/`. every stage is
independently testable. every stage can be swapped via config.

```
src/
├── core/         types, hash, normalize, config
├── sources/      rss, hackernews, youtube, reddit, bookmark, registry
├── filter/       dedupe + relevance (llm-based)
├── llm/          provider interface + anthropic adapter
├── render/       markdown
├── deliver/      file (smtp + webhook in v0.4)
├── state/        sqlite for seen-tracking, runs, relevance cache
├── pipeline.ts   the orchestrator
└── cli.ts        entry point
```

## development

```bash
bun install
bun test               # run all 182 tests
bun run src/cli.ts     # run the cli directly
bun run build          # compile to a single binary
```

state lives in `./.digestd/state.db`. delete it to reset.

## license

MIT. see [`LICENSE`](LICENSE). see [`DISCLAIMER.md`](DISCLAIMER.md) for caveats.

## contributing

issues and PRs welcome. especially:
- new source adapters (mastodon, bluesky, github releases)
- new llm providers (openai, ollama, gemini)
- voice.md profiles people can copy

---

made by [@Dragoon0x](https://github.com/Dragoon0x). part of a small
constellation of local-first builder tools.
