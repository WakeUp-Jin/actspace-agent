import { afterEach, describe, expect, it } from "vitest";
import { appendFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCoreCodecRegistry, createSessionHeader, SessionJournal } from "@actspace/session-journal";
import { RuntimeSessionController, slimHistoryWindow } from "./session-controller.js";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(turns = 25) {
  const root = await mkdtemp(join(tmpdir(), "projection-")); roots.push(root);
  const registry = createCoreCodecRegistry();
  const header = createSessionHeader({ sessionId: "s", createdAt: "2026-09-21T00:00:00Z", cwd: "/workspace", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } });
  const journal = new SessionJournal({ registry });
  const turn = (id: number) => {
    journal.append({ type: "turn/start", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { turnId: `t${id}` }, surface: null });
    journal.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: `u${id}`, content: `question ${id}` }, surface: { kind: "append", node: { kind: "user", messageId: `u${id}`, content: `question ${id}` } } });
    journal.append({ type: "turn/end", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { turnId: `t${id}` }, surface: null });
  };
  for (let id = 0; id < turns; id++) turn(id);
  await mkdir(join(root, "sessions-v2", "s"), { recursive: true });
  const path = join(root, "sessions-v2", "s", "journal.jsonl");
  const cache = join(root, "sessions-v2", "s", "projection-checkpoint.json");
  await writeFile(path, [header, ...journal.events].map(value => JSON.stringify(value)).join("\n") + "\n");
  const controller = () => new RuntimeSessionController({ dataRoot: root, registry, runtimeId: "test", profileId: "test", manifestDigest: "test", plugins: [] });
  return { root, path, cache, journal, turn, controller };
}

describe("history window slimming", () => {
  const envelope = (seq: number, type: string, data: Record<string, unknown>) => ({ seq, type, time: "2026-09-26T00:00:00Z", data, surface: null }) as unknown as SessionEventEnvelopeV1;
  const bigContext = (seq: number, requestId: string) => envelope(seq, "request/context", { requestId, turnId: "t", stepId: "s", snapshot: { prepared: { model: "m", route: "r", contextWindow: 1000, messages: "x".repeat(30_000) }, requestOptions: { temperature: 0 } } });

  it("drops chunks of completed messages but keeps an in-flight message's chunks", () => {
    const out = slimHistoryWindow([
      envelope(0, "assistant/chunk", { messageId: "done", content: "a" }),
      envelope(1, "assistant/message", { messageId: "done", content: "a" }),
      envelope(2, "assistant/chunk", { messageId: "live", content: "b" }),
    ]);
    expect(out.map(event => event.seq)).toEqual([1, 2]);
  });

  it("keeps the latest request context whole and bounds older large ones to identity fields", () => {
    const [older, latest] = slimHistoryWindow([bigContext(0, "r0"), bigContext(1, "r1")]);
    expect(older!.data).toEqual({ deferredDetail: true, turnId: "t", stepId: "s", requestId: "r0", snapshot: { prepared: { model: "m", route: "r", contextWindow: 1000 }, requestOptions: { temperature: 0 } } });
    expect(JSON.stringify(latest!.data)).toContain("x".repeat(30_000));
  });
});

