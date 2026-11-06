import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeStreamEvent, SessionListItem, SessionRecord } from "@actspace/shared";
import type { RuntimeV2LiveEvent } from "@actspace/shared/runtime-v2";
import { App } from "../App";
import { TooltipProvider } from "../components/ui/Tooltip";
import { setupBridge } from "./helpers/bridge";
import { recordProjectionFixture } from "./projection-fixture";

/**
 * 流式输出时的渲染隔离（卡顿修复 R1）：当前会话每帧都有 live 文本和 journal chunk，后台会话也在出事件，
 * 但左栏、右栏、输入框这三块外壳不应随帧重渲染，只有消息区跟着更新。
 *
 * 渲染次数用「外壳每次渲染都会重新渲染的直接子组件」计数：子组件本身不做 memo，
 * 外壳没重渲染时它就不会被调用。
 */
const renders = vi.hoisted(() => ({ sidebar: 0, rightPanel: 0, composer: 0, layout: 0 }));

vi.mock("../components/sidebar/SidebarSessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/sidebar/SidebarSessions")>();
  return { ...actual, SidebarSessions: (props: Parameters<typeof actual.SidebarSessions>[0]) => { renders.sidebar++; return actual.SidebarSessions(props); } };
});
// WindowChromeBar 是 WorkbenchLayout 的直接子组件：它的渲染次数就是 WorkbenchLayout 的渲染次数。
vi.mock("../components/WindowChromeBar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/WindowChromeBar")>();
  return { ...actual, WindowChromeBar: (props: Parameters<typeof actual.WindowChromeBar>[0]) => { renders.layout++; return actual.WindowChromeBar(props); } };
});
vi.mock("../components/right-panel/RightPanelTabStrip", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/right-panel/RightPanelTabStrip")>();
  const Wrapped = (props: Parameters<typeof actual.RightPanelTabStrip>[0]) => { renders.rightPanel++; return actual.RightPanelTabStrip(props); };
  return { ...actual, RightPanelTabStrip: Wrapped };
});
vi.mock("../components/composer/ComposerToolbar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/composer/ComposerToolbar")>();
  return { ...actual, ComposerToolbar: (props: Parameters<typeof actual.ComposerToolbar>[0]) => { renders.composer++; return actual.ComposerToolbar(props); } };
});

const NOW = "2026-11-04T00:00:00.000Z";
const FRAMES = 100;

function item(id: string, title: string): SessionListItem {
  return { id, title, updatedAt: NOW, agentRunCount: 1, workspaceRoot: "/tmp/workspace" };
}

function record(id: string, title: string): SessionRecord {
  return {
    meta: { schemaVersion: 2, id, title, createdAt: NOW, updatedAt: NOW, agentRunCount: 1, workspaceRoot: "/tmp/workspace" },
    events: [
      { id: `u-${id}`, schemaVersion: 2, sessionId: id, agentRunId: `run-${id}`, type: "user_message", timestamp: NOW, payload: { content: `hello ${id}` } },
      { id: `a-${id}`, schemaVersion: 2, sessionId: id, agentRunId: `run-${id}`, type: "assistant_message", timestamp: NOW, payload: { content: `reply ${id}` } },
    ],
  } as unknown as SessionRecord;
}

function chunkEvent(sessionId: string, seq: number, content: string): RuntimeV2LiveEvent {
  return {
    kind: "journal-update", schemaVersion: 1, runtimeInstanceId: "r1", liveSeq: seq + 1, sessionId, throughJournalSeq: seq,
    update: {
      sessionId, throughJournalSeq: seq, values: {},
      event: { recordKind: "event", seq, type: "assistant/chunk", eventVersion: 1, criticality: "ignorable", time: NOW, source: { ownerPluginId: "@actspace/core" }, data: { agentRunId: "run-live", messageId: "a-live", kind: "assistant-delta", content }, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } },
    },
  } as unknown as RuntimeV2LiveEvent;
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function mount() {
  const items = [item("s-1", "First"), item("s-2", "Second")];
  const stream = new Set<(event: RuntimeStreamEvent) => void>();
  const live = new Set<(payload: unknown) => void>();
  setupBridge({
    "app.getBootstrapState": async () => ({ appVersion: "test", dataRoot: "/tmp/test", sessionRoot: "/tmp/test", logRoot: "/tmp/test", tmpRoot: "/tmp/test", workspaceRoot: "/tmp/workspace" }),
    "workspaces.list": async () => ({ version: 1, items: [{ id: "default", kind: "folder", label: "workspace", path: "/tmp/workspace", order: 0, createdAt: NOW, updatedAt: NOW }] }),
    "sessions.list": async () => items,
    "sessions.listPage": async () => ({ items, groups: [{ workspaceRoot: "/tmp/workspace", pinned: false, hasMore: false }], indexing: false, failed: 0 }),
    "sessions.getPage": async ({ sessionId }: { sessionId: string }) => recordProjectionFixture(record(sessionId, items.find((entry) => entry.id === sessionId)!.title)),
    "approvals.listPending": async () => [],
    "tasks.command": async ({ sessionId }: { sessionId: string }) => ({ snapshot: { sessionId, revision: 1, paused: false, tasks: [], queue: [], runs: [] } }),
    "events.agentStream": (callback: (event: RuntimeStreamEvent) => void) => { stream.add(callback); return () => { stream.delete(callback); }; },
    "events.sessionLive": (callback: (payload: unknown) => void) => { live.add(callback); return () => { live.delete(callback); }; },
    "review.getSnapshot": async () => ({ ok: false, code: "not_available", message: "No changes" }),
  } as never);
  return {
    stream: (event: RuntimeStreamEvent) => { for (const listener of stream) listener(event); },
    live: (event: RuntimeV2LiveEvent) => { for (const listener of live) listener({ event }); },
  };
}

