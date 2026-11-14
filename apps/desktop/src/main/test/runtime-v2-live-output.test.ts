// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
const { bootDesktopRuntime } = vi.hoisted(() => ({ bootDesktopRuntime: vi.fn() }));
vi.mock("../runtime-v2/desktop-host-adapter", () => ({ bootDesktopRuntime }));
import type { RuntimeStreamEvent } from "@actspace/shared";
import { PendingApprovalRegistry } from "../approval-registry";
import { DesktopRuntimeRegistry, type DesktopRuntimeRegistryOptions } from "../runtime-v2/runtime-registry";

// 规范 agent-spec-live-assistant-stream §5：主进程持有当前运行的实时底稿，实时帧带 revision，读底稿前先冲掉攒着的帧。

describe("desktop registry live output", () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
    vi.clearAllMocks();
  });

  async function setup() {
    const dataRoot = await mkdtemp("/tmp/actspace-live-output-");
    let onRuntimeLive!: (update: Record<string, unknown>) => void;
    let onProjection!: (update: {
      sessionId: string;
      throughJournalSeq: number;
      event: { type: string; data: unknown };
    }) => void;
    const app = {
      listSessions: vi.fn(async () => []),
      subscribeSessionProjection: vi.fn((listener: typeof onProjection) => {
        onProjection = listener;
        return vi.fn();
      }),
      isIdleForReconfigure: vi.fn(async () => true),
    };
    bootDesktopRuntime.mockImplementation(async (options: { onRuntimeLive: typeof onRuntimeLive }) => {
      onRuntimeLive = options.onRuntimeLive;
      return {
        browserReady: false,
        profile: {
          context: { get: (name: string) => (name === "desktop.app" ? app : undefined) },
          getState: () => ({ state: "ready", runtimeInstanceId: "test" }),
          shutdown: vi.fn(async () => {}),
        },
      };
    });
    const registry = new DesktopRuntimeRegistry({
      roots: { dataRoot, workspaceRoot: join(dataRoot, "w"), defaultWorkspaceRoot: join(dataRoot, "w") },
      approvals: new PendingApprovalRegistry(),
      loadModule: async () => ({}),
    } as unknown as DesktopRuntimeRegistryOptions);
    cleanups.push(async () => {
      await registry.dispose();
      await rm(dataRoot, { recursive: true, force: true });
    });
    await registry.boot();
    const frames: RuntimeStreamEvent[] = [];
    registry.subscribeRendererStream((event) => frames.push(event));
    const ids = { sessionId: "s", agentRunId: "run", turnId: "t", requestId: "q" };
    const delta = (messageId: string, message: string, kind = "assistant-delta") =>
      onRuntimeLive({ ...ids, kind, messageId, message });
    const settle = (messageId: string) =>
      onProjection({ sessionId: "s", throughJournalSeq: 1, event: { type: "assistant/message", data: { messageId } } });
    return {
      registry,
      frames,
      delta,
      settle,
      end: () => onRuntimeLive({ ...ids, kind: "run-state", message: "completed" }),
    };
  }

  it("tags delta frames with the baseline revision and flushes pending frames before reading the baseline", async () => {
    const { registry, frames, delta } = await setup();
    delta("m1", "想", "reasoning-delta");
    delta("m1", "你");
    delta("m1", "好");
    // 思考切到正文时思考帧先发出；正文还在 33ms 窗口里。
    expect(frames.map((frame) => frame.type)).toEqual(["assistant_thinking_delta"]);
    const baseline = registry.liveOutput("s");
    // 读底稿前已经把 33ms 窗口里的帧发出去：底稿里的每个字，界面要么从底稿拿到，要么从 revision 更大的帧拿到。
    expect(
      frames.map((frame) => [
        frame.type,
        (frame as { delta: string }).delta,
        (frame as { liveRevision?: number }).liveRevision,
      ]),
    ).toEqual([
      ["assistant_thinking_delta", "想", 1],
      ["assistant_text_delta", "你好", 3],
    ]);
    expect(baseline).toEqual({
      runId: "run",
      revision: 3,
      segments: [
        { kind: "thinking", messageId: "m1", requestId: "q", text: "想" },
        { kind: "text", messageId: "m1", requestId: "q", text: "你好" },
      ],
    });
  });

  it("drops a message from the baseline once it is journaled, and the whole run once it ends", async () => {
    const { registry, delta, settle, end } = await setup();
    delta("m1", "first");
    delta("m2", "second");
    settle("m1");
    expect(registry.liveOutput("s").segments).toEqual([
      { kind: "text", messageId: "m2", requestId: "q", text: "second" },
    ]);
    end();
    expect(registry.liveOutput("s")).toEqual({ runId: null, revision: 2, segments: [] });
  });
});