describe("production Session projections", () => {
  it("pages the same raw history for every target while facts cover the full Session", async () => {
    const f = await fixture(); const controller = f.controller();
    const tail = await controller.readProjection({ sessionId: "s" });
    // 一页 20 轮：25 轮会话首屏 20 轮，第二页取剩余 5 轮即到头。
    expect(tail.window.events).toHaveLength(60);
    expect(tail.window.turnOffset).toBe(5);
    expect(tail.snapshot.activity.completedTurnCount).toBe(25);
    const older = await controller.readProjection({ sessionId: "s", beforeSeq: tail.window.beforeSeq! });
    expect(older.window.events).toHaveLength(15);
    expect(older.window.turnOffset).toBe(0);
    expect(older.window.beforeSeq).toBeNull();
    expect(older.values.sessionStats).toEqual(tail.values.sessionStats);
    const full = await controller.readProjection({ sessionId: "s", afterSeq: -1, includeToolDetails: true });
    expect(full.snapshot.messages).toHaveLength(25);
    expect(full.window.events).toHaveLength(75);
    expect((await f.controller().readProjection({ sessionId: "s" })).window).toEqual(tail.window);
  });

  it("replays only appended events from the stored state and survives deleting the cache", async () => {
    const f = await fixture(1); const controller = f.controller();
    const before = await controller.inspect("s");
    f.turn(1);
    await appendFile(f.path, f.journal.events.slice(before.throughJournalSeq + 1).map(event => JSON.stringify(event)).join("\n") + "\n");
    const after = await f.controller().inspect("s");
    expect(after.activity.completedTurnCount).toBe(2);
    expect(JSON.parse(await readFile(f.cache, "utf8")).checkpoint.throughJournalSeq).toBe(5);
    await rm(f.cache);
    expect(await f.controller().inspect("s")).toEqual(after);
  });

  it("rebuilds corrupt and shortened checkpoints without changing Journal bytes", async () => {
    const f = await fixture(1); const bytes = await readFile(f.path);
    const expected = await f.controller().inspect("s");
    await writeFile(f.cache, "invalid json");
    expect(await f.controller().inspect("s")).toEqual(expected);
    f.turn(1); await appendFile(f.path, f.journal.events.slice(3).map(event => JSON.stringify(event)).join("\n") + "\n");
    await f.controller().inspect("s"); await writeFile(f.path, bytes);
    expect(await f.controller().inspect("s")).toEqual(expected);
    expect(await readFile(f.path)).toEqual(bytes);
  });

  it("rebuilds the disposable global index from Session projections", async () => {
    const f = await fixture(2); const controller = f.controller();
    expect((await controller.browseSessions()).items).toHaveLength(1);
    const index = join(f.root, "global-session-index.json");
    expect(JSON.parse(await readFile(index, "utf8")).summaries[0].throughJournalSeq).toBe(5);
    await rm(index);
    expect((await f.controller().browseSessions()).items[0]).toMatchObject({ sessionId: "s", completedTurnCount: 2 });
  });

  it("keeps the global index at the Journal tail after close and repairs stale entries on cold reads", async () => {
    const f = await fixture(1); const controller = f.controller();
    await controller.browseSessions(); await controller.resume("s"); await controller.closeAll();
    const index = join(f.root, "global-session-index.json");
    const tail = JSON.parse((await readFile(f.path, "utf8")).trim().split("\n").at(-1)!);
    expect(tail.type).toBe("session/end-seed");
    const stored = JSON.parse(await readFile(index, "utf8"));
    expect(stored.summaries[0].throughJournalSeq).toBe(tail.seq);
    stored.summaries[0].throughJournalSeq = tail.seq - 1; await writeFile(index, JSON.stringify(stored));
    const reader = f.controller();
    expect((await reader.globalSessionSummaries())[0].throughJournalSeq).toBe(tail.seq - 1);
    expect((await reader.inspect("s")).throughJournalSeq).toBe(tail.seq);
    expect((await reader.globalSessionSummaries())[0].throughJournalSeq).toBe(tail.seq);
    expect(JSON.parse(await readFile(index, "utf8")).summaries[0].throughJournalSeq).toBe(tail.seq);
  });

  it("defers large tool results for browsing but preserves failed status and complete reads", async () => {
    const f = await fixture(1);
    const output = "x".repeat(26_000);
    f.journal.append({ type: "turn/start", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { turnId: "tool-turn" }, surface: null });
    f.journal.append({ type: "step/start", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { turnId: "tool-turn", stepId: "tool-step" }, surface: null });
    f.journal.append({ type: "tool/call", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { callId: "c", name: "bash", pluginId: "core", args: { command: output } }, surface: null });
    f.journal.append({ type: "tool/result", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { callId: "c", name: "bash", status: "failed", summary: "failed", modelOutput: [{ type: "text", text: output }], failure: { code: "EXIT", message: "failed", retryable: false } }, surface: { kind: "append", node: { kind: "tool-result", messageId: "result", callId: "c", content: output, isError: true } } });
    await appendFile(f.path, f.journal.events.slice(3).map(event => JSON.stringify(event)).join("\n") + "\n");
    const controller = f.controller();
    const page = await controller.readProjection({ sessionId: "s" });
    expect(page.deferredToolCalls).toEqual(["c"]);
    expect(page.snapshot.tools[0]?.state).toBe("failed");
    expect(JSON.stringify(page.window)).not.toContain(output);
    expect(JSON.stringify(page.window).length).toBeLessThan(24_000);
    const full = await controller.readProjection({ sessionId: "s", afterSeq: -1, includeToolDetails: true });
    expect(full.deferredToolCalls).toEqual([]);
    expect(JSON.stringify(full.window)).toContain(output);
    expect(JSON.stringify(await controller.browseToolDetail("s", "c"))).toContain(output);
  });

  it("rejects invalid cursors and Session paths", async () => {
    const f = await fixture(1);
    await expect(f.controller().readProjection({ sessionId: "s", beforeSeq: -1 })).rejects.toThrow("cursor");
    await expect(f.controller().readProjection({ sessionId: "../other" })).rejects.toThrow("Invalid session");
  });

  it("returns an observation with independent watermarks and enforces window caps", async () => {
    const f = await fixture(25); const controller = f.controller();
    const observation = await controller.readObservation({ sessionId: "s", maxWindowEvents: 10, maxWindowBytes: 5_000 });
    expect(observation.kind).toBe("session-observation");
    expect(observation.projection.values.sessionStats).toEqual(observation.snapshot.activity);
    expect(observation.watermarks.projectionThroughSeq).toBe(observation.snapshot.throughJournalSeq);
    expect(observation.window?.events.length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(observation.window).length).toBeGreaterThan(0);
  });
});