async function measure(openRightPanel: boolean, foreground = true) {
  const bridge = mount();
  render(<TooltipProvider><App /></TooltipProvider>);
  const user = userEvent.setup();
  await waitFor(() => expect(document.querySelector('.session-row[data-session-id="s-1"]')).not.toBeNull());
  await user.click(within(document.querySelector<HTMLElement>('.session-row[data-session-id="s-1"]')!).getByText("First"));
  await screen.findByText("reply s-1");
  // jsdom 宽度为 0 时是紧凑布局，左栏和右栏互斥，分两次测。
  if (openRightPanel) {
    await user.click(screen.getByTitle("打开右侧面板"));
    await waitFor(() => expect(screen.getAllByLabelText("右侧面板").length).toBeGreaterThan(0));
  }

  await act(async () => { bridge.stream({ type: "agent_run_started", sessionId: "s-1", agentRunId: "run-live" } as RuntimeStreamEvent); });
  await act(async () => { bridge.stream({ type: "agent_run_started", sessionId: "s-2", agentRunId: "run-bg" } as RuntimeStreamEvent); });
  await act(async () => { await frame(); });

  const before = { ...renders };
  for (let index = 0; index < FRAMES; index++) {
    await act(async () => {
      if (foreground) {
        bridge.stream({ type: "assistant_text_delta", sessionId: "s-1", agentRunId: "run-live", delta: `w${index} ` } as RuntimeStreamEvent);
        bridge.live(chunkEvent("s-1", 10 + index, `w${index} `));
      }
      // 后台会话同时在出流式增量和 journal 事件。
      bridge.stream({ type: "assistant_text_delta", sessionId: "s-2", agentRunId: "run-bg", delta: `bg${index} ` } as RuntimeStreamEvent);
      bridge.live(chunkEvent("s-2", 10 + index, `bg${index} `));
      await frame();
    });
  }
  await act(async () => { await frame(); });
  const delta = { sidebar: renders.sidebar - before.sidebar, rightPanel: renders.rightPanel - before.rightPanel, composer: renders.composer - before.composer, layout: renders.layout - before.layout };
  console.log(`[render-isolation] rightPanelOpen=${openRightPanel} renders per ${FRAMES} frames`, JSON.stringify(delta));
  // 消息区跟着更新；只有后台会话在出流时当前会话的消息区不动。
  if (foreground) expect(document.body.textContent).toContain("w80");
  else expect(document.body.textContent).not.toContain("bg");
  return delta;
}

describe("streaming render isolation", () => {
  // 右栏的开合记在 localStorage：上一个用例打开过右栏，窄窗口里会把左栏挤掉。
  beforeEach(() => { window.localStorage.clear(); });

  it("keeps the sidebar and composer shells out of the per-frame render path", async () => {
    const delta = await measure(false);
    expect(delta.sidebar).toBeLessThanOrEqual(5);
    expect(delta.composer).toBeLessThanOrEqual(5);
    expect(delta.layout).toBeLessThanOrEqual(5);
  }, 30_000);

  it("keeps the right panel shell out of the per-frame render path", async () => {
    const delta = await measure(true);
    expect(delta.rightPanel).toBeLessThanOrEqual(5);
    expect(delta.composer).toBeLessThanOrEqual(5);
  }, 30_000);

  it("does not re-render any shell for events on a background session", async () => {
    const delta = await measure(false, false);
    expect(delta.sidebar).toBeLessThanOrEqual(5);
    expect(delta.composer).toBeLessThanOrEqual(5);
    expect(delta.layout).toBeLessThanOrEqual(5);
  }, 30_000);
});
