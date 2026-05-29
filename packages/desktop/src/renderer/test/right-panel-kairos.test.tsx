import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  KairosBridgeApi,
  KairosContextSnapshot,
  KairosControl,
  KairosControlResponse,
  KairosGetEventsRecentResponse,
  KairosRuntimeState,
  SessionEvent,
} from "@actspace/shared";
import { emptyKairosUsageSummary } from "@actspace/shared";
import { RightPanel } from "../components/RightPanel";

type FakeKairosOptions = Partial<{
  initialState: KairosRuntimeState;
  initialEvents: SessionEvent[];
  controlImpl: (ctrl: KairosControl) => Promise<KairosControlResponse>;
}>;

function installFakeBridge(opts: FakeKairosOptions = {}): KairosBridgeApi {
  let eventListener: ((ev: SessionEvent) => void) | undefined;
  let stateListener: ((s: KairosRuntimeState) => void) | undefined;
  const defaultState: KairosRuntimeState = {
    enabled: false,
    state: "stopped",
    todayTickCount: 0,
    toolCallCountInCurrentTick: 0,
    totalSleepSecondsToday: 0,
    usageLifetime: emptyKairosUsageSummary(),
    usageSinceReset: emptyKairosUsageSummary(),
  };
  const bridge: KairosBridgeApi = {
    getState: vi.fn(async () => opts.initialState ?? defaultState),
    getEventsRecent: vi.fn(async (): Promise<KairosGetEventsRecentResponse> => ({
      events: opts.initialEvents ?? [],
      hasMore: false,
    })),
    control: vi.fn(opts.controlImpl ?? (async () => ({ ok: true } as const))),
    readConfig: vi.fn(async () => ({ content: "", fileName: "preferences.json", notFound: true })),
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
  void eventListener;
  void stateListener;
  return bridge;
}

function makeEvent(overrides: Partial<SessionEvent> & { type: SessionEvent["type"] }): SessionEvent {
  return {
    id: overrides.id ?? `evt-${overrides.type}`,
    sessionId: "kairos-2026-05-28",
    turnId: overrides.turnId ?? "turn-1",
    timestamp: overrides.timestamp ?? "2026-05-28T02:03:51.000Z",
    schemaVersion: 1,
    payload: {},
    ...overrides,
  } as SessionEvent;
}

beforeEach(() => {
  delete (window as unknown as { kairos?: KairosBridgeApi }).kairos;
});

describe("RightPanel Kairos tab", () => {
  it("keeps right panel tab buttons out of Electron drag regions", () => {
    render(<RightPanel />);

    expect(screen.getByRole("tab", { name: "README.md" })).toHaveClass("[-webkit-app-region:no-drag]");
    expect(screen.getByRole("tab", { name: "Session diff" })).toHaveClass(
      "[-webkit-app-region:no-drag]",
    );
  });

  it("keeps README and diff tabs switchable", async () => {
    const user = userEvent.setup();
    render(<RightPanel />);

    expect(screen.getByText("Markdown preview")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Session diff" }));
    expect(screen.getByRole("heading", { name: "Session diff" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "README.md" }));
    expect(screen.getByText("Markdown preview")).toBeInTheDocument();
  });

  it("shows a compact unavailable state when the Kairos bridge is missing", async () => {
    const user = userEvent.setup();
    render(<RightPanel />);

    await user.click(screen.getByRole("tab", { name: "Kairos" }));

    expect(screen.getByLabelText("Kairos 右侧紧凑视图")).toBeInTheDocument();
    expect(screen.getByText("Kairos 桥未就绪")).toBeInTheDocument();
  });

  it("renders the latest reply and read-only compact trail rows", async () => {
    const base = new Date("2026-05-28T02:03:51.000Z").getTime();
    const events: SessionEvent[] = [
      makeEvent({
        id: "tick-1",
        type: "kairos_tick_injected",
        timestamp: new Date(base).toISOString(),
        payload: { trigger: "auto", content: "<tick/>" },
      }),
      makeEvent({
        id: "tool-call-1",
        type: "tool_call",
        timestamp: new Date(base + 1_000).toISOString(),
        payload: { id: "tc-1", name: "read_file", arguments: { path: "README.md" } },
      }),
      makeEvent({
        id: "tool-result-1",
        type: "tool_result",
        timestamp: new Date(base + 2_000).toISOString(),
        payload: { toolCallId: "tc-1", toolName: "read_file", ok: true, summary: "Read README.md" },
      }),
      makeEvent({
        id: "reply-1",
        type: "assistant_message",
        timestamp: new Date(base + 3_000).toISOString(),
        payload: { content: "环境无变化。继续待命。", stopReason: "stop", model: "m", provider: "p" },
      }),
    ];
    installFakeBridge({
      initialState: {
        enabled: true,
        state: "sleeping",
        sleepEndsAt: new Date(Date.now() + 4_000).toISOString(),
        todayTickCount: 1,
        toolCallCountInCurrentTick: 0,
        totalSleepSecondsToday: 0,
        usageLifetime: emptyKairosUsageSummary(),
        usageSinceReset: emptyKairosUsageSummary(),
      },
      initialEvents: events,
    });
    const user = userEvent.setup();
    render(<RightPanel />);

    await user.click(screen.getByRole("tab", { name: "Kairos" }));

    expect(await screen.findByText(/Sleeping/)).toBeInTheDocument();
    const reply = screen.getByLabelText("最终回复");
    expect(within(reply).getByText("环境无变化。继续待命。")).toBeInTheDocument();
    const trail = screen.getByLabelText("轨迹列表");
    expect(within(trail).getByText("最终回复")).toBeInTheDocument();
    expect(within(trail).getByText("工具执行")).toBeInTheDocument();
    expect(within(trail).queryAllByRole("button")).toHaveLength(0);
  });

  it("calls Kairos controls from compact buttons", async () => {
    const bridge = installFakeBridge({
      initialState: {
        enabled: true,
        state: "idle",
        todayTickCount: 0,
        toolCallCountInCurrentTick: 0,
        totalSleepSecondsToday: 0,
        usageLifetime: emptyKairosUsageSummary(),
        usageSinceReset: emptyKairosUsageSummary(),
      },
    });
    const user = userEvent.setup();
    render(<RightPanel />);

    await user.click(screen.getByRole("tab", { name: "Kairos" }));
    await screen.findByText("Idle");
    await user.click(screen.getByRole("button", { name: "暂停 Kairos" }));
    await user.click(screen.getByRole("button", { name: "唤醒 Kairos" }));
    await user.click(screen.getByRole("button", { name: "重置 Kairos 统计" }));

    expect(bridge.control).toHaveBeenCalledWith({ type: "stop" });
    expect(bridge.control).toHaveBeenCalledWith({ type: "wake_now" });
    expect(bridge.control).toHaveBeenCalledWith({ type: "reset_today" });
  });
});
