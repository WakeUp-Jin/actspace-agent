import { SessionStore } from "@actspace/session-persistence";
import { JsonlSessionStorage } from "@actspace/session-persistence-jsonl";
import { afterEach, describe, expect, it } from "vitest";
import { appendFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createCoreCodecRegistry,
  createSessionHeader,
  defaultSessionProvenance,
  SessionJournal,
} from "@actspace/session-journal";
import { createSessionProjectionService } from "@actspace/session-projection";
import { todoProjectionContributor, TodoService } from "@actspace/tool-todo";
import { codecs as todoCodecs } from "@actspace/tool-todo/codec";
import { RuntimeSessionController, slimHistoryWindow } from "./session-controller.js";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(turns = 25) {
  const root = await mkdtemp(join(tmpdir(), "projection-"));
  roots.push(root);
  const registry = createCoreCodecRegistry();
  const header = createSessionHeader({
    sessionId: "s",
    createdAt: "2026-09-21T00:00:00Z",
    cwd: "/workspace",
    lineage: null,
    createdWith: {
      profileId: "test",
      runtimeContractVersion: "1",
      manifestDigest: "test",
      plugins: [],
      codecSetDigest: registry.digest,
    },
  });
  const journal = new SessionJournal({ registry });
  const turn = (id: number) => {
    journal.append({
      type: "turn/start",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: { turnId: `t${id}` },
      surface: null,
    });
    journal.append({
      type: "user/message",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: { messageId: `u${id}`, content: `question ${id}` },
      surface: { kind: "append" },
    });
    journal.append({
      type: "turn/end",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: { turnId: `t${id}` },
      surface: null,
    });
  };
  for (let id = 0; id < turns; id++) turn(id);
  await mkdir(join(root, "sessions-v2", "s"), { recursive: true });
  const path = join(root, "sessions-v2", "s", "journal.jsonl");
  const cache = join(root, "sessions-v2", "s", "projection-checkpoint.json");
  await writeFile(path, [header, ...journal.events].map((value) => JSON.stringify(value)).join("\n") + "\n");
  const controller = () =>
    new RuntimeSessionController(
      { dataRoot: root, registry, runtimeId: "test", profileId: "test", manifestDigest: "test", plugins: [] },
      new SessionStore({ registry }, new JsonlSessionStorage({ dataRoot: root, registry, runtimeId: "test" })),
    );
  return { root, path, cache, journal, turn, controller };
}

describe("history window slimming", () => {
  const envelope = (seq: number, type: string, data: Record<string, unknown>) =>
    ({ seq, type, time: "2026-09-26T00:00:00Z", data, surface: null }) as unknown as SessionEventEnvelopeV1;

  it("drops chunks of completed messages but keeps an in-flight message's chunks", () => {
    const out = slimHistoryWindow([
      envelope(0, "assistant/chunk", { messageId: "done", content: "a" }),
      envelope(1, "assistant/message", { messageId: "done", content: "a" }),
      envelope(2, "assistant/chunk", { messageId: "live", content: "b" }),
    ]);
    expect(out.map((event) => event.seq)).toEqual([1, 2]);
  });

  it("retains observed first token timing without restoring completed chunks", () => {
    const empty = { ...envelope(0, "assistant/chunk", { messageId: "done", delta: "" }), time: "2026-09-26T00:00:01Z" };
    const token = {
      ...envelope(1, "assistant/chunk", { messageId: "done", delta: "hello" }),
      time: "2026-09-26T00:00:02Z",
    };
    const done = envelope(2, "assistant/message", { messageId: "done", content: "hello" });
    const unknown = envelope(3, "assistant/message", { messageId: "no-chunks", content: "unknown" });
    const out = slimHistoryWindow([empty, token, done, unknown]);
    expect(out.map((event) => event.seq)).toEqual([2, 3]);
    expect(out[0].data).toMatchObject({ firstTokenAt: token.time });
    expect(out[1].data).not.toHaveProperty("firstTokenAt");
    expect(done.data).not.toHaveProperty("firstTokenAt");
    expect(
      slimHistoryWindow([{ ...done, data: { ...(done.data as object), firstTokenAt: empty.time } }])[0].data,
    ).toMatchObject({ firstTokenAt: empty.time });
  });

  it("keeps small request contexts and prompt / tool records as they are", () => {
    const records = [
      envelope(0, "request/system-prompt", {
        requestId: "r0",
        turnId: "t",
        stepId: "s",
        digest: "p",
        sections: [],
        modelFacts: [],
        contributorProvenance: [],
      }),
      envelope(1, "request/tools", {
        requestId: "r0",
        turnId: "t",
        stepId: "s",
        digest: "t",
        tools: [{ name: "read" }],
      }),
      envelope(2, "request/context", {
        requestId: "r0",
        turnId: "t",
        stepId: "s",
        snapshot: { schemaVersion: 3, requestOptions: { temperature: 0 } },
      }),
      envelope(3, "request/context", {
        requestId: "r1",
        turnId: "t",
        stepId: "s",
        snapshot: { schemaVersion: 3, requestOptions: { temperature: 0 } },
      }),
    ];
    expect(slimHistoryWindow(records)).toEqual(records);
  });
});

