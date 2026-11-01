import { afterEach, expect, test } from "vitest";
import { mkdtemp, writeFile, appendFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionHeader } from "@actspace/session-journal";
import { JsonlQueryReader } from "./query-reader.js";

// The provider Worker is a built artifact, tested independently of Vitest transforms.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "jsonl-query-test-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const { JsonlQueryReader: BuiltReader } = await import(new URL("../dist/query-reader.js", import.meta.url).href);
  const reader: JsonlQueryReader = new BuiltReader();
  cleanup.push(() => reader.close());
  const path = join(root, "journal.jsonl");
  const header = createSessionHeader({ sessionId: "test", createdAt: new Date().toISOString(), lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "v2", manifestDigest: "test", plugins: [], codecSetDigest: "test" } });
  await writeFile(path, JSON.stringify(header) + "\n");
  return { reader, path };
}
function event(seq: number, text = "test") {
  return { recordKind: "event", seq, type: "test/value", eventVersion: 1, criticality: "ignorable", time: new Date().toISOString(), source: { ownerPluginId: "test" }, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null }, data: { text }, surface: null };
}

test("bounded batches resume exactly at the durable prefix and continue after append", async () => {
  const { reader, path } = await fixture();
  await appendFile(path, Array.from({ length: 600 }, (_, i) => JSON.stringify(event(i))).join("\n") + "\n");
  let cursor: string | undefined; const seqs: number[] = [];
  for (;;) {
    const batch = await reader.read(path, "test", { throughSeq: 599, cursor });
    expect(batch.events.length).toBeLessThanOrEqual(256);
    seqs.push(...batch.events.map(item => item.seq)); cursor = batch.cursor;
    if (batch.done) break;
  }
  expect(seqs).toEqual(Array.from({ length: 600 }, (_, i) => i));
  await appendFile(path, JSON.stringify(event(600)) + "\n" + '{"partial":');
  const appended = await reader.read(path, "test", { throughSeq: 600, cursor });
  expect(appended.events.map(item => item.seq)).toEqual([600]);
  expect(appended.done).toBe(true);
});

test("cursor rejects truncation, foreign session and a changed boundary", async () => {
  const { reader, path } = await fixture();
  await appendFile(path, JSON.stringify(event(0)) + "\n");
  const { cursor } = await reader.read(path, "test", { throughSeq: 0 });
  await expect(reader.read(path, "other", { throughSeq: 1, cursor })).rejects.toThrow(/invalidated/);
  await writeFile(path, "{}\n");
  await expect(reader.read(path, "test", { throughSeq: 1, cursor })).rejects.toThrow(/invalidated/);
});

test("sequence gaps and incomplete requested tails never advance a cursor", async () => {
  const { reader, path } = await fixture();
  await appendFile(path, JSON.stringify(event(1)) + "\n");
  await expect(reader.read(path, "test", { throughSeq: 1 })).rejects.toThrow(/discontinuous/);
});

test("provider closes its reader and rejects later work", async () => {
  const { reader, path } = await fixture();
  await reader.read(path, "test", { throughSeq: -1 });
  await reader.close();
  await expect(reader.read(path, "test", { throughSeq: -1 })).rejects.toThrow(/closed/);
});

test("query descriptor uses the complete prefix, detects appends and never reads all events", async () => {
  const { reader, path } = await fixture();
  const empty = await reader.source(path, "test");
  expect(empty.throughSeq).toBe(-1);
  await appendFile(path, Array.from({ length: 1000 }, (_, i) => JSON.stringify(event(i))).join("\n") + "\n" + '{"partial":');
  const next = await reader.source(path, "test");
  expect(next.throughSeq).toBe(999);
  expect(next.stamp).not.toBe(empty.stamp);
  expect(await reader.source(path, "test")).toEqual(next);
});


test("event type filtering advances the physical cursor with bounded empty batches", async () => {
  const { reader, path } = await fixture();
  await appendFile(path, Array.from({ length: 2000 }, (_, i) => JSON.stringify(event(i))).join("\n") + "\n");
  const unfiltered = await reader.read(path, "test", { throughSeq: 1999 });
  const first = await reader.read(path, "test", { throughSeq: 1999, eventTypes: ["session/workspace-set"] });
  expect(first.events).toEqual([]);
  expect(first.done).toBe(false);
  const next = await reader.read(path, "test", { throughSeq: 1999, cursor: first.cursor });
  expect(next.events[0]?.seq).toBe(unfiltered.events.at(-1)!.seq + 1);
});


test("cached descriptors detect same-length file replacement and do not hide deletion", async () => {
  const { reader, path } = await fixture();
  const first = await reader.source(path, "test");
  await rename(path, `${path}.old`);
  const { readFile } = await import("node:fs/promises");
  await writeFile(path, await readFile(`${path}.old`));
  const replacement = await reader.source(path, "test");
  expect(replacement.stamp).not.toBe(first.stamp);
  expect(replacement.throughSeq).toBe(first.throughSeq);
  await rm(path);
  await expect(reader.source(path, "test")).rejects.toThrow(/ENOENT/);
});
