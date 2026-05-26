/**
 * Atomic text writing helper shared by edit_file and write_file tools.
 *
 * Strategy: write to a temp file in the same directory, fsync, then rename.
 * This guarantees the target file is never left in a half-written state.
 * Falls back to direct write when atomic rename fails (e.g. cross-device).
 */

import { writeFile, rename, stat, chmod, open, mkdir, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";

export async function writeTextAtomic(
  targetPath: string,
  content: string,
  encoding: BufferEncoding = "utf-8",
): Promise<void> {
  const resolved = resolve(targetPath);
  const dir = dirname(resolved);

  await mkdir(dir, { recursive: true });

  let originalMode: number | undefined;
  try {
    const st = await stat(resolved);
    originalMode = st.mode;
  } catch {
    // File does not exist yet — no mode to preserve.
  }

  const suffix = randomBytes(6).toString("hex");
  const tmpPath = `${resolved}.tmp.${suffix}`;

  try {
    const fd = await open(tmpPath, "w");
    try {
      await fd.writeFile(content, encoding);
      await fd.sync();
    } finally {
      await fd.close();
    }

    if (originalMode !== undefined) {
      await chmod(tmpPath, originalMode);
    }

    await rename(tmpPath, resolved);
  } catch (atomicErr) {
    // Fallback: direct write keeps availability on edge-case filesystems.
    try {
      await unlink(tmpPath);
    } catch {
      // tmp may not exist — ignore.
    }

    await writeFile(resolved, content, encoding);
  }
}