describe("production Session projections", () => {
  it("persists a new worktree binding through cold reopen and sidebar projection", async () => {
    const f = await fixture(0);
    const worktree = {
      kind: "worktree" as const,
      sourceWorkspaceRoot: "/repo",
      workspaceRoot: "/worktrees/new",
      baseBranch: "main",
      branch: "codex/new",
      baseCommit: "abc",
      createdAt: "2026-10-07T00:00:00Z",
    };
    const writer = f.controller();
    const session = await writer.create("worktree", worktree.workspaceRoot, "agent", worktree);
    expect(writer.snapshot(session).worktree).toEqual(worktree);
    await session.flush();
    await writer.closeAll();
    const reader = f.controller();
    expect((await reader.inspect("worktree")).worktree).toEqual(worktree);
    expect((await reader.list()).find((item) => item.sessionId === "worktree")?.worktree).toEqual(worktree);
    await reader.closeAll();
  });

  it("rebuilds Todo contributions from the selected storage after controller restart", async () => {
    const f = await fixture(0);
    const registry = createCoreCodecRegistry(todoCodecs);
    const controller = () => {
      const projectionService = createSessionProjectionService();
      projectionService.registerContributor(todoProjectionContributor);
      return new RuntimeSessionController(
        {
          dataRoot: f.root,
          registry,
          runtimeId: "test",
          profileId: "test",
          manifestDigest: "test",
          plugins: [],
          projectionService,
        },
        new SessionStore({ registry }, new JsonlSessionStorage({ dataRoot: f.root, registry, runtimeId: "test" })),
      );
    };
    const writer = controller();
    const session = await writer.resume("s");
    await new TodoService(session).create("Restore plugin projection", "todo-1");
    await session.flush();
    await writer.closeAll();
    const cold = await controller().inspect("s");
    expect(cold.todos).toEqual([expect.objectContaining({ todoId: "todo-1", text: "Restore plugin projection" })]);
    expect(await controller().inspect("s")).toEqual(cold);
    await writeFile(f.cache, "ignored legacy checkpoint");
    expect(await controller().inspect("s")).toEqual(cold);
  });

  it("keeps old required Todo Journals browse-only with a diagnostic and rejects resume", async () => {
    const f = await fixture(0);
    const event = {
      recordKind: "event",
      seq: 0,
      type: "todo/write",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      provenance: defaultSessionProvenance(),
      criticality: "required",
      time: "2026-09-28T00:00:00Z",
      data: { items: [], revision: 1 },
      surface: null,
    };
    await appendFile(f.path, JSON.stringify(event) + "\n");
    const controller = new RuntimeSessionController(
      {
        dataRoot: f.root,
        registry: createCoreCodecRegistry(todoCodecs),
        runtimeId: "test",
        profileId: "test",
        manifestDigest: "test",
        plugins: [],
      },
      new SessionStore(
        { registry: createCoreCodecRegistry(todoCodecs) },
        new JsonlSessionStorage({ dataRoot: f.root, registry: createCoreCodecRegistry(todoCodecs), runtimeId: "test" }),
      ),
    );
    expect(await controller.inspect("s")).toMatchObject({ accessState: "browse-only", todos: [] });
    const inspection = await controller.store.inspect("s");
    expect(inspection.validation?.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "UNKNOWN_REQUIRED_CODEC" })]),
    );
    await expect(controller.resume("s")).rejects.toThrow();
  });

  it("pages the same raw history for every target while facts cover the full Session", async () => {
    const f = await fixture();
    const controller = f.controller();
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

  it("carries the latest prompt and tool records from before the window into a later page", async () => {
    const f = await fixture(0);
    const core = { ownerPluginId: "@actspace/core" };
    const request = (turn: number, records: { prompt?: string; tools?: string[] }) => {
      const ids = { turnId: `t${turn}`, stepId: `s${turn}`, requestId: `r${turn}` };
      f.journal.append({
        type: "turn/start",
        eventVersion: 1,
        source: core,
        data: { turnId: ids.turnId },
        surface: null,
      });
      f.journal.append({
        type: "step/start",
        eventVersion: 1,
        source: core,
        data: { turnId: ids.turnId, stepId: ids.stepId },
        surface: null,
      });
      f.journal.append({
        type: "request/header",
        eventVersion: 1,
        source: core,
        data: { ...ids, model: "m", routeId: "r" },
        surface: null,
      });
      if (records.prompt)
        f.journal.append({
          type: "request/system-prompt",
          eventVersion: 1,
          source: core,
          data: {
            ...ids,
            digest: records.prompt,
            sections: [{ id: "model-prompt", owner: "system", order: 0, content: records.prompt }],
            modelFacts: [],
            contributorProvenance: [],
          },
          surface: null,
        });
      if (records.tools)
        f.journal.append({
          type: "request/tools",
          eventVersion: 1,
          source: core,
          data: { ...ids, digest: records.tools.join(), tools: records.tools.map((name) => ({ name })) },
          surface: null,
        });
      f.journal.append({
        type: "request/context",
        eventVersion: 1,
        source: core,
        data: { ...ids, snapshot: { schemaVersion: 3 } },
        surface: null,
      });
      f.journal.append({
        type: "assistant/message",
        eventVersion: 1,
        source: core,
        data: { ...ids, messageId: `a${turn}`, finishReason: "stop", content: [{ type: "text", text: "ok" }] },
        surface: { kind: "append" },
      });
      f.journal.append({
        type: "step/end",
        eventVersion: 1,
        source: core,
        data: { turnId: ids.turnId, stepId: ids.stepId, status: "completed" },
        surface: null,
      });
      f.journal.append({
        type: "turn/end",
        eventVersion: 1,
        source: core,
        data: { turnId: ids.turnId, status: "completed" },
        surface: null,
      });
    };
    request(0, { prompt: "A", tools: ["read"] });
    request(1, { prompt: "B" });
    for (let turn = 2; turn < 25; turn++) request(turn, turn === 3 ? { tools: ["read", "write"] } : {});
    await appendFile(f.path, f.journal.events.map((event) => JSON.stringify(event)).join("\n") + "\n");
    const seqOf = (type: string, requestId: string) =>
      f.journal.events.find(
        (event) => event.type === type && (event.data as { requestId?: string }).requestId === requestId,
      )!.seq;
    const cold = f.controller();
    const tail = await cold.readProjection({ sessionId: "s" });
    // 20 轮窗口从 t5 开始：提示词沿用 t1 的 B，工具沿用 t3 的 read+write。
    expect(tail.window.fromSeq).toBeGreaterThan(seqOf("request/tools", "r3"));
    const carried = tail.window.events.filter((event) => event.seq < tail.window.fromSeq);
    expect(carried.map((event) => event.seq)).toEqual([
      seqOf("request/system-prompt", "r1"),
      seqOf("request/tools", "r3"),
    ]);
    expect(tail.window.events.filter((event) => event.type === "request/context")).toHaveLength(20);
    // 打开中的会话走同一条路径。
    const live = f.controller();
    await live.resume("s");
    const liveTail = await live.readProjection({ sessionId: "s" });
    expect(
      liveTail.window.events.filter((event) => event.seq < liveTail.window.fromSeq).map((event) => event.seq),
    ).toEqual(carried.map((event) => event.seq));
    await live.closeAll();
    // 窗口正好从一条请求记录开始：这条请求在窗口内，不算进起点之前的请求数。
    const fromRequest = await cold.readProjection({ sessionId: "s", afterSeq: seqOf("request/header", "r5") - 1 });
    expect([fromRequest.window.fromSeq, fromRequest.window.requestOffset, fromRequest.window.turnOffset]).toEqual([
      seqOf("request/header", "r5"),
      5,
      6,
    ]);
    // 从头开始的一页不需要补。
    const older = await cold.readProjection({ sessionId: "s", beforeSeq: tail.window.beforeSeq! });
    expect(older.window.fromSeq).toBe(0);
    expect(
      older.window.events.filter((event) => event.type === "request/system-prompt").map((event) => event.seq),
    ).toEqual([seqOf("request/system-prompt", "r0"), seqOf("request/system-prompt", "r1")]);
  });

  it("observes a changed storage revision and ignores old JSONL checkpoint files", async () => {
    const f = await fixture(1);
    const controller = f.controller();
    const before = await controller.inspect("s");
    f.turn(1);
    await appendFile(
      f.path,
      f.journal.events
        .slice(before.throughJournalSeq + 1)
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n",
    );
    const after = await f.controller().inspect("s");
    expect(after.activity.completedTurnCount).toBe(2);
    expect(after.throughJournalSeq).toBe(5);
    await writeFile(f.cache, "ignored legacy checkpoint");
    expect(await f.controller().inspect("s")).toEqual(after);
  });

  it("rebuilds corrupt and shortened checkpoints without changing Journal bytes", async () => {
    const f = await fixture(1);
    const bytes = await readFile(f.path);
    const expected = await f.controller().inspect("s");
    await writeFile(f.cache, "invalid json");
    expect(await f.controller().inspect("s")).toEqual(expected);
    f.turn(1);
    await appendFile(
      f.path,
      f.journal.events
        .slice(3)
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n",
    );
    await f.controller().inspect("s");
    await writeFile(f.path, bytes);
    expect(await f.controller().inspect("s")).toEqual(expected);
    expect(await readFile(f.path)).toEqual(bytes);
  });

  it("rebuilds the disposable global index from Session projections", async () => {
    const f = await fixture(2);
    const controller = f.controller();
    expect((await controller.browseSessions()).items).toHaveLength(1);
    const index = join(f.root, "global-session-index.json");
    await writeFile(index, JSON.stringify({ version: 1, summaries: [{ sessionId: "wrong-backend" }] }));
    expect((await f.controller().browseSessions()).items[0]).toMatchObject({ sessionId: "s", completedTurnCount: 2 });
  });

  it("keeps the global index at the Journal tail after close and repairs stale entries on cold reads", async () => {
    const f = await fixture(1);
    const controller = f.controller();
    await controller.browseSessions();
    await controller.resume("s");
    await controller.closeAll();
    const index = join(f.root, "global-session-index.json");
    const tail = JSON.parse((await readFile(f.path, "utf8")).trim().split("\n").at(-1)!);
    expect(tail.type).toBe("session/end-seed");
    await writeFile(
      index,
      JSON.stringify({ version: 1, summaries: [{ sessionId: "s", throughJournalSeq: tail.seq - 1 }] }),
    );
    const reader = f.controller();
    expect((await reader.globalSessionSummaries())[0].throughJournalSeq).toBe(tail.seq);
    expect((await reader.inspect("s")).throughJournalSeq).toBe(tail.seq);
  });

  it("defers large tool results for browsing but preserves failed status and complete reads", async () => {
    const f = await fixture(1);
    const output = "x".repeat(26_000);
    f.journal.append({
      type: "turn/start",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: { turnId: "tool-turn" },
      surface: null,
    });
    f.journal.append({
      type: "step/start",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: { turnId: "tool-turn", stepId: "tool-step" },
      surface: null,
    });
    f.journal.append({
      type: "tool/call",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: { callId: "c", name: "bash", pluginId: "core", args: { command: output } },
      surface: null,
    });
    f.journal.append({
      type: "tool/result",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: {
        callId: "c",
        name: "bash",
        status: "failed",
        summary: "failed",
        modelOutput: [{ type: "text", text: output }],
        failure: { code: "EXIT", message: "failed", retryable: false },
      },
      surface: { kind: "append" },
    });
    await appendFile(
      f.path,
      f.journal.events
        .slice(3)
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n",
    );
    const controller = f.controller();
    const page = await controller.readProjection({ sessionId: "s" });
    expect(page.deferredToolCalls).toEqual(["c"]);
    expect(page.window.support).toContainEqual({ kind: "tool-call", callId: "c", eventSeqs: [5, 6] });
    expect(page.snapshot.tools[0]?.state).toBe("failed");
    expect(JSON.stringify(page.window)).not.toContain(output);
    expect(JSON.stringify(page.window).length).toBeLessThan(24_000);
    const full = await controller.readProjection({ sessionId: "s", afterSeq: -1, includeToolDetails: true });
    expect(full.deferredToolCalls).toEqual([]);
    expect(JSON.stringify(full.window)).toContain(output);
    expect(JSON.stringify(await controller.browseToolDetail("s", "c"))).toContain(output);
  });

  it("defers a tool call only when one of its events is larger than the threshold", async () => {
    const f = await fixture(1);
    const core = { ownerPluginId: "@actspace/core" };
    f.journal.append({
      type: "turn/start",
      eventVersion: 1,
      source: core,
      data: { turnId: "tool-turn" },
      surface: null,
    });
    f.journal.append({
      type: "step/start",
      eventVersion: 1,
      source: core,
      data: { turnId: "tool-turn", stepId: "tool-step" },
      surface: null,
    });
    const call = (callId: string, command: string) => {
      f.journal.append({
        type: "tool/call",
        eventVersion: 1,
        source: core,
        data: { callId, name: "bash", pluginId: "core", args: { command } },
        surface: null,
      });
      return JSON.stringify(f.journal.events.at(-1)).length;
    };
    const room = 24_000 - call("c0", "");
    expect([call("c1", "x".repeat(room)), call("c2", "x".repeat(room + 1))]).toEqual([24_000, 24_001]);
    await appendFile(
      f.path,
      f.journal.events
        .slice(3)
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n",
    );
    expect((await f.controller().readProjection({ sessionId: "s" })).deferredToolCalls).toEqual(["c2"]);
  });

  it("rejects invalid cursors and Session paths", async () => {
    const f = await fixture(1);
    await expect(f.controller().readProjection({ sessionId: "s", beforeSeq: -1 })).rejects.toThrow("cursor");
    await expect(f.controller().readProjection({ sessionId: "../other" })).rejects.toThrow("path-safe");
  });

  it("returns an observation with independent watermarks and enforces window caps", async () => {
    const f = await fixture(25);
    const controller = f.controller();
    const observation = await controller.readObservation({
      sessionId: "s",
      maxWindowEvents: 10,
      maxWindowBytes: 5_000,
    });
    expect(observation.kind).toBe("session-observation");
    expect(observation.projection.values.sessionStats).toEqual(observation.snapshot.activity);
    expect(observation.watermarks.projectionThroughSeq).toBe(observation.snapshot.throughJournalSeq);
    expect(observation.window?.events.length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(observation.window).length).toBeGreaterThan(0);
  });
});

