import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
  KairosBridgeApi,
  KairosContextSnapshot,
  KairosControl,
  KairosControlResponse,
  KairosGetEventsRecentResponse,
  KairosRuntimeState,
  KairosUsageSummary,
  SessionEvent,
} from "@actspace/shared";
import { emptyKairosUsageSummary } from "@actspace/shared";
import { KairosPage } from "../pages/KairosPage";

function emptyUsage(): KairosUsageSummary {
  return emptyKairosUsageSummary();
}

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
    budget: { enabled: false, balanceCny: 0, exhausted: false },
    todayTickCount: 0,
    toolCallCountInCurrentTick: 0,
    totalSleepSecondsToday: 0,
    usageLifetime: emptyUsage(),
    usageSinceReset: emptyUsage(),
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
    getContextSnapshot: vi.fn(
      async (): Promise<KairosContextSnapshot> => ({
        generatedAt: new Date().toISOString(),
        modelId: null,
        phase: "work",
        systemPrompt: "",
        systemPromptTokens: 0,
        systemPromptSegments: [],
        historySummary: [],
        historyMessages: [],
        tools: [],
      }),
    ),
    briefsList: vi.fn(async () => ({ briefs: [] })),
    briefsRead: vi.fn(async () => {
      throw new Error("not found");
    }),
    briefsWrite: vi.fn(async () => ({ ok: true } as const)),
    briefsDelete: vi.fn(async () => ({ ok: true } as const)),
    notificationsList: vi.fn(async () => ({ notifications: [], unreadCount: 0 })),
    notificationsMarkRead: vi.fn(async () => ({ ok: true as const, unreadCount: 0 })),
    notificationsRemove: vi.fn(async () => ({ ok: true as const, removedCount: 0, unreadCount: 0 })),
    onNotification: vi.fn(() => () => {}),
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

  it("switches the primary action back to 开启 after a stopped disabled state is pushed", async () => {
    const { bridge, pushState } = installFakeBridge({
      initialState: {
        enabled: true,
        state: "sleeping",
        budget: { enabled: false, balanceCny: 0, exhausted: false },
        sleepEndsAt: new Date(Date.now() + 8_000).toISOString(),
        todayTickCount: 2,
        toolCallCountInCurrentTick: 0,
        totalSleepSecondsToday: 120,
        usageLifetime: emptyUsage(),
        usageSinceReset: emptyUsage(),
      },
    });
    const user = userEvent.setup();
    render(<KairosPage />);

    expect(await screen.findByRole("button", { name: "暂停" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "暂停" }));
    expect(bridge.control).toHaveBeenCalledWith({ type: "stop" });

    act(() => {
      pushState({
        enabled: false,
        state: "stopped",
        budget: { enabled: false, balanceCny: 0, exhausted: false },
        todayTickCount: 2,
        toolCallCountInCurrentTick: 0,
        totalSleepSecondsToday: 120,
        usageLifetime: emptyUsage(),
        usageSinceReset: emptyUsage(),
      });
    });

    expect(await screen.findByRole("button", { name: "开启" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "暂停" })).not.toBeInTheDocument();
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
        budget: { enabled: false, balanceCny: 0, exhausted: false },
        sleepEndsAt: new Date(Date.now() + 5_000).toISOString(),
        todayTickCount: 4,
        toolCallCountInCurrentTick: 1,
        totalSleepSecondsToday: 300,
        usageLifetime: emptyUsage(),
        usageSinceReset: emptyUsage(),
      },
    });
    render(<KairosPage />);
    expect(await screen.findByText(/Sleeping/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂停" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "唤醒" })).toBeInTheDocument();
    // 重置收进「更多」下拉，需展开后可见
    const user = userEvent.setup();
    await user.click(screen.getByTestId("kairos-header-more"));
    expect(screen.getByRole("menuitem", { name: "重置" })).toBeInTheDocument();
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

  it("hides tool/thinking tabs behind the more dropdown by default", async () => {
    installFakeBridge();
    const user = userEvent.setup();
    render(<KairosPage />);

    const detail = screen.getByRole("complementary");
    expect(within(detail).getByRole("tab", { name: "最终回复" })).toBeInTheDocument();
    expect(within(detail).getByRole("tab", { name: /通知/ })).toBeInTheDocument();
    // 工具结果 / 思考过程 默认不直接出现在 tab 栏
    expect(within(detail).queryByRole("tab", { name: "工具结果" })).not.toBeInTheDocument();
    expect(within(detail).queryByRole("tab", { name: "思考过程" })).not.toBeInTheDocument();

    const moreTab = within(detail).getByTestId("kairos-detail-more-tab");
    expect(moreTab).toHaveTextContent("更多");
    await user.click(moreTab);
    await user.click(within(detail).getByRole("menuitem", { name: "思考过程" }));

    expect(within(detail).getByRole("tab", { name: "思考过程", selected: true })).toBeInTheDocument();
    expect(within(detail).getByText("选择思考行后查看完整思考过程")).toBeInTheDocument();
  });

  it("preserves tool events pushed synchronously in one IPC flush", async () => {
    const { pushEvent } = installFakeBridge();
    const user = userEvent.setup();
    render(<KairosPage />);

    expect(await screen.findByText(/暂无 Kairos 事件/)).toBeInTheDocument();

    const base = new Date("2026-05-28T07:16:56.000Z").getTime();
    act(() => {
      pushEvent(makeEvent({
        id: "flush-tick",
        type: "kairos_tick_injected",
        timestamp: new Date(base).toISOString(),
        payload: { trigger: "auto", content: "<tick/>" },
      }));
      pushEvent(makeEvent({
        id: "flush-reply",
        type: "assistant_message",
        timestamp: new Date(base + 1_000).toISOString(),
        payload: { content: "探索工作区。", stopReason: "toolUse", model: "m", provider: "p" },
      }));
      pushEvent(makeEvent({
        id: "flush-tool-call",
        type: "tool_call",
        timestamp: new Date(base + 2_000).toISOString(),
        payload: { id: "tc-list", name: "list_directory", arguments: { path: "notes" } },
      }));
      pushEvent(makeEvent({
        id: "flush-tool-result",
        type: "tool_result",
        timestamp: new Date(base + 3_000).toISOString(),
        payload: {
          toolCallId: "tc-list",
          toolName: "list_directory",
          ok: true,
          summary: "(empty directory)",
        },
      }));
      pushEvent(makeEvent({
        id: "flush-sleep",
        type: "kairos_sleep_start",
        timestamp: new Date(base + 4_000).toISOString(),
        payload: { plannedSeconds: 120, reason: "after_tick" },
      }));
    });

    const list = await screen.findByLabelText("执行列表");
    expect(within(list).getByText("工具执行")).toBeInTheDocument();
    expect(within(list).getByText("list_directory: (empty directory)")).toBeInTheDocument();

    const stats = screen.getByLabelText("统计");
    expect(within(stats).getByText("工具调用")).toBeInTheDocument();
    expect(within(stats).getByText("1")).toBeInTheDocument();

    await user.click(within(list).getByText("工具执行"));
    const detail = screen.getByRole("complementary");
    expect(within(detail).getByRole("tab", { name: "工具结果", selected: true })).toBeInTheDocument();
    expect(within(detail).getByText("list_directory")).toBeInTheDocument();
    expect(within(detail).getByText("(empty directory)")).toBeInTheDocument();
  });

  it("clears the local event view after reset_today", async () => {
    const { bridge } = installFakeBridge({
      initialState: {
        enabled: true,
        state: "sleeping",
        budget: { enabled: false, balanceCny: 0, exhausted: false },
        sleepEndsAt: new Date(Date.now() + 10_000).toISOString(),
        todayTickCount: 2,
        toolCallCountInCurrentTick: 0,
        totalSleepSecondsToday: 120,
        usageLifetime: emptyUsage(),
        usageSinceReset: emptyUsage(),
      },
      initialEvents: [
        makeEvent({
          id: "reset-tick",
          type: "kairos_tick_injected",
          payload: { trigger: "auto", content: "<tick/>" },
        }),
        makeEvent({
          id: "reset-reply",
          type: "assistant_message",
          payload: { content: "before reset", stopReason: "stop", model: "m", provider: "p" },
        }),
      ],
    });
    const user = userEvent.setup();
    render(<KairosPage />);

    const list = await screen.findByLabelText("执行列表");
    expect(within(list).getByText("before reset")).toBeInTheDocument();

    await user.click(screen.getByTestId("kairos-header-more"));
    await user.click(screen.getByRole("menuitem", { name: "重置" }));

    expect(bridge.control).toHaveBeenCalledWith({ type: "reset_today" });
    expect(await screen.findByText(/暂无 Kairos 事件/)).toBeInTheDocument();
    expect(screen.queryByText("before reset")).not.toBeInTheDocument();
  });

  it("does not render the config tab editor (v1.0 removed)", async () => {
    installFakeBridge();
    render(<KairosPage />);
    await screen.findByText(/Stopped/);
    expect(screen.queryByRole("tab", { name: /preferences\.json/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/preferences 原始内容/)).not.toBeInTheDocument();
  });

  it("renders the header usage badge with an empty placeholder when no llm_usage events are present", async () => {
    installFakeBridge();
    render(<KairosPage />);

    const badge = await screen.findByTestId("kairos-usage-badge");
    expect(badge.dataset.hasData).toBe("false");
    expect(within(badge).getByTestId("kairos-usage-tokens")).toHaveTextContent("0 tok");
    expect(within(badge).queryByTestId("kairos-usage-cost")).not.toBeInTheDocument();
  });

  it("renders tokens + cost in the header badge from KairosRuntimeState.usageSinceReset (default mode)", async () => {
    // 默认 mode = sinceReset；fixture 构造"累计 5 次调用、本阶段 2 次"，确认胶囊
    // 默认显示的是阶段维度。
    window.localStorage.removeItem("kairos.usageBadgeMode");
    installFakeBridge({
      initialState: {
        enabled: true,
        state: "ticking",
        budget: { enabled: false, balanceCny: 0, exhausted: false },
        todayTickCount: 3,
        toolCallCountInCurrentTick: 1,
        totalSleepSecondsToday: 30,
        usageLifetime: {
          callCount: 5,
          promptTokens: 30_000,
          completionTokens: 7_000,
          totalTokens: 37_000,
          reasoningTokens: 0,
          cacheHitTokens: 3_000,
          cacheMissTokens: 6_000,
          cost: 0.6,
          currency: "CNY",
        },
        usageSinceReset: {
          callCount: 2,
          promptTokens: 12_000,
          completionTokens: 3_400,
          totalTokens: 15_400,
          reasoningTokens: 0,
          cacheHitTokens: 1_500,
          cacheMissTokens: 2_500,
          cost: 0.181,
          currency: "CNY",
        },
      },
    });
    render(<KairosPage />);

    const badge = await screen.findByTestId("kairos-usage-badge");
    expect(badge.dataset.hasData).toBe("true");
    expect(badge.dataset.mode).toBe("sinceReset");
    expect(within(badge).getByTestId("kairos-usage-tokens")).toHaveTextContent("15.4K tok");
    expect(within(badge).getByTestId("kairos-usage-cost")).toHaveTextContent("¥0.18");
    expect(within(badge).getByTestId("kairos-usage-mode-chip")).toHaveTextContent("本阶段");
    // tooltip 含当前 mode 明细，并提示对面 mode 的总数（让用户瞥一眼就有总览）。
    const tooltip = badge.getAttribute("title") ?? "";
    expect(tooltip).toContain("【本阶段】LLM 调用 2 次");
    expect(tooltip).toContain("缓存命中 1.5K");
    expect(tooltip).toContain("点击图标切换至「累计」");
    expect(tooltip).toContain("累计 37.0K tok");
  });

  it("toggles between lifetime / sinceReset when the badge logo is clicked and persists choice in localStorage", async () => {
    window.localStorage.removeItem("kairos.usageBadgeMode");
    installFakeBridge({
      initialState: {
        enabled: true,
        state: "ticking",
        budget: { enabled: false, balanceCny: 0, exhausted: false },
        todayTickCount: 3,
        toolCallCountInCurrentTick: 1,
        totalSleepSecondsToday: 30,
        usageLifetime: {
          callCount: 5,
          promptTokens: 30_000,
          completionTokens: 7_000,
          totalTokens: 37_000,
          reasoningTokens: 0,
          cacheHitTokens: 3_000,
          cacheMissTokens: 6_000,
          cost: 0.6,
          currency: "CNY",
        },
        usageSinceReset: {
          callCount: 2,
          promptTokens: 12_000,
          completionTokens: 3_400,
          totalTokens: 15_400,
          reasoningTokens: 0,
          cacheHitTokens: 1_500,
          cacheMissTokens: 2_500,
          cost: 0.181,
          currency: "CNY",
        },
      },
    });
    const user = userEvent.setup();
    render(<KairosPage />);

    const badge = await screen.findByTestId("kairos-usage-badge");
    expect(badge.dataset.mode).toBe("sinceReset");
    expect(within(badge).getByTestId("kairos-usage-tokens")).toHaveTextContent("15.4K tok");

    // 点击切换按钮 → 切到 lifetime
    await user.click(within(badge).getByTestId("kairos-usage-toggle"));
    expect(badge.dataset.mode).toBe("lifetime");
    expect(within(badge).getByTestId("kairos-usage-tokens")).toHaveTextContent("37.0K tok");
    expect(within(badge).getByTestId("kairos-usage-mode-chip")).toHaveTextContent("累计");
    expect(window.localStorage.getItem("kairos.usageBadgeMode")).toBe("lifetime");

    // 再点一次切回
    await user.click(within(badge).getByTestId("kairos-usage-toggle"));
    expect(badge.dataset.mode).toBe("sinceReset");
    expect(window.localStorage.getItem("kairos.usageBadgeMode")).toBe("sinceReset");
  });

  it("updates header usage badge live when controller pushes new usage state", async () => {
    window.localStorage.removeItem("kairos.usageBadgeMode");
    const { pushState } = installFakeBridge();
    render(<KairosPage />);

    // 启动瞬间 controller 还没产生 llm_usage，胶囊默认空。
    const badge = await screen.findByTestId("kairos-usage-badge");
    expect(badge.dataset.hasData).toBe("false");

    // 模拟 controller eventSink 在累加完一条 llm_usage 后推送新 state（两份维度同步增长）。
    const sampleUsage = {
      callCount: 1,
      promptTokens: 800,
      completionTokens: 200,
      totalTokens: 1_000,
      reasoningTokens: 0,
      cacheHitTokens: 0,
      cacheMissTokens: 800,
      cost: 0.005,
      currency: "USD" as const,
    };
    act(() => {
      pushState({
        enabled: true,
        state: "ticking",
        budget: { enabled: false, balanceCny: 0, exhausted: false },
        todayTickCount: 1,
        toolCallCountInCurrentTick: 0,
        totalSleepSecondsToday: 0,
        usageLifetime: sampleUsage,
        usageSinceReset: sampleUsage,
      });
    });

    const refreshed = await screen.findByTestId("kairos-usage-badge");
    expect(refreshed.dataset.hasData).toBe("true");
    expect(within(refreshed).getByTestId("kairos-usage-tokens")).toHaveTextContent("1.0K tok");
    expect(within(refreshed).getByTestId("kairos-usage-cost")).toHaveTextContent("$0.0050");
  });

  it("reflects pushed state updates from stream", async () => {
    const { pushState } = installFakeBridge({
      initialState: {
        enabled: false,
        state: "stopped",
        budget: { enabled: false, balanceCny: 0, exhausted: false },
        todayTickCount: 0,
        toolCallCountInCurrentTick: 0,
        totalSleepSecondsToday: 0,
        usageLifetime: emptyUsage(),
        usageSinceReset: emptyUsage(),
      },
    });
    render(<KairosPage />);
    await screen.findByText(/Stopped/);
    act(() => {
      pushState({
        enabled: true,
        state: "ticking",
        budget: { enabled: false, balanceCny: 0, exhausted: false },
        todayTickCount: 3,
        toolCallCountInCurrentTick: 2,
        totalSleepSecondsToday: 120,
        usageLifetime: emptyUsage(),
        usageSinceReset: emptyUsage(),
      });
    });
    expect(await screen.findByText(/Ticking/)).toBeInTheDocument();
    const stats = screen.getByLabelText("统计");
    expect(within(stats).getByText("巡检")).toBeInTheDocument();
    expect(within(stats).getByText("3")).toBeInTheDocument();
  });

  it("budget_exhausted 状态显示「额度不足」状态条 + danger 额度胶囊", async () => {
    installFakeBridge({
      initialState: {
        enabled: false,
        state: "budget_exhausted",
        budget: { enabled: true, balanceCny: 0, exhausted: true },
        todayTickCount: 5,
        toolCallCountInCurrentTick: 0,
        totalSleepSecondsToday: 0,
        usageLifetime: emptyUsage(),
        usageSinceReset: emptyUsage(),
      },
    });
    render(<KairosPage />);

    expect(await screen.findByText("额度不足")).toBeInTheDocument();
    const chip = screen.getByTestId("kairos-budget-chip");
    expect(chip.dataset.exhausted).toBe("true");
    expect(within(chip).getByText("不足")).toBeInTheDocument();
    // 耗尽时主操作仍是「开启」（不自动恢复，需用户充值后手动开）
    expect(screen.getByRole("button", { name: "开启" })).toBeInTheDocument();
  });

  it("开启额度限制且运行中：额度胶囊显示剩余余额 ¥x.xx", async () => {
    installFakeBridge({
      initialState: {
        enabled: true,
        state: "idle",
        budget: { enabled: true, balanceCny: 3.5, exhausted: false },
        todayTickCount: 1,
        toolCallCountInCurrentTick: 0,
        totalSleepSecondsToday: 0,
        usageLifetime: emptyUsage(),
        usageSinceReset: emptyUsage(),
      },
    });
    render(<KairosPage />);

    const chip = await screen.findByTestId("kairos-budget-chip");
    expect(chip).toHaveTextContent("¥3.50");
    expect(chip.dataset.exhausted).toBe("false");
  });

  it("额度限制关闭时不渲染额度胶囊", async () => {
    installFakeBridge({
      initialState: {
        enabled: true,
        state: "idle",
        budget: { enabled: false, balanceCny: 0, exhausted: false },
        todayTickCount: 1,
        toolCallCountInCurrentTick: 0,
        totalSleepSecondsToday: 0,
        usageLifetime: emptyUsage(),
        usageSinceReset: emptyUsage(),
      },
    });
    render(<KairosPage />);

    await screen.findByText(/Idle/);
    expect(screen.queryByTestId("kairos-budget-chip")).not.toBeInTheDocument();
  });
});
