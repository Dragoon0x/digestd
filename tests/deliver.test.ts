import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deliverFile } from "../src/deliver/file.ts";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "digestd-deliver-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("deliverFile", () => {
  test("writes content to plain path", async () => {
    const path = join(tmpDir, "plain.md");
    const result = await deliverFile("# hi\n", { type: "file", path });
    expect(result.bytes).toBe(5);
    const back = await readFile(path, "utf-8");
    expect(back).toBe("# hi\n");
  });

  test("substitutes {{date}} template", async () => {
    const result = await deliverFile(
      "content",
      { type: "file", path: join(tmpDir, "out-{{date}}.md") },
      new Date(Date.UTC(2024, 0, 15)),
    );
    expect(result.path).toContain("out-2024-01-15.md");
    const back = await readFile(result.path, "utf-8");
    expect(back).toBe("content");
  });

  test("substitutes year/month/day", async () => {
    const result = await deliverFile(
      "content",
      {
        type: "file",
        path: join(tmpDir, "y{{year}}-m{{month}}-d{{day}}.md"),
      },
      new Date(Date.UTC(2024, 2, 7)),
    );
    expect(result.path).toContain("y2024-m03-d07.md");
  });

  test("creates intermediate directories", async () => {
    const path = join(tmpDir, "nested/sub/digest.md");
    const result = await deliverFile("x", { type: "file", path });
    expect(result.path).toContain("nested/sub/digest.md");
    expect((await readFile(path, "utf-8"))).toBe("x");
  });

  test("returns absolute path", async () => {
    const result = await deliverFile(
      "x",
      { type: "file", path: join(tmpDir, "abs.md") },
    );
    expect(result.path.startsWith("/")).toBe(true);
  });
});