it("keeps bounded history pages on turn boundaries without losing older events", async () => {
  const f = await fixture(5);
  const controller = f.controller();
  let beforeSeq: number | undefined;
  const pages: number[][] = [];
  do {
    const page = await controller.readProjection({ sessionId: "s", beforeSeq, maxWindowEvents: 4 });
    expect(page.window.events.length).toBeLessThanOrEqual(4);
    expect(page.window.events[0]?.type).toBe("turn/start");
    pages.unshift(page.window.events.map((event) => event.seq));
    beforeSeq = page.window.beforeSeq ?? undefined;
  } while (beforeSeq !== undefined);
  expect(pages.flat()).toEqual(f.journal.events.map((event) => event.seq));
});

it("makes bounded progress through an oversized turn and keeps delta cursors exact", async () => {
  const f = await fixture(1);
  const controller = f.controller();
  const page = await controller.readProjection({ sessionId: "s", maxWindowEvents: 1 });
  expect(page.window.events.map((event) => event.seq)).toEqual([2]);
  expect(page.window.beforeSeq).toBe(2);
  const older = await controller.readProjection({ sessionId: "s", beforeSeq: 2, maxWindowEvents: 1 });
  expect(older.window.events.map((event) => event.seq)).toEqual([1]);
  const delta = await controller.readProjection({ sessionId: "s", afterSeq: 0 });
  expect(delta.window.events.map((event) => event.seq)).toEqual([1, 2]);
});

