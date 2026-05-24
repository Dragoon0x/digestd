#!/usr/bin/env bun
import { writeFile, mkdir, access } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "./core/config.ts";
import { runPipeline } from "./pipeline.ts";
import { State } from "./state/db.ts";

const HELP = `digestd · your own newsletter, from your own feeds

usage:
  digestd init [path]      scaffold config in current dir (or path)
  digestd run [--config c] [--ignore-state] [--dry]
  digestd status           show recent runs

flags:
  --config, -c <path>      config file (default: ./digestd.config.yaml)
  --ignore-state           treat every item as new, ignore seen db
  --dry                    fetch and render but do not deliver
  --help, -h               show this
  --version, -v            show version
`;

const VERSION = "0.2.0";

const EXAMPLE_CONFIG = `# digestd config
# docs: https://github.com/Dragoon0x/digestd

window:
  hours: 168  # 1 week

sources:
  rss:
    - https://hnrss.org/frontpage
    # - https://stratechery.com/feed/

  hackernews:
    feed: top
    minScore: 100
    limit: 20

  # youtube channel rss (use channel id, not @handle)
  # youtube:
  #   channels:
  #     - UCBJycsmduvYEL83R_U4JriQ  # marques brownlee
  #     - channelId: UCsXVk37bltHxD1rDPwtNM8Q
  #       name: kurzgesagt
  #       limit: 5

  # reddit (public json api, no auth needed)
  # reddit:
  #   subreddits:
  #     - programming
  #     - subreddit: MachineLearning
  #       sort: top
  #       timeWindow: week
  #       minScore: 50

  # twitter/x bookmarks - export your bookmarks as json and point here
  # bookmarks:
  #   - path: ./bookmarks.json
  #     name: x-bookmarks

# llm-based relevance filtering (optional)
# requires ANTHROPIC_API_KEY in your environment
# relevance:
#   enabled: true
#   threshold: 0.5
#   preferences: |
#     I care about AI agents, programming languages (especially rust and typescript),
#     local-first software, indie hacker stories, and developer tools.
#     Skip: crypto, web3, generic startup news, and politics.

deliver:
  - type: file
    path: ./digests/{{date}}.md
`;

const EXAMPLE_VOICE = `# voice profile

this file teaches digestd to write summaries in your voice.
session 1 does not use this yet. starting in v0.3 it will shape
the composed digest text.

## samples

paste 2-5 paragraphs of your own writing here. anything that
sounds like you. blog posts, tweets, slack messages, all fine.

## rules

- no em dashes
- lowercase casual tone
- short sentences mixed with long ones
- avoid corporate words like "leverage", "robust", "seamless"
- no AI-sounding transitions ("furthermore", "in conclusion")
`;

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    process.exit(0);
  }

  if (cmd === "init") {
    const target = args[1] ?? ".";
    await initCommand(target);
    return;
  }

  if (cmd === "run") {
    await runCommand(args.slice(1));
    return;
  }

  if (cmd === "status") {
    statusCommand(args.slice(1));
    return;
  }

  console.error(`unknown command: ${cmd}\n`);
  console.error(HELP);
  process.exit(1);
}

async function initCommand(target: string) {
  const dir = resolve(target);
  await mkdir(dir, { recursive: true });

  const configPath = resolve(dir, "digestd.config.yaml");
  const voicePath = resolve(dir, "voice.md");

  if (await exists(configPath)) {
    console.error(`refusing to overwrite ${configPath}`);
    process.exit(1);
  }

  await writeFile(configPath, EXAMPLE_CONFIG, "utf-8");
  console.log(`wrote ${configPath}`);

  if (!(await exists(voicePath))) {
    await writeFile(voicePath, EXAMPLE_VOICE, "utf-8");
    console.log(`wrote ${voicePath}`);
  }

  console.log("");
  console.log("next:");
  console.log("  1. edit digestd.config.yaml to add your feeds");
  console.log("  2. run: digestd run");
}

async function runCommand(rest: string[]) {
  const flags = parseFlags(rest);
  const configPath = flags.config ?? "./digestd.config.yaml";

  if (!(await exists(configPath))) {
    console.error(`config not found: ${configPath}`);
    console.error(`run \`digestd init\` to scaffold one.`);
    process.exit(1);
  }

  const config = await loadConfig(configPath);

  const result = await runPipeline({
    config,
    ignoreState: Boolean(flags["ignore-state"]),
    log: (m) => console.log(m),
  });

  if (flags.dry) {
    console.log("\n--- DRY RUN ---");
    console.log(result.rendered);
    return;
  }

  console.log("");
  if (result.errors.length > 0) {
    console.log(`completed with ${result.errors.length} error(s):`);
    for (const e of result.errors) console.log(`  ${e.source}: ${e.message}`);
  } else {
    console.log("ok.");
  }
}

function statusCommand(_rest: string[]) {
  const state = new State("./.digestd/state.db");
  try {
    const runs = state.recentRuns(10);
    if (runs.length === 0) {
      console.log("no runs yet. try `digestd run`.");
      return;
    }
    console.log(`seen items: ${state.countSeen()}`);
    console.log("");
    console.log("recent runs:");
    for (const r of runs) {
      const ts = new Date(r.startedAt).toISOString();
      const status = r.finishedAt ? "ok" : "(in flight)";
      console.log(
        `  #${r.id}  ${ts}  fetched=${r.itemsFetched} new=${r.itemsNew}  ${status}`,
      );
    }
  } finally {
    state.close();
  }
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a) continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else if (a === "-c") {
      const next = args[i + 1];
      if (next) {
        out.config = next;
        i++;
      }
    }
  }
  return out;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
