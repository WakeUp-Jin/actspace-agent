import { afterEach, expect, it, vi } from "vitest";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS as CH } from "@actspace/shared/runtime-v2";
import { syntheticJournal } from "@actspace/session-journal/testing";
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>() }));
vi.mock("electron", () => ({ dialog: {}, nativeImage: {}, nativeTheme: {}, shell: {}, ipcMain: {
  handle: (channel: string, listener: (...args: any[]) => any) => handlers.set(channel, listener),
  removeHandler: (channel: string) => handlers.delete(channel),
  on: () => undefined, removeListener: () => undefined,
} }));
import { registerFixedRendererIpc, type FixedRendererIpcOptions } from "../runtime-v2/fixed-renderer-ipc";
import { trustedWindow } from "./ipc-sender-fixture";

// 规模测试（perf-memory-conventions.md §8）：子 Agent 面板每秒轮询一次 getSubagents，
// 第二次起从归档历史读的事件数应为 0，且和会话长度无关。之前每次轮询都整份 inspectSessionEvents 再折叠（perf-backlog P3）。

afterEach(() => { handlers.clear(); });

const SOURCE = { ownerPluginId: "@actspace/core" } as const;

async function pollReads(count: number): Promise<{ readonly afterFirst: number; readonly items: unknown[] }> {
  const { journal, history } = syntheticJournal(count);
  journal.append({ type: "subagent/spawned", eventVersion: 1, source: SOURCE, surface: null, data: { agentId: "sa-1", kind: "local", preset: "explore", description: "Map the repo", transcriptPath: "/t/sa-1.md", callId: "call-spawn", createdAt: "2026-11-07T00:00:01.000Z" } });
  journal.append({ type: "subagent/activation", eventVersion: 1, source: SOURCE, surface: null, data: { op: "start", agentId: "sa-1", activationId: "act-1", trigger: "spawn", callId: "call-spawn", background: true, startedAt: "2026-11-07T00:00:01.000Z", model: "fixture-model" } });
  const registry = {
    subscribe: () => () => undefined, subscribeRendererStream: () => () => undefined, flushRendererStream: () => undefined, setObservedSessions: () => undefined,
    inspectSessionEvents: async () => journal.readEvents(),
    inspectSessionEventsAfter: async (_id: string, afterSeq: number) => ({ lastSeq: journal.lastSeq, events: afterSeq >= journal.lastSeq ? [] : journal.eventsAfter(afterSeq) }),
    latestSessionEvent: async () => undefined,
    inspectSession: async () => { throw new Error("no child session"); },
    subagentActivity: () => undefined,
  };
  const trusted = trustedWindow();
  const registration = registerFixedRendererIpc({ roots: { dataRoot: "/tmp/scale", workspaceRoot: "/tmp" }, registry, settings: { subscribeV4Changes: () => () => {} }, getMainWindow: () => trusted.window } as unknown as FixedRendererIpcOptions);
  try {
    const poll = () => handlers.get(CH.getSubagents)!(trusted.event, { sessionId: `scale-${count}` }) as Promise<unknown[]>;
    const items = await poll();
    const afterFirst = history.eventsRead;
    for (let tick = 0; tick < 9; tick++) await poll();
    return { afterFirst: history.eventsRead - afterFirst, items };
  } finally { registration.dispose(); }
}

it("reads no archived events on repeated polls, for 1k and 10k event sessions alike", async () => {
  const small = await pollReads(1_000);
  const large = await pollReads(10_000);
  expect(small.items).toEqual([expect.objectContaining({ agentId: "sa-1", status: "running", model: "fixture-model" })]);
  expect(large.items).toEqual(small.items);
  expect(large.afterFirst).toBe(small.afterFirst);
  expect(small.afterFirst).toBe(0);
}, 60_000);