it("fits a window to its byte and event budgets exactly and always returns at least one event", async () => {
  const f = await fixture(25);
  f.journal.append({
    type: "turn/start",
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data: { turnId: "open" },
    surface: null,
  });
  f.journal.append({
    type: "user/message",
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data: { messageId: "big", content: "x".repeat(5_000) },
    surface: { kind: "append" },
  });
  await appendFile(
    f.path,
    f.journal.events
      .slice(-2)
      .map((event) => JSON.stringify(event))
      .join("\n") + "\n",
  );
  const controller = f.controller();
  const read = async (caps: { maxWindowBytes?: number; maxWindowEvents?: number }) =>
    (await controller.readProjection({ sessionId: "s", afterSeq: -1, ...caps })).window.events;
  const whole = await read({});
  const bytes = JSON.stringify(whole).length;
  expect(whole).toHaveLength(77);
  expect(await read({ maxWindowBytes: bytes })).toEqual(whole);
  expect(await read({ maxWindowBytes: bytes - 1 })).toEqual(whole.slice(1));
  expect(await read({ maxWindowEvents: 76 })).toEqual(whole.slice(1));
  // The last event alone is over the smallest budget; a reader still gets it and can move on.
  expect(JSON.stringify(whole.slice(-1)).length).toBeGreaterThan(4_096);
  expect(await read({ maxWindowBytes: 4_096 })).toEqual(whole.slice(-1));
});
