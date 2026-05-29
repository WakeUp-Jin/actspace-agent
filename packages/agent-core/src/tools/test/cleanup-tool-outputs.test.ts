import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupOldToolOutputs } from "../cleanup-tool-outputs";
import { TOOL_OUTPUT_DIRNAME } from "../tool-output-paths";

const DAY = 24 * 60 * 60 * 1000;

async function makeAged(filePath: string, ageMs: number): Promise<void> {
  await writeFile(filePath, "x");
  const when = new Date(Date.now() - ageMs);
  await utimes(filePath, when, when);
}

describe("cleanupOldToolOutputs", () => {
  it("removes files older than maxAge and keeps fresh ones", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "actspace-tool-cleanup-"));
    const sessionDir = join(tmpRoot, TOOL_OUTPUT_DIRNAME, "s1");
    await mkdir(sessionDir, { recursive: true });

    const oldFile = join(sessionDir, "old-bash.txt");
    const freshFile = join(sessionDir, "fresh-bash.txt");
    await makeAged(oldFile, 10 * DAY);
    await makeAged(freshFile, 1 * DAY);

    await cleanupOldToolOutputs(tmpRoot, 7 * DAY);

    await expect(stat(oldFile)).rejects.toThrow();
    await expect(stat(freshFile)).resolves.toBeDefined();
  });

  it("removes a session directory once it becomes empty", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "actspace-tool-cleanup-"));
    const sessionDir = join(tmpRoot, TOOL_OUTPUT_DIRNAME, "s-empty");
    await mkdir(sessionDir, { recursive: true });
    await makeAged(join(sessionDir, "only-bash.txt"), 30 * DAY);

    await cleanupOldToolOutputs(tmpRoot, 7 * DAY);

    const sessions = await readdir(join(tmpRoot, TOOL_OUTPUT_DIRNAME));
    expect(sessions).not.toContain("s-empty");
  });

  it("returns quietly when the tool-output root does not exist", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "actspace-tool-cleanup-"));
    await expect(cleanupOldToolOutputs(tmpRoot)).resolves.toBeUndefined();
  });
});
