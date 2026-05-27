import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
  KairosBridgeApi,
  KairosControl,
  KairosControlResponse,
  KairosGetEventsRecentResponse,
  KairosRuntimeState,
  SessionEvent,
} from "@actspace/shared";
import { KairosPage } from "../pages/KairosPage";

/*
 * v1.0：原 KairosConfigTab UI 已移除，因此 readConfig / writeConfig 不再有 KairosPage
 * 调用路径上的覆盖。IPC bridge 仍然保留 read/write-config（user 可手动编辑文件），
 * 那两个通道由 kairos-ipc-internals.test.ts 覆盖。
 */
type FakeKairosOptions = Partial<{
  initialState: KairosRuntimeState;
  initialEvents: SessionEvent[];
  controlImpl: (ctrl: KairosControl) => Promise<KairosControlResponse>;
}>;

function installFakeBridge(opts: FakeKairosOptions = {}): {
  bridge: KairosBridgeApi;
  pushEvent: (e: SessionEvent) => void;
  pushState: (s: KairosRuntimeState) => void;
} {
  let eventListener: ((ev: SessionEvent) => void) | undefined;
  let stateListener: ((s: KairosRuntimeState) => void) | undefined;
  const defaultState: KairosRuntimeState = {
    enabled: false,
    state: "stopped",
    todayTickCount: 0,
    toolCallCountInCurrentTick: 0,
    totalSleepSecondsToday: 0,
  };
  const bridge: KairosBridgeApi = {
    getState: vi.fn(async () => opts.initialState ?? defaultState),
    getEventsRecent: vi.fn(async (): Promise<KairosGetEventsRecentResponse> => ({
      events: opts.initialEvents ?? [],
      hasMore: false,
    })),
    control: vi.fn(opts.controlImpl ?? (async () => ({ ok: true } as const))),
    readConfig: vi.fn(
      async () => ({ content: "", fileName: "preferences.json", notFound: true }),
    ),
    writeConfig: vi.fn(async () => ({ ok: true } as const)),
    onEvent: (listener) => {
      eventListener = listener;
      return () => {
        eventListener = undefined;
      };
    },
    onState: (listener) => {
      stateListener = listener;
      return () => {
        stateListener = undefined;
      };
    },
  };
  (window as unknown as { kairos: KairosBridgeApi }).kairos = bridge;
  return {
    bridge,
    pushEvent: (e) => eventListener?.(e),
    pushState: (s) => stateListener?.(s),
  };
}

function makeEvent(overrides: Partial<SessionEvent> & { type: SessionEvent["type"] }): SessionEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "kairos-2026-05-27",
    turnId: "turn-1",
    timestamp: new Date().toISOString(),
    schemaVersion: 1,
    payload: {},
    ...overrides,
  } as SessionEvent;
}

beforeEach(() => {
  delete (window as unknown as { kairos?: KairosBridgeApi }).kairos;
});

