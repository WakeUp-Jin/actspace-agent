import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { appendFile, mkdtemp, readFile, rename, rm, stat, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, SessionJournal, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionStorageSnapshot } from "@actspace/session-storage";
import { JsonlSessionStorage } from "../storage.js";

// Count what the Journal reader really pulls from disk, so "unchanged reads a bounded tail" is a measured property.
const reads = vi.hoisted(() => ({ calls: 0, bytes: 0 }));
// When set, every stat of an opened Journal answers this instead: what the reader sees when a write
// lands in the same timestamp tick as the previous read (size and timestamps do not move).
const heldStat = vi.hoisted(() => ({ value: null as Stats | null }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      return new Proxy(handle, { get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (key === "readFile") return async (...a: unknown[]) => { const buffer = await (value as Function).apply(target, a) as Buffer; reads.calls++; reads.bytes += buffer.length; return buffer; };
        if (key === "read") return async (...a: unknown[]) => { const result = await (value as Function).apply(target, a) as { bytesRead: number }; reads.calls++; reads.bytes += result.bytesRead; return result; };
        if (key === "stat") return async () => heldStat.value ?? await target.stat();
        return typeof value === "function" ? value.bind(target) : value;
      } });
    },
  };
});

const registry = createCoreCodecRegistry();
let dataRoot: string;
let storage: JsonlSessionStorage;
let journal: SessionJournal;
beforeEach(async () => {
  dataRoot = await mkdtemp(join(tmpdir(), "jsonl-refresh-"));
  storage = new JsonlSessionStorage({ dataRoot, runtimeId: "test", registry });
  journal = new SessionJournal({ registry });
  reads.calls = 0; reads.bytes = 0;
  heldStat.value = null;
});
afterEach(async () => { await storage.close(); await rm(dataRoot, { recursive: true, force: true }); });

async function createSession(id: string, titles: readonly string[] = []): Promise<string> {
  const header = createSessionHeader({ sessionId: id, createdAt: "2026-11-04T00:00:00.000Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } });
  const handle = await storage.create(header);
  await handle.close();
  const path = storage.journalPath(id);
  if (titles.length) await appendEvents(path, titles);
  return path;
}
function titleEvent(title: string): SessionEventEnvelopeV1 {
  return journal.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title }, surface: null });
}
async function appendEvents(path: string, titles: readonly string[]): Promise<void> {
  await appendFile(path, titles.map(title => JSON.stringify(titleEvent(title)) + "\n").join(""));
}
const sha = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");
const bigTitle = (n: number) => "x".repeat(n);

/** What callers may observe must equal a from-scratch read. */
async function expectSameAsFresh(id: string, snapshot: SessionStorageSnapshot): Promise<void> {
  const fresh = await storage.inspect(id);
  expect(snapshot.events).toEqual(fresh.events);
  expect(snapshot.header).toEqual(fresh.header);
  expect(snapshot.revision).toBe(fresh.revision);
  expect(snapshot.integrity).toBe(fresh.integrity);
  expect(snapshot.problem).toBe(fresh.problem);
  expect(snapshot.bytes).toBe(fresh.bytes);
  expect(snapshot.validated).toEqual(fresh.validated);
}

it("unchanged Journal: refresh returns the same snapshot and re-reads only the 4 KiB tail, however large the file is", async () => {
  const path = await createSession("same", Array.from({ length: 200 }, (_, i) => `${i}${bigTitle(500)}`));
  const base = await storage.inspect("same");
  expect(reads.bytes).toBeGreaterThan(100_000); // control: the spy sees a full read
  reads.calls = 0; reads.bytes = 0;
  const result = await storage.refresh("same", base);
  expect(result).toEqual({ kind: "unchanged", snapshot: base });
  expect(result.snapshot).toBe(base);
  expect(reads.bytes).toBe(4096);
  // Still refreshable afterwards: an unchanged answer must not consume the resume state.
  await appendEvents(path, ["c"]);
  expect((await storage.refresh("same", base)).kind).toBe("appended");
});

