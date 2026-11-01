import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SelectionStore } from "../selection-store.js";
import type { SelectionRecord } from "../contracts.js";
const stores: SelectionStore[] = []; const roots: string[] = [];
afterEach(async () => { await Promise.all(stores.splice(0).map(s => s.close())); await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function create(root?: string) { root ??= await mkdtemp(join(tmpdir(), "harness-store-")); roots.push(root); const store = new SelectionStore(root, "test"); stores.push(store); await store.open(); return store; }
const record = (revision: number): SelectionRecord => ({ schemaVersion: 1, activationId: `a${revision}`, requestDigest: "request", harnessId: "main", revision, previousRevision: revision - 1, executionDigest: "execution", description: { hostContractDigest: "test", composition: {} as never, artifactIds: [], sharedServices: [] }, authorization: { actor: "test", decisionId: "test" }, timestamp: new Date().toISOString() });
it("recovers durable revisions and rejects another writer", async () => {
  const first = await create(); await first.append(record(1));
  await expect(create(first.root)).rejects.toMatchObject({ code: "STORE_LOCKED" });
  await first.close(); const second = await create(first.root);
  expect(second.latest("main")?.revision).toBe(1);
  await second.append(record(2)); expect(second.records).toHaveLength(2);
});
it("preserves partial tail evidence while recovering complete records", async () => {
  const first = await create(); await first.append(record(1)); await first.close();
  const path = join(first.root, "selections.jsonl"); await writeFile(path, await readFile(path, "utf8") + '{"partial":');
  const second = await create(first.root); expect(second.records).toHaveLength(1);
  expect(await readFile(path, "utf8")).toMatch(/\n$/);
});
it("refuses a complete corrupted record", async () => {
  const first = await create(); await first.append(record(1)); await first.close();
  const path = join(first.root, "selections.jsonl"); const bytes = await readFile(path, "utf8"); await writeFile(path, bytes.replace('"execution"', '"changed"'));
  await expect(create(first.root)).rejects.toMatchObject({ code: "RECOVERY_BLOCKED" });
});

it("fails closed after losing the real filesystem writer lock", async () => {
  const store = await create(); await store.append(record(1));
  const ownerPath = join(store.root, ".writer-lock", "owner.json");
  const owner = JSON.parse(await readFile(ownerPath, "utf8"));
  await writeFile(ownerPath, JSON.stringify({ ...owner, nonce: "another-owner" }));
  await expect(store.assertOwned()).rejects.toMatchObject({ code: "DURABILITY_BLOCKED" });
  await expect(store.append(record(2))).rejects.toMatchObject({ code: "DURABILITY_BLOCKED" });
  expect(store.records).toHaveLength(1);
});
it("blocks further appends after a filesystem write failure", async () => {
  const store = await create();
  await mkdir(join(store.root, "selections.jsonl"));
  await expect(store.append(record(1))).rejects.toMatchObject({ code: "DURABILITY_BLOCKED" });
  await rm(join(store.root, "selections.jsonl"), { recursive: true });
  await expect(store.append(record(1))).rejects.toMatchObject({ code: "DURABILITY_BLOCKED" });
  expect(store.records).toHaveLength(0);
});