describe("KairosPage", () => {
  it("renders an unavailable state when window.kairos is missing", () => {
    render(<KairosPage />);
    expect(screen.getByText(/Kairos 桥未就绪/)).toBeInTheDocument();
  });

  it("renders header with state and empty events table when no events", async () => {
    installFakeBridge();
    render(<KairosPage />);
    expect(await screen.findByText(/Stopped/)).toBeInTheDocument();
    expect(screen.getByText(/暂无 Kairos 事件/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开启" })).toBeInTheDocument();
  });

  it("calls control('start') when the start button is clicked", async () => {
    const { bridge } = installFakeBridge();
    const user = userEvent.setup();
    render(<KairosPage />);
    await screen.findByRole("button", { name: "开启" });
    await user.click(screen.getByRole("button", { name: "开启" }));
    expect(bridge.control).toHaveBeenCalledWith({ type: "start" });
  });

  it("renders the execution list and shows the final reply by default", async () => {
    const ev1 = makeEvent({
      type: "kairos_tick_injected",
      payload: { trigger: "auto", content: "<tick a/>" },
    });
    const ev2 = makeEvent({
      type: "assistant_message",
      payload: { content: "hello user", stopReason: "stop", model: "m", provider: "p" },
    });
    installFakeBridge({ initialEvents: [ev1, ev2] });
    const user = userEvent.setup();
    render(<KairosPage />);
    const list = await screen.findByLabelText("执行列表");
    expect(within(list).getByText("巡检")).toBeInTheDocument();
    const replyCell = within(list).getByText("最终回复");
    expect(replyCell).toBeInTheDocument();

    await user.click(replyCell);
    const detail = screen.getByRole("complementary");
    expect(within(detail).getByText("hello user")).toBeInTheDocument();
    expect(within(detail).queryByText(/stopReason/)).not.toBeInTheDocument();
  });

  it("keeps the header compact without v0 metadata chips", async () => {
    installFakeBridge({
      initialState: {
        enabled: true,
        state: "sleeping",
        sleepEndsAt: new Date(Date.now() + 5_000).toISOString(),
        todayTickCount: 4,
        toolCallCountInCurrentTick: 1,
        totalSleepSecondsToday: 300,
      },
    });
    render(<KairosPage />);
    expect(await screen.findByText(/Sleeping/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂停" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即唤醒" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重置今日" })).toBeInTheDocument();
    expect(screen.queryByText(/Workspace/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Session/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Last wake/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sleep today/)).not.toBeInTheDocument();
  });

  it("uses the four runtime trace tones only", async () => {
    const base = new Date("2026-05-27T13:50:00.000Z").getTime();
    const events: SessionEvent[] = [
      makeEvent({
        id: "tick",
        type: "kairos_tick_injected",
        timestamp: new Date(base).toISOString(),
        payload: { trigger: "auto", content: "<tick/>" },
      }),
      makeEvent({
        id: "tool-call",
        type: "tool_call",
        timestamp: new Date(base + 1_000).toISOString(),
        payload: { id: "tc-1", name: "sleep", arguments: { seconds: 300 } },
      }),
      makeEvent({
        id: "reply",
        type: "assistant_message",
        timestamp: new Date(base + 2_000).toISOString(),
        payload: { content: "ok", stopReason: "stop", model: "m", provider: "p" },
      }),
      makeEvent({
        id: "sleep",
        type: "kairos_sleep_start",
        timestamp: new Date(base + 3_000).toISOString(),
        payload: { plannedSeconds: 300, reason: "after_tick" },
      }),
      makeEvent({
        id: "error",
        type: "error",
        timestamp: new Date(base + 4_000).toISOString(),
        payload: { code: "E_TEST", message: "boom", recoverable: true },
      }),
    ];
    installFakeBridge({ initialEvents: events });
    render(<KairosPage />);

    const trace = await screen.findByLabelText("运行轨迹（近 60 分钟）");
    const tones = Array.from(trace.querySelectorAll<HTMLElement>("[data-testid='kairos-trace-block']"))
      .map((node) => node.dataset.tone);
    expect(new Set(tones)).toEqual(new Set(["reply", "sleep", "error", "other"]));
  });

  it("sizes runtime trace blocks with a capped linear duration scale", async () => {
    const base = new Date("2026-05-27T14:10:00.000Z").getTime();
    const events: SessionEvent[] = [
      makeEvent({
        id: "reply-short",
        type: "assistant_message",
        timestamp: new Date(base).toISOString(),
        payload: { content: "quick", stopReason: "stop", model: "m", provider: "p" },
      }),
      makeEvent({
        id: "tool-call-fast",
        type: "tool_call",
        timestamp: new Date(base + 1_000).toISOString(),
        payload: { id: "tc-fast", name: "read_file", arguments: { path: "README.md" } },
      }),
      makeEvent({
        id: "tool-result-fast",
        type: "tool_result",
        timestamp: new Date(base + 4_000).toISOString(),
        payload: { toolCallId: "tc-fast", toolName: "read_file", ok: true, summary: "ok" },
      }),
      makeEvent({
        id: "sleep-start",
        type: "kairos_sleep_start",
        timestamp: new Date(base + 1_000).toISOString(),
        payload: { plannedSeconds: 120, reason: "after_tick" },
      }),
      makeEvent({
        id: "sleep-end",
        type: "kairos_sleep_end",
        timestamp: new Date(base + 121_000).toISOString(),
        payload: { actualSeconds: 120 },
      }),
    ];
    installFakeBridge({ initialEvents: events });
    render(<KairosPage />);

    const trace = await screen.findByLabelText("运行轨迹（近 60 分钟）");
    const blocks = Array.from(trace.querySelectorAll<HTMLElement>("[data-testid='kairos-trace-block']"));
    const shortBlock = blocks.find((node) => node.dataset.durationMs === "0");
    const fastToolBlock = blocks.find((node) => node.dataset.durationMs === "3000");
    const longBlock = blocks.find((node) => node.dataset.durationMs === "120000");

    expect(shortBlock?.style.width).toBe("20px");
    expect(fastToolBlock?.style.width).toBe("35px");
    expect(longBlock?.style.width).toBe("100px");
  });

  it("keeps all runtime trace events in the horizontal scroll viewport", async () => {
    const base = new Date("2026-05-27T14:20:00.000Z").getTime();
    const events = Array.from({ length: 42 }, (_, index) => makeEvent({
      id: `trace-reply-${index + 1}`,
      type: "assistant_message",
      timestamp: new Date(base + index * 1_000).toISOString(),
      payload: {
        content: `trace reply ${index + 1}`,
        stopReason: "stop",
        model: "m",
        provider: "p",
      },
    }));
    installFakeBridge({ initialEvents: events });
    render(<KairosPage />);

    const trace = await screen.findByLabelText("运行轨迹（近 60 分钟）");
    expect(trace.querySelector("[data-testid='kairos-trace-viewport']")).toBeInTheDocument();
    expect(trace.querySelectorAll("[data-testid='kairos-trace-block']")).toHaveLength(42);
  });

  it("paginates execution rows at ten items per page", async () => {
    const base = new Date("2026-05-27T13:40:00.000Z").getTime();
    const events = Array.from({ length: 12 }, (_, index) => makeEvent({
      id: `reply-${index + 1}`,
      type: "assistant_message",
      timestamp: new Date(base + index * 60_000).toISOString(),
      payload: {
        content: `reply ${index + 1}`,
        stopReason: "stop",
        model: "m",
        provider: "p",
      },
    }));
    installFakeBridge({ initialEvents: events });
    const user = userEvent.setup();
    render(<KairosPage />);

    const list = await screen.findByLabelText("执行列表");
    expect(within(list).getByText("共 12 条")).toBeInTheDocument();
    expect(within(list).getByText("reply 12")).toBeInTheDocument();
    expect(within(list).queryByText("reply 2")).not.toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: "下一页" }));

    expect(within(list).getByText("reply 2")).toBeInTheDocument();
    expect(within(list).getByText("reply 1")).toBeInTheDocument();
    expect(within(list).queryByText("reply 12")).not.toBeInTheDocument();
  });

  it("switches the shared detail panel to tool output when a tool row is selected", async () => {
    const tick = makeEvent({
      type: "kairos_tick_injected",
      payload: { trigger: "auto", content: "<tick a/>" },
    });
    const toolCall = makeEvent({
      id: "tool-call-1",
      type: "tool_call",
      payload: { id: "tc-1", name: "sleep", arguments: { seconds: 300 } },
    });
    const toolResult = makeEvent({
      id: "tool-result-1",
      type: "tool_result",
      payload: { toolCallId: "tc-1", toolName: "sleep", ok: true, summary: "ok" },
    });
    const reply = makeEvent({
      type: "assistant_message",
      payload: {
        content: "环境无变化，仍无配置路径、无会话、无 briefs。继续休眠。",
        stopReason: "stop",
        model: "m",
        provider: "p",
      },
    });
    installFakeBridge({ initialEvents: [tick, toolCall, toolResult, reply] });
    const user = userEvent.setup();
    render(<KairosPage />);

    const detail = screen.getByRole("complementary");
    expect(await within(detail).findByText("环境无变化，仍无配置路径、无会话、无 briefs。继续休眠。")).toBeInTheDocument();
    await user.click(within(screen.getByLabelText("执行列表")).getByText("工具执行"));

    expect(within(detail).getByRole("tab", { name: "工具结果", selected: true })).toBeInTheDocument();
    expect(within(detail).getByText("sleep")).toBeInTheDocument();
    expect(within(detail).getByText("ok")).toBeInTheDocument();
    expect(within(detail).queryByText("环境无变化，仍无配置路径、无会话、无 briefs。继续休眠。")).not.toBeInTheDocument();
  });

  it("does not render the config tab editor (v1.0 removed)", async () => {
    installFakeBridge();
    render(<KairosPage />);
    await screen.findByText(/Stopped/);
    expect(screen.queryByRole("tab", { name: /preferences\.json/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/preferences 原始内容/)).not.toBeInTheDocument();
  });

  it("reflects pushed state updates from stream", async () => {
    const { pushState } = installFakeBridge({
      initialState: {
        enabled: false,
        state: "stopped",
        todayTickCount: 0,
        toolCallCountInCurrentTick: 0,
        totalSleepSecondsToday: 0,
      },
    });
    render(<KairosPage />);
    await screen.findByText(/Stopped/);
    act(() => {
      pushState({
        enabled: true,
        state: "ticking",
        todayTickCount: 3,
        toolCallCountInCurrentTick: 2,
        totalSleepSecondsToday: 120,
      });
    });
    expect(await screen.findByText(/Ticking/)).toBeInTheDocument();
    const stats = screen.getByLabelText("统计");
    expect(within(stats).getByText("巡检")).toBeInTheDocument();
    expect(within(stats).getByText("3")).toBeInTheDocument();
  });
});
