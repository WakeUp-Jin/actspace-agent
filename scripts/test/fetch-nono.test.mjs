import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fetchNono, nonoTarget, parseArgs, readNonoVersion } from "../sandbox/fetch-nono.mjs";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "actspace-fetch-nono-"));
  await writeFile(join(dir, "nono"), "#!/bin/sh\necho 'nono 0.0.0-test'\n");
  const archive = join(dir, "nono-test.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", dir, "nono"]);
  const hash = createHash("sha256").update(await readFile(archive)).digest("hex");
  const config = { version: "0.0.0-test", releaseUrl: "https://example.invalid", assets: { "darwin-arm64": { file: "nono-test.tar.gz", sha256: hash } } };
  return { dir, archive, config };
}

test("pins all four supported builds with valid hashes", async () => {
  const config = await readNonoVersion();
  assert.equal(config.version, "0.80.0");
  assert.deepEqual(Object.keys(config.assets).sort(), ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]);
  assert.equal(config.assets["darwin-arm64"].file, "nono-v0.80.0-aarch64-apple-darwin.tar.gz");
  assert.equal(nonoTarget("linux", "x64"), "linux-x64");
});

test("installs the binary from a verified archive and reuses the cache", async () => {
  const { dir, archive, config } = await fixture();
  try {
    const downloads = [];
    const download = async (url, file) => { downloads.push(url); await copyFile(archive, file); };
    const out = join(dir, "dist", "nono");
    const cacheDir = join(dir, "cache");
    await fetchNono({ target: "darwin-arm64", out, config, cacheDir, download });
    assert.deepEqual(downloads, ["https://example.invalid/nono-test.tar.gz"]);
    assert.equal((await stat(out)).mode & 0o777, 0o755);
    assert.match(execFileSync(out, { encoding: "utf8" }), /nono 0\.0\.0-test/);
    await fetchNono({ target: "darwin-arm64", out, config, cacheDir, download });
    assert.equal(downloads.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("deletes a download whose hash does not match and fails", async () => {
  const { dir, config } = await fixture();
  try {
    const cacheDir = join(dir, "cache");
    const download = async (_url, file) => { await writeFile(file, "tampered"); };
    await assert.rejects(fetchNono({ target: "darwin-arm64", out: join(dir, "out", "nono"), config, cacheDir, download }), /hash mismatch/);
    await assert.rejects(stat(join(cacheDir, "nono-test.tar.gz.partial")), /ENOENT/);
    await assert.rejects(stat(join(cacheDir, "nono-test.tar.gz")), /ENOENT/);
    await assert.rejects(stat(join(dir, "out", "nono")), /ENOENT/);
    await assert.rejects(fetchNono({ target: "win32-x64", out: join(dir, "x"), config, cacheDir, download }), /No pinned nono build for win32-x64/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("parses arguments strictly", () => {
  assert.deepEqual(parseArgs(["--target", "linux-x64", "--out", "/tmp/nono"]), { all: false, target: "linux-x64", out: "/tmp/nono" });
  assert.throws(() => parseArgs(["--all", "--out", "/tmp/nono"]), /cannot be combined/);
  assert.throws(() => parseArgs(["--target"]), /needs a value/);
  assert.throws(() => parseArgs(["--bogus"]), /Unknown argument/);
});
