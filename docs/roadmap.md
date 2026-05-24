# roadmap

session-by-session plan. each session ships a usable release.

## v0.1 — pipeline (shipped)

the bones. fetch, dedupe, render, write. no llm.

- [x] rss + atom source
- [x] hackernews source via algolia api
- [x] dedupe by url + word-jaccard title
- [x] sqlite state for seen-tracking
- [x] markdown rendering grouped by source
- [x] file delivery with templated paths
- [x] `init`, `run`, `status` cli
- [x] 112 tests

## v0.2 — sources + relevance (shipped)

more places to read from, plus an llm-based filter that knows what you
actually care about.

- [x] youtube channel source (rss endpoint)
- [x] reddit source (json api, top/hot/new/rising, time window, min score)
- [x] twitter/x bookmark file ingestor (any of three json shapes)
- [x] llm provider abstraction + anthropic adapter
- [x] batched relevance scoring with sqlite cache
- [x] preferences-hash-keyed cache (changing preferences invalidates)
- [x] passthrough-on-error default so a flaky api never loses content
- [x] `enabled: false` flag for users who want everything
- [x] 182 tests

## v0.3 — voice (the release)

this is the version that makes digestd worth talking about. the file
that teaches it your voice has been there since v0.1; v0.3 finally
uses it.

- [ ] `voice.md` parser (samples + rules + negative examples)
- [ ] embedding generation per item (voyage / openai / ollama)
- [ ] cosine + agglomerative clustering, no ml deps
- [ ] per-cluster summarization
- [ ] voice-aware composition: cluster items + voice.md → digest section
- [ ] swap default rendering from "grouped by source" to "grouped by topic"
- [ ] examples folder with 3-5 real voice.md profiles to copy
- [ ] openai provider
- [ ] ollama provider for fully-local

## v0.4 — distribution

go from "clone the repo" to "one binary, drop it anywhere."

- [ ] html rendering (mobile-readable, no js)
- [ ] email rendering (inline css, works in apple mail / gmail)
- [ ] smtp delivery (`type: smtp`)
- [ ] webhook delivery (`type: webhook`)
- [ ] prebuilt binaries via `bun build --compile` for:
  - macos arm64, macos x64
  - linux x64, linux arm64
  - windows x64
- [ ] github release workflow (already scaffolded in v0.1)
- [ ] dockerfile + multi-arch image to `ghcr.io/dragoon0x/digestd`

## v0.5 — plugin sdk + landing page

let the community add their own sources without forking.

- [ ] documented `Source` interface as the plugin contract
- [ ] dynamic source loading from a config-specified path
- [ ] example plugins:
  - mastodon home timeline
  - bluesky home timeline
  - github releases for a list of repos
- [ ] landing page at digestd.dev (or alternative)
- [ ] cookbook in docs: 10 ready-to-copy configs

## later (out of scope for now)

- web ui to browse past digests
- full-text search across past digests
- obsidian / notion export
- mobile app (probably never)
