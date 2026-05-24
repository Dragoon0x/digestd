import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { renderTemplate } from "../core/config.ts";
import type { DeliverFileConfig } from "../core/config.ts";

export interface DeliverResult {
  path: string;
  bytes: number;
}

export async function deliverFile(
  content: string,
  config: DeliverFileConfig,
  now: Date = new Date(),
): Promise<DeliverResult> {
  const vars = {
    date: now.toISOString().slice(0, 10),
    time: now.toISOString().slice(11, 19).replace(/:/g, "-"),
    timestamp: String(now.getTime()),
    year: String(now.getUTCFullYear()),
    month: String(now.getUTCMonth() + 1).padStart(2, "0"),
    day: String(now.getUTCDate()).padStart(2, "0"),
  };

  const renderedPath = renderTemplate(config.path, vars);
  const absolute = resolve(renderedPath);

  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf-8");

  return {
    path: absolute,
    bytes: Buffer.byteLength(content, "utf-8"),
  };
}
