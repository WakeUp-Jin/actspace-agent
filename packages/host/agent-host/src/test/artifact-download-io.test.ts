import { afterEach, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, open, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HostArtifacts } from "../artifacts.js";
import { NodeArtifactStore } from "../node-ports/artifact-store.js";
import { HostUploads } from "../uploads.js";

// Counts what the Host reads from disk, whichever fs call it goes through.
const io = vi.hoisted(() => ({ bytes: 0, listings: 0 }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    readdir: async (...args: unknown[]) => {
      io.listings++;
      return (fs.readdir as (...input: unknown[]) => Promise<unknown>)(...args);
    },
    readFile: async (...args: unknown[]) => {
      const content = await (fs.readFile as (...input: unknown[]) => Promise<string | Buffer>)(...args);
      io.bytes += content.length;
      return content;
    },
    open: async (...args: Parameters<typeof fs.open>) => {
      const file = await fs.open(...args),
        read = file.read.bind(file) as (...input: unknown[]) => Promise<{ bytesRead: number }>,
        readFile = file.readFile.bind(file) as (...input: unknown[]) => Promise<string | Buffer>;
      Object.assign(file, {
        read: async (...input: unknown[]) => {
          const result = await read(...input);
          io.bytes += result.bytesRead;
          return result;
        },
        readFile: async (...input: unknown[]) => {
          const content = await readFile(...input);
          io.bytes += content.length;
          return content;
        },
      });
      return file;
    },
  };
});

const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** A check is only remembered for a file whose last change is a while ago; file times come from the real clock. */
function later() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 60_000);
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "host-download-io-"));
  roots.push(root);
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const uploads = new HostUploads(join(root, "uploads")),
    store = new NodeArtifactStore(join(root, "data"));
  return { root, workspace, uploads, store, artifacts: new HostArtifacts(uploads, store) };
}
async function upload(uploads: HostUploads, bytes: Buffer) {
  const item = await uploads.begin({
    deviceId: "d",
    sessionId: "s",
    name: "upload.bin",
    size: bytes.length,
    sha256: sha256(bytes),
  });
  for (let offset = 0; offset < bytes.length; offset += 262144) {
    const chunk = bytes.subarray(offset, offset + 262144);
    await uploads.write("d", "s", item.id, offset, chunk.toString("base64"), sha256(chunk));
  }
  await uploads.finish("d", "s", item.id);
  await uploads.pin("d", "s", [item.id], "task");
  return item.id;
}
async function download(artifacts: HostArtifacts, id: string, size: number, chunkBytes: number) {
  const parts: Buffer[] = [];
  for (let offset = 0; offset < size; offset += chunkBytes) {
    const part = await artifacts.read("s", id, offset, chunkBytes),
      bytes = Buffer.from(part.data, "base64");
    expect(part).toMatchObject({ size, sha256: sha256(bytes) });
    parts.push(bytes);
  }
  return Buffer.concat(parts);
}
/** Flips one byte in place, repeating until the filesystem's clock has stepped past the last change. */
async function corrupt(path: string) {
  const before = await stat(path, { bigint: true });
  do {
    const file = await open(path, "r+");
    try {
      const byte = Buffer.alloc(1);
      await file.read(byte, 0, 1, 0);
      byte[0]! ^= 1;
      await file.write(byte, 0, 1, 0);
    } finally {
      await file.close();
    }
  } while ((await stat(path, { bigint: true })).ctimeNs === before.ctimeNs);
}

it("reads a workspace snapshot about twice over a whole chunked download, not once per chunk", async () => {
  const f = await fixture(),
    bytes = randomBytes(2 * 1024 * 1024 + 123);
  await writeFile(join(f.workspace, "result.bin"), bytes);
  const ref = await f.artifacts.reference("s", f.workspace, "result.bin");
  later();
  io.bytes = 0;
  expect(await f.artifacts.describe("s", ref.id)).toMatchObject({ size: bytes.length, sha256: sha256(bytes) });
  expect((await download(f.artifacts, ref.id, bytes.length, 64 * 1024)).equals(bytes)).toBe(true);
  // One pass to check the digest, one pass of chunks, and a small metadata file per call. It used to be 33 passes.
  expect(io.bytes).toBeGreaterThanOrEqual(2 * bytes.length);
  expect(io.bytes).toBeLessThan(2.1 * bytes.length);

  await corrupt(join(f.store.root, ref.id));
  await expect(f.artifacts.read("s", ref.id, 0, 1024)).rejects.toThrow("integrity");
  await expect(f.artifacts.describe("s", ref.id)).rejects.toThrow("integrity");
});

it("reads an uploaded attachment about twice over a whole chunked download, not twice per chunk", async () => {
  const f = await fixture(),
    bytes = randomBytes(600 * 1024 + 7),
    id = await upload(f.uploads, bytes);
  later();
  io.bytes = 0;
  expect(await f.artifacts.describe("s", id)).toMatchObject({
    size: bytes.length,
    sha256: sha256(bytes),
    mediaType: "application/octet-stream",
  });
  expect((await download(f.artifacts, id, bytes.length, 16 * 1024)).equals(bytes)).toBe(true);
  expect(io.bytes).toBeGreaterThanOrEqual(2 * bytes.length);
  expect(io.bytes).toBeLessThan(2.1 * bytes.length);

  await corrupt(join(f.root, "uploads", id, "content"));
  await expect(f.artifacts.read("s", id, 0, 1024)).rejects.toMatchObject({ kind: "RECOVERY_BLOCKED" });
  await expect(f.artifacts.describe("s", id)).rejects.toMatchObject({ kind: "RECOVERY_BLOCKED" });
});

it("lists the upload directory once, not on every new upload", async () => {
  const f = await fixture();
  const begin = () =>
    f.uploads.begin({ deviceId: "d", sessionId: "s", name: "file", size: 1024, sha256: sha256(Buffer.alloc(0)) });
  for (let index = 0; index < 20; index++) await begin();
  io.listings = 0;
  io.bytes = 0;
  for (let index = 0; index < 20; index++) await begin();
  expect(io).toEqual({ listings: 0, bytes: 0 });
  // The periodic cleanup re-reads everything, and the uploads after it still count from memory.
  await f.uploads.cleanup();
  expect(io.listings).toBe(1);
  await begin();
  expect(io.listings).toBe(1);
});
