import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AppSettings,
  KairosBridgeApi,
  KairosBudgetRuntime,
  KairosRuntimeState,
  UsableModelView,
} from "@actspace/shared";
import { emptyKairosUsageSummary } from "@actspace/shared";
import { KairosSettings } from "../components/settings/KairosSettings";

function makeSettings(): AppSettings {
  return {
    version: 2,
    defaultModelId: null,
    providers: { deepseek: { hasApiKey: true }, kimi: { hasApiKey: false }, openrouter: { hasApiKey: true } },
    installedModels: {},
    customModels: {},
    taskModels: { defaultChatModel: null, utilityModel: null, exploreModel: null },
    kairosModelKey: null,
    searchProviders: {
      zhipu: { hasApiKey: false },
      tavily: { hasApiKey: false },
      tinyfish: { hasApiKey: false },
      exa: { hasApiKey: false },
    },
    agent: {
      systemPromptPath: "/tmp/actspace/prompts/main-agent.md",
      temperature: null,
      maxTokens: null,
      disabledTools: [],
      bashAlwaysAsk: false,
      exploreModelId: null,
    },
    kairos: { modelId: null, thinking: "auto", enabledSkills: [] },
    plugins: { repoRoot: null, fsWatch: { enabled: false } },
    skills: { disabled: [] },
  };
}

function makeState(budget: KairosBudgetRuntime): KairosRuntimeState {
  return {
    enabled: false,
    state: "stopped",
    budget,
    todayTickCount: 0,
    toolCallCountInCurrentTick: 0,
    totalSleepSecondsToday: 0,
    usageLifetime: emptyKairosUsageSummary(),
    usageSinceReset: emptyKairosUsageSummary(),
  };
}

type KairosBridge = NonNullable<typeof window.kairos>;
type ActspaceBridge = NonNullable<typeof window.actspace>;

const openRouterKairosModel: UsableModelView = {
  key: "openrouter:anthropic/claude-sonnet-4",
  label: "Claude Sonnet 4",
  provider: "openrouter",
  apiModel: "anthropic/claude-sonnet-4",
  contextWindow: 200_000,
  thinkingDefault: false,
  capabilities: {
    input: ["text"],
    toolUse: "declared",
    reasoning: true,
    thinkingToggle: true,
  },
};

function installKairosBridge(budget: KairosBudgetRuntime): {
  control: ReturnType<typeof vi.fn>;
} {
  const control = vi.fn(async () => ({ ok: true as const }));
  const bridge: KairosBridgeApi = {
    getState: vi.fn(async () => makeState(budget)),
    getEventsRecent: vi.fn(async () => ({ events: [], hasMore: false })),
    control,
    readConfig: vi.fn(async (req) => ({ content: "", fileName: `${req.name}.json`, notFound: true })),
    writeConfig: vi.fn(async () => ({ ok: true as const })),
    getContextSnapshot: vi.fn(async () => ({ generatedAt: new Date().toISOString(), sections: [] })),
    notificationsList: vi.fn(async () => ({ notifications: [], unreadCount: 0 })),
    notificationsMarkRead: vi.fn(async () => ({ ok: true as const, unreadCount: 0 })),
    notificationsRemove: vi.fn(async () => ({ ok: true as const, removedCount: 0, unreadCount: 0 })),
    onEvent: vi.fn(() => () => {}),
    onState: vi.fn(() => () => {}),
    onNotification: vi.fn(() => () => {}),
  } as unknown as KairosBridgeApi;
  window.kairos = bridge as unknown as KairosBridge;
  return { control };
}

describe("KairosSettings 额度护栏控件", () => {
  afterEach(() => {
    delete (window as { kairos?: KairosBridge }).kairos;
    delete (window as { actspace?: ActspaceBridge }).actspace;
  });

  it("discovers purpose-filtered Kairos models and saves a provider-qualified ModelKey", async () => {
    installKairosBridge({ enabled: false, balanceCny: 0, exhausted: false });
    const listUsableModels = vi.fn(async () => ({ models: [openRouterKairosModel] }));
    const updateKairosModel = vi.fn(async () => ({ modelKey: openRouterKairosModel.key }));
    const onChanged = vi.fn();
    window.actspace = { listUsableModels, updateKairosModel } as unknown as ActspaceBridge;

    render(<KairosSettings settings={makeSettings()} onUpdate={() => {}} onChanged={onChanged} />);
    const select = await screen.findByLabelText("Kairos 模型");
    await waitFor(() => expect(listUsableModels).toHaveBeenCalledWith({ purpose: "kairos" }));
    await userEvent.selectOptions(select, openRouterKairosModel.key);

    await waitFor(() => expect(updateKairosModel).toHaveBeenCalledWith({ modelKey: openRouterKairosModel.key }));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("回填 getState().budget：开关与剩余额度", async () => {
    installKairosBridge({ enabled: true, balanceCny: 5, exhausted: false });
    render(<KairosSettings settings={makeSettings()} onUpdate={() => {}} />);

    const toggle = await screen.findByRole("switch", { name: "Kairos 额度限制" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    const balance = screen.getByLabelText("Kairos 剩余额度") as HTMLInputElement;
    await waitFor(() => expect(balance.value).toBe("5"));
    expect(balance).not.toBeDisabled();
  });

  it("打开额度开关 → control(set_budget, enabled:true)", async () => {
    const { control } = installKairosBridge({ enabled: false, balanceCny: 0, exhausted: false });
    render(<KairosSettings settings={makeSettings()} onUpdate={() => {}} />);

    const toggle = await screen.findByRole("switch", { name: "Kairos 额度限制" });
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(control).toHaveBeenCalledWith({ type: "set_budget", enabled: true, balanceCny: 0 }),
    );
  });

  it("修改剩余额度并失焦 → control(set_budget, balanceCny)", async () => {
    const { control } = installKairosBridge({ enabled: true, balanceCny: 5, exhausted: false });
    render(<KairosSettings settings={makeSettings()} onUpdate={() => {}} />);

    const balance = (await screen.findByLabelText("Kairos 剩余额度")) as HTMLInputElement;
    await waitFor(() => expect(balance.value).toBe("5"));

    await userEvent.clear(balance);
    await userEvent.type(balance, "12.5");
    await userEvent.tab();

    await waitFor(() =>
      expect(control).toHaveBeenCalledWith({ type: "set_budget", enabled: true, balanceCny: 12.5 }),
    );
  });

  it("关闭额度限制时剩余额度输入禁用", async () => {
    installKairosBridge({ enabled: false, balanceCny: 0, exhausted: false });
    render(<KairosSettings settings={makeSettings()} onUpdate={() => {}} />);

    const balance = (await screen.findByLabelText("Kairos 剩余额度")) as HTMLInputElement;
    expect(balance).toBeDisabled();
  });

  it("耗尽时显示「额度不足」提示", async () => {
    installKairosBridge({ enabled: true, balanceCny: 0, exhausted: true });
    render(<KairosSettings settings={makeSettings()} onUpdate={() => {}} />);

    expect(await screen.findByText("额度不足")).toBeInTheDocument();
  });
});
