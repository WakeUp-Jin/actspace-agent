import { afterEach, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, open, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VerifiedContent, type ExpectedContent } from "../verified-content.js";

const roots: string[] = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function stored(bytes: Buffer) {
  const root = await mkdtemp(join(tmpdir(), "host-verified-")); roots.push(root);
  const path = join(root, "content"); await writeFile(path, bytes);
  return { path, expected: { size: bytes.length, sha256: sha256(bytes) } };
}
/** File times come from the real clock, so "later" is the clock moving on, not the file being backdated. */
function later(ms: number) { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + ms); }
/** Runs one check on a fresh handle and reports how many bytes it had to read. */
async function check(cache: VerifiedContent, path: string, expected: ExpectedContent, key = "file") {
  const file = await open(path, "r");
  try {
    const read = vi.spyOn(file, "read");
    const matches = await cache.matches(key, file, expected);
    let bytes = 0; for (const result of read.mock.results) bytes += (await result.value as { bytesRead: number }).bytesRead;
    return { matches, bytes };
  } finally { await file.close(); }
}
/** A whole second, so that putting mtime back restores it exactly. */
const MTIME_SECONDS = 1_700_000_000;
/** Overwrites one byte in place and puts mtime back, repeating until the filesystem's clock has stepped. */
async function rewriteKeepingSizeAndMtime(path: string, position: number, value: number) {
  const before = await stat(path, { bigint: true });
  do {
    const file = await open(path, "r+");
    try { await file.write(Buffer.from([value]), 0, 1, position); } finally { await file.close(); }
    await utimes(path, MTIME_SECONDS, MTIME_SECONDS);
  } while ((await stat(path, { bigint: true })).ctimeNs === before.ctimeNs);
  const after = await stat(path, { bigint: true });
  expect([after.size, after.mtimeNs, after.ino]).toEqual([before.size, before.mtimeNs, before.ino]);
}

it("hashes a settled file once and answers later checks from its identity", async () => {
  const bytes = randomBytes(3 * 1024 * 1024 + 17), { path, expected } = await stored(bytes);
  const cache = new VerifiedContent(); later(60_000);
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: bytes.length });
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: 0 });
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: 0 });
});

it("does not remember a file that changed moments ago", async () => {
  const bytes = randomBytes(4096), { path, expected } = await stored(bytes);
  const cache = new VerifiedContent();
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: 4096 });
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: 4096 });
  later(60_000);
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: 4096 });
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: 0 });
});

it("checks again after an in-place rewrite that keeps size and mtime", async () => {
  const bytes = randomBytes(8192), { path, expected } = await stored(bytes);
  await utimes(path, MTIME_SECONDS, MTIME_SECONDS);
  const cache = new VerifiedContent(); later(60_000);
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: 8192 });
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: 0 });
  await rewriteKeepingSizeAndMtime(path, 100, bytes[100]! ^ 1);
  expect(await check(cache, path, expected)).toEqual({ matches: false, bytes: 8192 });
  expect(await check(cache, path, expected)).toEqual({ matches: false, bytes: 8192 });
  await rewriteKeepingSizeAndMtime(path, 100, bytes[100]!);
  later(60_000);
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: 8192 });
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: 0 });
});

it("rejects a wrong size without reading and never reuses a check for another digest", async () => {
  const bytes = randomBytes(1000), { path, expected } = await stored(bytes);
  const cache = new VerifiedContent(); later(60_000);
  expect(await check(cache, path, { ...expected, size: 999 })).toEqual({ matches: false, bytes: 0 });
  expect(await check(cache, path, { ...expected, size: 1001 })).toEqual({ matches: false, bytes: 0 });
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: 1000 });
  expect(await check(cache, path, { ...expected, sha256: sha256(randomBytes(8)) })).toEqual({ matches: false, bytes: 1000 });
  expect(await check(cache, path, expected)).toEqual({ matches: true, bytes: 1000 });
  const empty = await stored(Buffer.alloc(0));
  expect(await check(cache, empty.path, empty.expected, "empty")).toEqual({ matches: true, bytes: 0 });
  expect(await check(cache, empty.path, { size: 0, sha256: sha256(Buffer.from("x")) }, "empty")).toEqual({ matches: false, bytes: 0 });
});

it("forgets the oldest check once it holds its limit", async () => {
  const cache = new VerifiedContent(2);
  const files = await Promise.all([1, 2, 3].map(() => stored(randomBytes(64))));
  later(60_000);
  for (const [index, file] of files.entries()) expect(await check(cache, file.path, file.expected, `k${index}`)).toEqual({ matches: true, bytes: 64 });
  expect(await check(cache, files[2]!.path, files[2]!.expected, "k2")).toEqual({ matches: true, bytes: 0 });
  expect(await check(cache, files[1]!.path, files[1]!.expected, "k1")).toEqual({ matches: true, bytes: 0 });
  expect(await check(cache, files[0]!.path, files[0]!.expected, "k0")).toEqual({ matches: true, bytes: 64 });
});
