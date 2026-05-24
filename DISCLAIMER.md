# DISCLAIMER

digestd is provided as-is, MIT licensed, no warranty of any kind.

a few specific things worth flagging:

## you are responsible for what you fetch

digestd reads whatever urls you put in your config. you're responsible
for respecting the terms of service of the feeds you subscribe to, the
rate limits of any apis you hit, and the licenses of the content you
ingest. don't point digestd at sources that disallow automated access.

## state and storage

digestd writes a sqlite db under `./.digestd/state.db` by default. it
contains item ids, titles, urls, and source names. nothing else. no
content bodies. no auth tokens.

your generated digests are plain markdown files written wherever you
configure. there is no cloud sync, no analytics, no telemetry. delete
the state db and the digest files to wipe everything.

## llm usage (when it lands in v0.2+)

later versions will call out to an llm provider (anthropic / openai /
ollama / etc) for relevance scoring and voice composition. those calls
go directly from your machine to the provider you configure. digestd
does not proxy or log them. you pay your own api costs.

if you use a cloud llm provider, content from your fed sources will be
sent to that provider's api in order to be summarized. if that's not
acceptable, use a local model via ollama or skip the compose stage.

## no investment, legal, or medical advice

digestd summarizes whatever you point it at. summaries are not advice
of any kind, even if the underlying source is. always read the original
before acting on anything.

## opensource expectations

this is a side project. issues and PRs welcome, but no guarantees on
response time. if you need something specific, fork it.
