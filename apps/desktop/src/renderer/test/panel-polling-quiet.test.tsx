import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { SessionEvent, SubagentListItem } from "@actspace/shared";
import { useContextPanel } from "../components/right-panel/context/use-context-panel";
import { SubagentsPanel } from "../components/right-panel/SubagentsPanel";
import { reconcileSubagents, reconcileTranscript } from "../components/right-panel/subagent-transcript";
import { TooltipProvider } from "../components/ui/Tooltip";
import { mockContextPanelView } from "../mock/context-panel-fixture";
import { jsonEqual } from "../json-equal";
import { overrideBridge, setupBridge } from "./helpers/bridge";

afterEach(() => { vi.useRealTimers(); });

const event = (id: string, type: SessionEvent["type"], payload: unknown = {}): SessionEvent => ({ id, sessionId: "child", agentRunId: "run", type, timestamp: "2026-11-04T09:05:00.000Z", schemaVersion: 2, payload } as SessionEvent);
const agent = (agentId: string, status: SubagentListItem["status"], extra: Partial<SubagentListItem> = {}): SubagentListItem => ({
  agentId, kind: "local", preset: "general", description: agentId, status, activationCount: 1, background: false,
  createdAt: "2026-11-04T09:05:00.000Z", activeSince: "2026-11-04T09:05:00.000Z", transcriptPath: `/data/${agentId}.jsonl`, ...extra,
});

it("compares plain JSON structurally", () => {
  expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
  expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
  expect(jsonEqual([1], [1, 2])).toBe(false);
  expect(jsonEqual({ a: undefined }, {})).toBe(false);
  expect(jsonEqual(null, {})).toBe(false);
});

it("reuses the previous transcript when the fetch is identical and keeps unchanged blocks when only the tail changes", () => {
  const user = event("u1", "user_message", { content: "go" });
  const reply = event("a1", "assistant_message", { content: "working" });
  const first = reconcileTranscript(null, [user, reply]);
  expect(first.blocks.length).toBeGreaterThan(0);
  // identical content in fresh objects (what IPC delivers) -> same state object, nothing to re-render
  expect(reconcileTranscript(first, JSON.parse(JSON.stringify([user, reply])))).toBe(first);
  // a new event appended: earlier blocks keep their identity, a block is appended
  const more = reconcileTranscript(first, JSON.parse(JSON.stringify([user, reply, event("a2", "assistant_message", { content: "done" })])));
  expect(more).not.toBe(first);
  expect(more.blocks.length).toBe(first.blocks.length + 1);
  first.blocks.forEach((block, index) => { expect(more.blocks[index]).toBe(block); });
});

it("keeps the list and unchanged agents by reference when a poll carries no change", () => {
  const a = agent("a", "running");
  const b = agent("b", "ended");
  const previous = [a, b];
  expect(reconcileSubagents(previous, [{ ...a }, { ...b }])).toBe(previous);
  const next = reconcileSubagents(previous, [{ ...a }, { ...b, status: "failed" }]);
  expect(next).not.toBe(previous);
  expect(next[0]).toBe(a);
});

it("does not re-render the Context panel hook for a notModified poll, and shows loading only for the first load", async () => {
  vi.useFakeTimers();
  const view = { ...mockContextPanelView("s"), versionToken: "v1", history: { status: "ready" as const, indexGeneration: "g", indexedThroughSeq: 3, targetThroughSeq: 3 } };
  const handler = vi.fn(async (input: any) => input.release ? null : input.versionToken ? { notModified: true as const, versionToken: view.versionToken, history: view.history } : view);
  setupBridge({ "sessions.describeContextPanel": handler });
  let renders = 0;
  const hook = renderHook(() => { renders++; return useContextPanel({ sessionId: "s", revision: 1, fallbackState: null }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(hook.result.current.data).not.toBeNull();
  expect(hook.result.current.loading).toBe(false);
  // React may spend one render confirming a same-value bail-out on the first poll; after that polls must be silent.
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  const settled = renders;
  for (let i = 0; i < 4; i++) await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(handler.mock.calls.filter(([input]) => !input.release).length).toBeGreaterThanOrEqual(5);
  expect(renders).toBe(settled);
  hook.unmount();
});

it("keeps rendered transcript rows when a running agent's poll returns the same content", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const events = [event("u1", "user_message", { content: "go" })];
  const transcript = vi.fn(async () => JSON.parse(JSON.stringify(events)));
  overrideBridge({
    "sessions.getSubagents": vi.fn(async () => [agent("scan", "running")]),
    "sessions.getSubAgentTranscript": transcript,
  });
  render(<TooltipProvider><SubagentsPanel sessionId="parent" focus={{ agentId: "scan", view: "chat", revision: 1 }} /></TooltipProvider>);
  expect(await screen.findByText("go")).toBeInTheDocument();
  const row = screen.getByText("go");
  await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
  expect(transcript.mock.calls.length).toBeGreaterThan(2);
  // same DOM node: the row was not replaced
  expect(screen.getByText("go")).toBe(row);
});

it("polls the subagent list every second while one runs and every five seconds when none does", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let status: SubagentListItem["status"] = "running";
  const list = vi.fn(async () => [agent("scan", status)]);
  overrideBridge({ "sessions.getSubagents": list });
  render(<TooltipProvider><SubagentsPanel sessionId="parent" /></TooltipProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const start = list.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(list.mock.calls.length - start).toBeGreaterThanOrEqual(3);
  status = "ended";
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  const idle = list.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
  expect(list.mock.calls.length - idle).toBeLessThanOrEqual(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(list.mock.calls.length - idle).toBeLessThanOrEqual(3);
});
