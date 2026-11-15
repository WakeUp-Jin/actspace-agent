import { createHash } from "node:crypto";
import type { BigIntStats } from "node:fs";
import type { FileHandle } from "node:fs/promises";

export interface ExpectedContent { readonly size: number; readonly sha256: string }

/**
 * File times advance in steps (a few milliseconds on most filesystems, up to 2 s on some). A rewrite in
 * the same step as a check would leave every time unchanged, so a check is remembered only for a file
 * whose last change is older than this.
 */
const SETTLED_AFTER_MS = 2000;

/**
 * Remembers which stored files already matched their recorded size and SHA-256.
 *
 * A download arrives as chunks of at most 256 KiB. Checking the whole file for every chunk reads and
 * hashes a 20 MiB file 80 times; with this it is hashed once and each later chunk costs one fstat.
 *
 * A remembered check stands only while the open file is the same inode with the same size, mtime and
 * ctime, and the recorded size and digest are the same. ctime is included because every write moves it
 * and, unlike mtime, it cannot be set back.
 */
export class VerifiedContent {
  readonly #checked = new Map<string, string>();
  constructor(private readonly limit = 1024) {}
  /** Whether the file holds exactly the expected content. The handle must only be used for positional reads. */
  async matches(key: string, file: FileHandle, expected: ExpectedContent): Promise<boolean> {
    const before = await file.stat({ bigint: true }), version = versionOf(before, expected);
    if (this.#checked.get(key) === version) return true;
    this.#checked.delete(key);
    if (Number(before.size) !== expected.size) return false;
    const hash = createHash("sha256"), piece = Buffer.allocUnsafe(Math.min(expected.size, 1024 * 1024));
    for (let position = 0; position < expected.size;) {
      const { bytesRead } = await file.read(piece, 0, Math.min(piece.length, expected.size - position), position);
      if (bytesRead === 0) return false;
      hash.update(piece.subarray(0, bytesRead)); position += bytesRead;
    }
    if (hash.digest("hex") !== expected.sha256) return false;
    const after = await file.stat({ bigint: true });
    if (versionOf(after, expected) === version && Date.now() - Number(after.ctimeMs) > SETTLED_AFTER_MS) {
      if (this.#checked.size >= this.limit) this.#checked.delete(this.#checked.keys().next().value!);
      this.#checked.set(key, version);
    }
    return true;
  }
}

function versionOf(stats: BigIntStats, expected: ExpectedContent): string {
  return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}:${expected.size}:${expected.sha256}`;
}
