#!/usr/bin/env bun
// multi-arch binary build via bun --compile.
// produces digestd-<os>-<arch> binaries in ./dist for github releases.
//
// in v0.4 this gets wired into a github actions workflow that runs
// per-target. for now it builds for the current host arch, which is
// enough for local testing.

import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

interface Target {
  bunTarget: string;
  os: string;
  arch: string;
  ext: string;
}

const TARGETS: Target[] = [
  { bunTarget: "bun-darwin-arm64", os: "darwin", arch: "arm64", ext: "" },
  { bunTarget: "bun-darwin-x64", os: "darwin", arch: "x64", ext: "" },
  { bunTarget: "bun-linux-x64", os: "linux", arch: "x64", ext: "" },
  { bunTarget: "bun-linux-arm64", os: "linux", arch: "arm64", ext: "" },
  { bunTarget: "bun-windows-x64", os: "windows", arch: "x64", ext: ".exe" },
];

const args = process.argv.slice(2);
const hostOnly = args.includes("--host-only");

async function main() {
  const distDir = resolve("dist");
  await mkdir(distDir, { recursive: true });

  const targets = hostOnly ? [hostTarget()] : TARGETS;

  for (const t of targets) {
    const outFile = `${distDir}/digestd-${t.os}-${t.arch}${t.ext}`;
    console.log(`building ${outFile}...`);
    const result = spawnSync(
      "bun",
      [
        "build",
        "src/cli.ts",
        "--compile",
        ...(hostOnly ? [] : ["--target", t.bunTarget]),
        "--outfile",
        outFile,
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      console.error(`failed: ${outFile}`);
      process.exit(1);
    }
  }
  console.log("done.");
}

function hostTarget(): Target {
  const platform = process.platform;
  const arch = process.arch;
  const found = TARGETS.find((t) => {
    if (t.os === "darwin" && platform === "darwin") return t.arch === arch;
    if (t.os === "linux" && platform === "linux") return t.arch === arch;
    if (t.os === "windows" && platform === "win32") return t.arch === arch;
    return false;
  });
  if (!found) {
    console.error(`no target for ${platform}/${arch}`);
    process.exit(1);
  }
  return found;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
