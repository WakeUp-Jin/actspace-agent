import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { HostUploads } from "../uploads.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function fixture() { const root = await mkdtemp(join(tmpdir(), "host-upload-")); roots.push(root); return { root, store: new HostUploads(root) }; }
it("rejects oversized declarations and corrupt chunks without advancing the acknowledged offset", async () => {
  const { store } = await fixture();
  await expect(store.begin({ deviceId: "d", sessionId: "s", name: "huge", size: 21 * 1024 * 1024, sha256: hash("") })).rejects.toThrow();
  const item = await store.begin({ deviceId: "d", sessionId: "s", name: "file", size: 3, sha256: hash("abc") });
  await expect(store.write("d", "s", item.id, 0, Buffer.from("abc").toString("base64"), hash("bad"))).rejects.toThrow();
  expect((await store.status("d", "s", item.id)).offset).toBe(0);
  await store.write("d", "s", item.id, 0, Buffer.from("xyz").toString("base64"), hash("xyz"));
  await expect(store.finish("d", "s", item.id)).rejects.toThrow();
  await expect(store.pin("d", "s", [item.id], "task")).rejects.toThrow();
});
it("resumes acknowledged offsets after restart, retries identically and rejects conflicting bytes", async () => {
  const { root, store } = await fixture();
  const item = await store.begin({ deviceId: "d", sessionId: "s", name: "sample.txt", size: 6, sha256: hash("abcdef") });
  await store.write("d", "s", item.id, 0, Buffer.from("abc").toString("base64"), hash("abc"));
  await appendFile(join(root, item.id, "content"), "unacknowledged");
  const recovered = new HostUploads(root);
  expect((await recovered.status("d", "s", item.id)).offset).toBe(3);
  await expect(recovered.status("other", "s", item.id)).rejects.toThrow("ownership");
  expect((await recovered.write("d", "s", item.id, 0, Buffer.from("abc").toString("base64"), hash("abc"))).offset).toBe(3);
  await expect(recovered.write("d", "s", item.id, 0, Buffer.from("xyz").toString("base64"), hash("xyz"))).rejects.toThrow("differs");
  await recovered.write("d", "s", item.id, 3, Buffer.from("def").toString("base64"), hash("def"));
  await recovered.finish("d", "s", item.id);
  await recovered.pin("d", "s", [item.id], "submit");
  expect(await recovered.read("s", item.id, 0, 10)).toEqual({ data: Buffer.from("abcdef").toString("base64"), sha256: hash("abcdef"), size: 6 });
  await expect(recovered.read("other", item.id, 0, 10)).rejects.toThrow("not found");
});
it("protects pinned content from cleanup and abort, rejects ownership and incomplete pins", async () => {
  const { root } = await fixture(); let now = 0;
  const store = new HostUploads(root, () => now);
  const item = await store.begin({ deviceId: "d", sessionId: "s", name: "empty.txt", size: 0, sha256: hash("") });
  await expect(store.finish("other", "s", item.id)).rejects.toThrow("ownership");
  await expect(store.pin("d", "s", [item.id], "task")).rejects.toThrow("incomplete");
  await store.finish("d", "s", item.id);
  await store.pin("d", "s", [item.id], "task");
  const orphan = await store.begin({ deviceId: "d", sessionId: "s", name: "orphan.txt", size: 0, sha256: hash("") });
  now = 90_000_000; await store.cleanup();
  await expect(store.finish("d", "s", orphan.id)).rejects.toThrow("not found");
  await expect(store.abort("d", "s", item.id)).rejects.toThrow("cannot be deleted");
  expect((await store.read("s", item.id, 0, 1)).size).toBe(0);
});
it("counts only a device's unpinned uploads against its staging quota across pin, abort, restart, reconcile and cleanup", async () => {
  const { root } = await fixture(); let now = 0;
  const store = new HostUploads(root, () => now);
  const big = (uploads: HostUploads, deviceId = "d") => uploads.begin({ deviceId, sessionId: "s", name: "big.bin", size: 20 * 1024 * 1024, sha256: hash("") });
  const staged = [];
  for (let index = 0; index < 9; index++) staged.push(await big(store));
  const small = await store.begin({ deviceId: "d", sessionId: "s", name: "small.txt", size: 3, sha256: hash("abc") });
  await expect(big(store)).rejects.toMatchObject({ kind: "LIMIT_EXCEEDED" });
  await big(store, "other");

  await store.write("d", "s", small.id, 0, Buffer.from("abc").toString("base64"), hash("abc"));
  await store.finish("d", "s", small.id); await store.pin("d", "s", [small.id], "task");
  const tenth = await big(store);
  await expect(big(store)).rejects.toMatchObject({ kind: "LIMIT_EXCEEDED" });
  await store.abort("d", "s", tenth.id);
  await big(store);
  await expect(big(store)).rejects.toMatchObject({ kind: "LIMIT_EXCEEDED" });

  const reopened = new HostUploads(root, () => now);
  await expect(big(reopened)).rejects.toMatchObject({ kind: "LIMIT_EXCEEDED" });
  await reopened.abort("d", "s", staged[0]!.id);
  // The task behind the pin never became durable, so the 3-byte upload is staged again.
  await reopened.reconcilePins(async () => false);
  await expect(big(reopened)).rejects.toMatchObject({ kind: "LIMIT_EXCEEDED" });
  now = 90_000_000; await reopened.cleanup();
  for (let index = 0; index < 10; index++) await big(reopened);
  await expect(big(reopened)).rejects.toMatchObject({ kind: "LIMIT_EXCEEDED" });
});
it("reconciles orphan pins against durable tasks before staging cleanup", async () => {
  const { root } = await fixture(); let now = 0;
  const uploads = new HostUploads(root, () => now);
  const create = async (pin: string) => {
    const upload = await uploads.begin({ deviceId: "d", sessionId: "s", name: "file", size: 0, sha256: hash("") });
    await uploads.finish("d", "s", upload.id); await uploads.pin("d", "s", [upload.id], pin); return upload;
  };
  const committed = await create("committed"), orphan = await create("orphan");
  await uploads.reconcilePins(async (_session, id) => id === "committed"); now = 90_000_000; await uploads.cleanup();
  expect((await uploads.describe("s", committed.id)).complete).toBe(true);
  await expect(uploads.describe("s", orphan.id)).rejects.toThrow("not found");
});
