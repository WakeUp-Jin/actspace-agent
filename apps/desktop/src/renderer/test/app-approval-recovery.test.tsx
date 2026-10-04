import { afterEach, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PendingApprovalInfo, RuntimeStreamEvent, SessionRecord } from "@actspace/shared";
import { App } from "../App";
import { TooltipProvider } from "../components/ui/Tooltip";
import { recordProjectionFixture } from "./projection-fixture";

afterEach(() => { delete (window as { actspace?: unknown }).actspace; window.localStorage.clear(); });
function fixture(ordinary = false) {
  window.localStorage.clear();
  const now = new Date().toISOString();
  const record: SessionRecord = { meta: { schemaVersion: 2, id: "reloaded", title: "Recover approvals", createdAt: now, updatedAt: now, agentRunCount: 1, workspaceRoot: "/tmp/workspace" }, events: [
    { id: "question", schemaVersion: 2, sessionId: "reloaded", agentRunId: "live-run", type: "user_message", timestamp: now, payload: { content: "read the fixture" } },
  ] };
  let pending: PendingApprovalInfo[] = [{ requestId: "live-approval", toolName: "read_file", reason: "outside workspace", summary: "Read fixture", createdAt: Date.now(), expiresAt: Date.now() + 60_000,
    recovery: { agentRunId: "live-run", toolCallId: "live-call", preview: { kind: "read", filePath: "/tmp/fixture.txt", displayText: "Read fixture" } } }];
  if (ordinary) pending = [];
  let listener: (event: RuntimeStreamEvent) => void = () => {};
  let liveListener: (event: unknown) => void = () => {};
  const abort = vi.fn(async () => true);
  const decide = vi.fn(async () => ({ ok: true }));
  window.actspace = {
    getBootstrapState: async () => ({ appVersion: "test", dataRoot: "/tmp/test", sessionRoot: "/tmp/test", logRoot: "/tmp/test", tmpRoot: "/tmp/test", workspaceRoot: "/tmp/workspace" }),
    listWorkspaces: async () => ({ version: 1, defaultWorkspaceId: "default", items: [{ id: "default", kind: "default", label: "workspace", path: "/tmp/workspace", order: 0, createdAt: now, updatedAt: now }] }),
    listSessions: async () => [{ id: "reloaded", title: record.meta.title, updatedAt: now, agentRunCount: 1, workspaceRoot: "/tmp/workspace" }],
    getSessionPage: async () => recordProjectionFixture(record),
    listPendingApprovals: async () => pending,
    ...(ordinary ? { taskCommand: async () => ({ snapshot: { sessionId: "reloaded", revision: 1, paused: false, tasks: [], queue: [], runs: [{ runId: "live-run", state: "running" }] } }) } : {}),
    onAgentStream: (callback: typeof listener) => { listener = callback; return () => {}; },
    onSessionLiveEvent: (callback: typeof liveListener) => { liveListener = callback; return () => {}; },
    getReviewSnapshot: async () => ({ ok: false, code: "not_available", message: "No changes" }),
    listVisualizations: async () => ({ items: [] }),
    abortAgentRun: abort, submitApproval: decide,
    setUiZoom: () => {}, setNativeTheme: () => {}, onShuttingDown: () => () => {},
  } as unknown as Window["actspace"];
  const emit = (event: { type: RuntimeStreamEvent["type"]; [key: string]: unknown }) => act(() => listener({ sessionId: "reloaded", agentRunId: "live-run", ...event } as RuntimeStreamEvent));
  const view = render(<TooltipProvider><App /></TooltipProvider>);
  return { abort, decide, emit, view, refresh: () => act(() => liveListener({ event: { sessionId: "reloaded", message: "task-queue-updated" } })), clear: () => { pending = []; }, record };
}

it("reattaches a pending approval on mount, keeps history, rejects it and settles without a local send promise", async () => {
  const f = fixture();
  await screen.findByRole("button", { name: "拒绝" });
  expect(screen.getByLabelText("停止 Agent")).toBeEnabled();
  expect(screen.getAllByText("read the fixture")).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "拒绝" }));
  expect(f.decide).toHaveBeenCalledWith({ requestId: "live-approval", decision: "deny" });
  f.clear();
  f.emit({ type: "agent_run_finished" });
  await waitFor(() => expect(screen.queryByLabelText("停止 Agent")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument();
  expect(screen.getAllByText("read the fixture")).toHaveLength(1);
});

it("does not resurrect an approval from a query overtaken by a terminal event", async () => {
  const f = fixture();
  await screen.findByRole("button", { name: "拒绝" });
  const stale = await window.actspace.listPendingApprovals({ sessionId: "reloaded" });
  let release!: (value: PendingApprovalInfo[]) => void;
  window.actspace.listPendingApprovals = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue([]);
  f.emit({ type: "tool_approval_resolved", toolCallId: "live-call", requestId: "live-approval", decision: "deny" });
  f.clear(); f.emit({ type: "agent_run_finished" });
  await waitFor(() => expect(screen.queryByLabelText("停止 Agent")).not.toBeInTheDocument());
  await act(async () => release(stale));
  expect(screen.queryByLabelText("停止 Agent")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument();
});

it("stops the original recovered run and clears the card after abort", async () => {
  const f = fixture();
  await screen.findByRole("button", { name: "拒绝" });
  await userEvent.click(screen.getByLabelText("停止 Agent"));
  expect(f.abort).toHaveBeenCalledWith({ sessionId: "reloaded", agentRunId: "live-run" });
  f.clear(); f.emit({ type: "agent_run_aborted" });
  await waitFor(() => expect(screen.queryByLabelText("停止 Agent")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument();
});

it("recovers a running model request without approvals after reload and stops the original Run", async () => {
  const f = fixture(true);
  await screen.findByLabelText("停止 Agent");
  expect(screen.queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument();
  expect(screen.getAllByText("read the fixture")).toHaveLength(1);
  await userEvent.click(screen.getByLabelText("停止 Agent"));
  expect(f.abort).toHaveBeenCalledWith({ sessionId: "reloaded", agentRunId: "live-run" });
  f.emit({ type: "agent_run_aborted" });
  await waitFor(() => expect(screen.queryByLabelText("停止 Agent")).not.toBeInTheDocument());
});

it("does not resurrect a Run from a snapshot overtaken by its terminal stream event", async () => {
  const f = fixture(true);
  await screen.findByLabelText("停止 Agent");
  const stale = await window.actspace.taskCommand({ sessionId: "reloaded", op: "snapshot" });
  let release!: (value: typeof stale) => void;
  window.actspace.taskCommand = vi.fn(() => new Promise<typeof stale>(resolve => { release = resolve; }));
  f.refresh();
  f.emit({ type: "agent_run_finished" });
  await waitFor(() => expect(screen.queryByLabelText("停止 Agent")).not.toBeInTheDocument());
  await act(async () => release(stale));
  expect(screen.queryByLabelText("停止 Agent")).not.toBeInTheDocument();
});

it("restores the approval card after a remote observation resets an existing running overlay", async () => {
  const f = fixture();
  await screen.findByRole("button", { name: "拒绝" });
  f.emit({ type: "agent_run_started", recoveredReset: true });
  f.emit({ type: "tool_approval_required", toolCallId: "live-call", requestId: "live-approval", toolName: "read_file", summary: "Read fixture", reason: "outside workspace" });
  const reject = await screen.findByRole("button", { name: "拒绝" });
  await userEvent.click(reject);
  expect(f.decide).toHaveBeenCalledWith({ requestId: "live-approval", decision: "deny" });
});