it("unchanged Journal smaller than the tail window: the comparison covers the whole file", async () => {
  const path = await createSession("small", ["a", "b"]);
  const base = await storage.inspect("small");
  reads.calls = 0; reads.bytes = 0;
  expect((await storage.refresh("small", base)).kind).toBe("unchanged");
  expect(reads.bytes).toBe((await stat(path)).size);
});

it("append: reads only the new bytes, parses only new events, and matches a full read exactly (revision is still the file sha256)", async () => {
  const path = await createSession("grow", Array.from({ length: 200 }, (_, i) => `${i}${bigTitle(500)}`));
  const base = await storage.inspect("grow");
  expect(base.revision).toBe(await sha(path));
  const added = ["new-1", "new-2", "new-3"];
  await appendEvents(path, added);
  reads.calls = 0; reads.bytes = 0;
  const result = await storage.refresh("grow", base);
  expect(result.kind).toBe("appended");
  if (result.kind !== "appended") return;
  expect(result.fromEvent).toBe(base.events.length);
  expect(result.snapshot.events.length).toBe(base.events.length + added.length);
  expect(result.snapshot.events.slice(0, base.events.length)).toEqual(base.events);
  expect(result.snapshot.revision).toBe(await sha(path));
  // 200 events * ~700 bytes are not re-read: only the 4 KiB overlap plus the new lines.
  expect(reads.bytes).toBeGreaterThan(0);
  expect(reads.bytes).toBeLessThan(4096 + 3 * 400);
  await expectSameAsFresh("grow", result.snapshot);
  // A refreshed snapshot is itself refreshable (chained appends keep the running hash correct).
  await appendEvents(path, ["new-4"]);
  const chained = await storage.refresh("grow", result.snapshot);
  expect(chained.kind).toBe("appended");
  expect(chained.snapshot.revision).toBe(await sha(path));
  await expectSameAsFresh("grow", chained.snapshot);
});

it("append of only blank lines is still an append with no new events", async () => {
  const path = await createSession("blank", ["a"]);
  const base = await storage.inspect("blank");
  await appendFile(path, "\n\n");
  const result = await storage.refresh("blank", base);
  expect(result.kind).toBe("appended");
  expect(result.snapshot.events).toHaveLength(base.events.length);
  expect(result.snapshot.revision).toBe(await sha(path));
});

it("truncation falls back to a full read", async () => {
  const path = await createSession("shrink", ["a", "b", "c"]);
  const base = await storage.inspect("shrink");
  const lines = (await readFile(path, "utf8")).split("\n");
  await truncate(path, Buffer.byteLength(lines.slice(0, 3).join("\n") + "\n"));
  const result = await storage.refresh("shrink", base);
  expect(result.kind).toBe("replaced");
  expect(result.snapshot.events).toHaveLength(2);
  await expectSameAsFresh("shrink", result.snapshot);
});

it("same-size rewrite falls back to a full read", async () => {
  const path = await createSession("rewrite", ["aaaa", "bbbb"]);
  const base = await storage.inspect("rewrite");
  await writeFile(path, (await readFile(path, "utf8")).replace("aaaa", "zzzz"));
  const result = await storage.refresh("rewrite", base);
  expect(result.kind).toBe("replaced");
  expect(JSON.stringify(result.snapshot.events)).toContain("zzzz");
  expect(result.snapshot.revision).not.toBe(base.revision);
});

it("same-size rewrite whose stamp did not move (same timestamp tick as the read) still falls back to a full read", async () => {
  const path = await createSession("same-tick", ["aaaa", "bbbb"]);
  const base = await storage.inspect("same-tick");
  heldStat.value = await stat(path);
  await writeFile(path, (await readFile(path, "utf8")).replace("aaaa", "zzzz"));
  const result = await storage.refresh("same-tick", base);
  expect(result.kind).toBe("replaced");
  expect(JSON.stringify(result.snapshot.events)).toContain("zzzz");
  expect(result.snapshot.revision).not.toBe(base.revision);
  expect(result.snapshot.revision).toBe(await sha(path));
});

