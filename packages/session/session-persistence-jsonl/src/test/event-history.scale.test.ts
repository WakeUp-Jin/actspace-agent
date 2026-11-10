import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { syntheticSessionEvents } from "@actspace/session-journal/testing";
import { JsonlEventHistory } from "../event-history.js";

// 规模测试（perf-memory-conventions.md §3、§8）：从文件读回旧事件时，刚 JSON.parse 出来的对象只校验、冻结，不再 snapshotSessionJson 深拷贝一份（perf-backlog P4）。
const copies = vi.hoisted(() => ({ snapshots: 0 }));
vi.mock("@actspace/session-journal", async importOriginal => {
  const actual = await importOriginal<typeof import("@actspace/session-journal")>();
  return { ...actual, snapshotSessionJson: (value: unknown) => { copies.snapshots += 1; return actual.snapshotSessionJson(value); } };
});

let dataRoot: string | undefined;
afterEach(async () => { if (dataRoot) await rm(dataRoot, { recursive: true, force: true }); dataRoot = undefined; });

async function readAll(count: number) {
  const events = syntheticSessionEvents(count);
  const root = await mkdtemp(join(tmpdir(), "jsonl-history-scale-"));
  const path = join(root, "journal.jsonl");
  await writeFile(path, [JSON.stringify({ recordKind: "header" }), ...events.map(event => JSON.stringify(event))].join("\n") + "\n");
  const history = new JsonlEventHistory(path, events.length);
  try {
    copies.snapshots = 0;
    const read = history.readEvents(0, events.length);
    return { events, read, snapshots: copies.snapshots };
  } finally { history.close(); await rm(root, { recursive: true, force: true }); }
}

it("reads archived events without copying them and still hands out frozen, equal events", async () => {
  const small = await readAll(1_000);
  expect(small.snapshots).toBe(0);
  const { events, read, snapshots } = await readAll(10_000);
  expect(snapshots).toBe(small.snapshots);
  expect(read).toEqual(events);
  for (const event of read.slice(0, 50)) {
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.data)).toBe(true);
    expect(Object.isFrozen(event.provenance.sourceEventSeqs)).toBe(true);
  }
}, 30_000);

it("still rejects records that fail validation", async () => {
  dataRoot = await mkdtemp(join(tmpdir(), "jsonl-history-invalid-"));
  const path = join(dataRoot, "journal.jsonl");
  const event = { ...syntheticSessionEvents(20)[0]!, data: { authorization: "secret" } };
  await writeFile(path, `${JSON.stringify({ recordKind: "header" })}\n${JSON.stringify(event)}\n`);
  const history = new JsonlEventHistory(path, 1);
  try { expect(() => history.readEvents(0, 1)).toThrow(/forbidden secret field/); } finally { history.close(); }
});