it("growth combined with an in-place edit of already-consumed bytes falls back to a full read", async () => {
  const path = await createSession("edit-and-grow", ["aaaa", "bbbb"]);
  const base = await storage.inspect("edit-and-grow");
  await writeFile(path, (await readFile(path, "utf8")).replace("bbbb", "BBBB"));
  await appendEvents(path, ["tail"]);
  const result = await storage.refresh("edit-and-grow", base);
  expect(result.kind).toBe("replaced");
  expect(JSON.stringify(result.snapshot.events)).toContain("BBBB");
  await expectSameAsFresh("edit-and-grow", result.snapshot);
});

it("a different file at the same path (rename-over, as repair does) falls back to a full read", async () => {
  const path = await createSession("replaced-file", ["a"]);
  const base = await storage.inspect("replaced-file");
  const longer = (await readFile(path, "utf8")) + JSON.stringify(titleEvent("b")) + "\n" + JSON.stringify(titleEvent("c")) + "\n";
  await writeFile(`${path}.next`, longer);
  await rename(`${path}.next`, path);
  const result = await storage.refresh("replaced-file", base);
  expect(result.kind).toBe("replaced");
  expect(result.snapshot.events).toHaveLength(3);
  await expectSameAsFresh("replaced-file", result.snapshot);
});

it("a partial trailing line is reported by the full reader exactly like a fresh inspect", async () => {
  const path = await createSession("torn", ["a"]);
  const base = await storage.inspect("torn");
  await appendFile(path, '{"recordKind":"event","seq":2,');
  const result = await storage.refresh("torn", base);
  expect(result.kind).toBe("replaced");
  expect(result.snapshot.integrity).toBe("repair-required");
  expect(result.snapshot.problem).toContain("torn final line");
  await expectSameAsFresh("torn", result.snapshot);
  // The torn snapshot is never extensible.
  await appendFile(path, "x\n");
  expect((await storage.refresh("torn", result.snapshot)).kind).toBe("replaced");
});

it("an appended event that fails validation yields the same corruption report as a fresh inspect", async () => {
  const path = await createSession("invalid", ["a"]);
  const base = await storage.inspect("invalid");
  const skipped = titleEvent("skipped-seq"); // consume a seq so the next line has a gap
  void skipped;
  await appendFile(path, JSON.stringify(titleEvent("gap")) + "\n");
  const result = await storage.refresh("invalid", base);
  expect(result.kind).toBe("replaced");
  expect(result.snapshot.integrity).toBe("repair-required");
  await expectSameAsFresh("invalid", result.snapshot);
  await appendFile(path, "not json\n");
  const garbage = await storage.refresh("invalid", base);
  expect(garbage.kind).toBe("replaced");
  await expectSameAsFresh("invalid", garbage.snapshot);
});

it("resume state is single-use: a second refresh of the same base is a safe full read", async () => {
  const path = await createSession("single-use", ["a"]);
  const base = await storage.inspect("single-use");
  await appendEvents(path, ["b"]);
  expect((await storage.refresh("single-use", base)).kind).toBe("appended");
  const second = await storage.refresh("single-use", base);
  expect(second.kind).toBe("replaced");
  await expectSameAsFresh("single-use", second.snapshot);
});

it("a snapshot not produced by this storage (or a missing file) refreshes as a full read or rejects like inspect", async () => {
  await createSession("foreign", ["a"]);
  const base = await storage.inspect("foreign");
  const copy = { ...base };
  expect((await storage.refresh("foreign", copy)).kind).toBe("replaced");
  await rm(join(dataRoot, "sessions-v2", "foreign"), { recursive: true });
  await expect(storage.refresh("foreign", base)).rejects.toThrow();
});

it("snapshots expose bytes and the codec digest validation ran under", async () => {
  const path = await createSession("meta", ["a"]);
  const snapshot = await storage.inspect("meta");
  expect(snapshot.bytes).toBe((await readFile(path)).length);
  expect(snapshot.validated).toMatchObject({ codecDigest: registry.digest, accessState: "read-write", result: { accessState: "read-write", diagnostics: [] } });
});
