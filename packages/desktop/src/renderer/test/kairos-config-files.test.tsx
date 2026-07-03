import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppSettings, KairosBridgeApi, KairosConfigName } from "@actspace/shared";
import { KairosSettings } from "../components/settings/KairosSettings";

function makeSettings(): AppSettings {
  return {
    version: 1,
    defaultModelId: null,
    providers: { deepseek: { hasApiKey: false }, kimi: { hasApiKey: false } },
    agent: {
      systemPromptPath: "/tmp/actspace/prompts/main-agent.md",
      temperature: null,
      maxTokens: null,
      disabledTools: [],
      bashAlwaysAsk: false,
      exploreModelId: null,
    },
    kairos: { modelId: null, thinking: "auto", enabledSkills: [] },
    plugins: { fsWatch: { enabled: false } },
    skills: { disabled: [] },
  };
}

const FILE_NAME: Record<KairosConfigName, string> = {
  preferences: "preferences.json",
  paths: "paths.json",
  blocklist: "blocklist.json",
  rule: "rule.md",
};

type WriteArg = { name: KairosConfigName; content: string };
type BridgeOverrides = Partial<{
  contents: Partial<Record<KairosConfigName, string>>;
  writeImpl: KairosBridgeApi["writeConfig"];
}>;

function installBridge(over: BridgeOverrides = {}) {
  const contents: Record<KairosConfigName, string> = {
    preferences: over.contents?.preferences ?? JSON.stringify({ enabled: false }, null, 2) + "\n",
    paths: over.contents?.paths ?? JSON.stringify({ tip: "t", paths: [] }, null, 2) + "\n",
    blocklist: over.contents?.blocklist ?? JSON.stringify({ paths: [], toolsDenied: [] }, null, 2) + "\n",
    rule: over.contents?.rule ?? "# rule\n",
  };
  const readConfig = vi.fn(async ({ name }: { name: KairosConfigName }) => ({
    content: contents[name],
    fileName: FILE_NAME[name],
    notFound: contents[name].length === 0,
  }));
  const writeConfig = vi.fn(
    over.writeImpl ??
      (async ({ name, content }: WriteArg) => {
        contents[name] = content;
        return { ok: true } as const;
      }),
  );
  const bridge = {
    getState: vi.fn(),
    getEventsRecent: vi.fn(),
    control: vi.fn(),
    readConfig,
    writeConfig,
    getContextSnapshot: vi.fn(),
    onEvent: () => () => {},
    onState: () => () => {},
  } as unknown as KairosBridgeApi;
  (window as unknown as { kairos: KairosBridgeApi }).kairos = bridge;
  return { bridge, readConfig, writeConfig, contents };
}

/** 取某文件最后一次写入的解析对象。 */
function lastWrite(writeConfig: ReturnType<typeof vi.fn>, name: KairosConfigName): Record<string, unknown> | undefined {
  const call = [...writeConfig.mock.calls].reverse().find((c) => (c[0] as WriteArg).name === name);
  if (!call) return undefined;
  return JSON.parse((call[0] as WriteArg).content) as Record<string, unknown>;
}

beforeEach(() => {
  delete (window as unknown as { kairos?: KairosBridgeApi }).kairos;
});

afterEach(() => {
  delete (window as unknown as { kairos?: KairosBridgeApi }).kairos;
});

describe("KairosSettings — 结构化配置表单", () => {
  it("渲染结构化分组（运行偏好 / 可访问路径 / 屏蔽规则 / 用户规则）与模型下拉", async () => {
    installBridge();
    render(<KairosSettings settings={makeSettings()} onUpdate={vi.fn()} />);

    expect(await screen.findByText("运行偏好")).toBeInTheDocument();
    expect(screen.getByText("可访问路径")).toBeInTheDocument();
    expect(screen.getByText("屏蔽规则")).toBeInTheDocument();
    expect(screen.getByText("用户规则")).toBeInTheDocument();
    expect(screen.getByLabelText("Kairos 模型")).toBeInTheDocument();
    expect(screen.getByLabelText("rule.md 内容")).toBeInTheDocument();
  });

  it("桥不可用时降级提示、模型下拉禁用、不发 IPC", () => {
    render(<KairosSettings settings={makeSettings()} onUpdate={vi.fn()} />);

    expect(screen.getByText("Kairos 配置仅在桌面端可编辑。")).toBeInTheDocument();
    expect(screen.getByLabelText("Kairos 模型")).toBeDisabled();
  });

  it("添加路径并填路径后写回 paths.json（过滤空行后含该路径）", async () => {
    const { writeConfig } = installBridge();
    render(<KairosSettings settings={makeSettings()} onUpdate={vi.fn()} />);

    await screen.findByText("可访问路径");
    await userEvent.click(screen.getByRole("button", { name: "添加路径" }));
    const input = screen.getByLabelText("路径 1");
    await userEvent.type(input, "/Users/me/docs");
    await userEvent.tab();

    await waitFor(() => {
      const written = lastWrite(writeConfig, "paths");
      expect(written).toBeDefined();
      const paths = written!.paths as Array<{ path: string }>;
      expect(paths).toHaveLength(1);
      expect(paths[0].path).toBe("/Users/me/docs");
    });
  });

  it("切换路径 watch 巡检开关写回 watch=true", async () => {
    const { writeConfig } = installBridge({
      contents: { paths: JSON.stringify({ paths: [{ path: "/a", watch: false }] }, null, 2) + "\n" },
    });
    render(<KairosSettings settings={makeSettings()} onUpdate={vi.fn()} />);

    const toggle = await screen.findByLabelText("路径 1 巡检");
    await userEvent.click(toggle);

    await waitFor(() => {
      const paths = lastWrite(writeConfig, "paths")!.paths as Array<{ watch: boolean }>;
      expect(paths[0].watch).toBe(true);
    });
  });

  it("默认 workspace 行标「默认」且不可删除，普通行可删除", async () => {
    installBridge({
      contents: {
        paths:
          JSON.stringify(
            {
              paths: [
                { path: "/Users/me/Library/Application Support/actspace/kairos/workspace", watch: true, tip: "默认空间" },
                { path: "/Users/me/docs", watch: false },
              ],
            },
            null,
            2,
          ) + "\n",
      },
    });
    render(<KairosSettings settings={makeSettings()} onUpdate={vi.fn()} />);

    await screen.findByRole("button", { name: "添加路径" });
    const section = screen.getByText("可访问路径").closest("section") as HTMLElement;
    // 默认行有「默认」徽章；该行没有删除按钮，普通行（路径 2）有。
    expect(within(section).getByText("默认")).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "删除路径 1" })).toBeNull();
    expect(within(section).getByRole("button", { name: "删除路径 2" })).toBeInTheDocument();
  });

  it("点击「+ 添加说明」可编辑并写回路径 tip", async () => {
    const { writeConfig } = installBridge({
      contents: { paths: JSON.stringify({ paths: [{ path: "/Users/me/docs", watch: false }] }, null, 2) + "\n" },
    });
    render(<KairosSettings settings={makeSettings()} onUpdate={vi.fn()} />);

    const tipButton = await screen.findByRole("button", { name: "路径 1 说明" });
    expect(tipButton).toHaveTextContent("添加说明");
    await userEvent.click(tipButton);
    const tipInput = screen.getByLabelText("路径 1 说明");
    await userEvent.type(tipInput, "我的笔记目录");
    await userEvent.tab();

    await waitFor(() => {
      const paths = lastWrite(writeConfig, "paths")!.paths as Array<{ tip?: string }>;
      expect(paths[0].tip).toBe("我的笔记目录");
    });
  });

  it("禁用工具多选选中 Bash 后写回 blocklist.toolsDenied 含 bash", async () => {
    const { writeConfig } = installBridge();
    render(<KairosSettings settings={makeSettings()} onUpdate={vi.fn()} />);

    await userEvent.click(await screen.findByLabelText("Kairos 禁用工具"));
    await userEvent.click(await screen.findByRole("option", { name: "Bash 终端" }));

    await waitFor(() => {
      expect(lastWrite(writeConfig, "blocklist")!.toolsDenied).toContain("bash");
    });
  });

  it("修改睡眠区间最短值写回 sleepRangeSeconds.min", async () => {
    const { writeConfig } = installBridge({
      contents: {
        preferences:
          JSON.stringify({ sleepRangeSeconds: { min: 30, max: 900, default: 120 } }, null, 2) + "\n",
      },
    });
    render(<KairosSettings settings={makeSettings()} onUpdate={vi.fn()} />);

    const minField = await screen.findByLabelText("睡眠区间最短");
    await userEvent.clear(minField);
    await userEvent.type(minField, "45");
    await userEvent.tab();

    await waitFor(() => {
      const sleep = lastWrite(writeConfig, "preferences")!.sleepRangeSeconds as { min: number };
      expect(sleep.min).toBe(45);
    });
  });

  it("运行节奏只暴露固定时间说明和频率下拉，不暴露起止时间输入", async () => {
    installBridge({
      contents: {
        preferences:
          JSON.stringify(
            {
              rhythm: {
                workHours: { start: "10:00", end: "16:00", sleepBias: "normal" },
                quietHours: { start: "01:00", end: "05:00", sleepBias: "deep" },
              },
            },
            null,
            2,
          ) + "\n",
      },
    });
    render(<KairosSettings settings={makeSettings()} onUpdate={vi.fn()} />);

    expect(await screen.findByText("工作时段")).toBeInTheDocument();
    expect(screen.getByText("晚上时段")).toBeInTheDocument();
    expect(screen.getByText(/09:00 - 21:00/)).toBeInTheDocument();
    expect(screen.getByText(/23:00 - 07:00/)).toBeInTheDocument();
    expect(screen.queryByLabelText("工作时段开始")).toBeNull();
    expect(screen.queryByLabelText("晚上时段开始")).toBeNull();
    expect(screen.getByLabelText("工作时段运行频率")).toBeInTheDocument();
    expect(screen.getByLabelText("晚上时段运行频率")).toBeInTheDocument();
  });

  it("修改工作时段运行频率只写回 rhythm.workHours.sleepBias", async () => {
    const { writeConfig } = installBridge({
      contents: {
        preferences:
          JSON.stringify(
            {
              rhythm: {
                workHours: { start: "09:00", end: "21:00", sleepBias: "normal" },
                quietHours: { start: "23:00", end: "07:00", sleepBias: "deep" },
              },
            },
            null,
            2,
          ) + "\n",
      },
    });
    render(<KairosSettings settings={makeSettings()} onUpdate={vi.fn()} />);

    await userEvent.click(await screen.findByLabelText("工作时段运行频率"));
    await userEvent.click(await screen.findByRole("option", { name: "浅睡（更活跃）" }));

    await waitFor(() => {
      const written = lastWrite(writeConfig, "preferences")!;
      const rhythm = written.rhythm as { workHours: { start: string; end: string; sleepBias: string } };
      expect(rhythm.workHours).toEqual({ start: "09:00", end: "21:00", sleepBias: "light" });
    });
  });

  it("改模型下拉通过统一设置写回 settings.kairos.modelId", async () => {
    const onUpdate = vi.fn();
    const { writeConfig } = installBridge({
      contents: {
        preferences: JSON.stringify({ enabled: true, tickBudget: { perDay: 7 } }, null, 2) + "\n",
      },
    });
    render(<KairosSettings settings={makeSettings()} onUpdate={onUpdate} />);

    const trigger = await screen.findByLabelText("Kairos 模型");
    await waitFor(() => expect(trigger).not.toBeDisabled());
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "DeepSeek V4 Pro" }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({ kairos: { modelId: "deepseek-v4-pro" } });
    });
    expect(writeConfig).not.toHaveBeenCalledWith(expect.objectContaining({ name: "preferences" }));
  });

  it("rule.md 文本框失焦自动写回原文本", async () => {
    const { writeConfig } = installBridge();
    render(<KairosSettings settings={makeSettings()} onUpdate={vi.fn()} />);

    const textarea = await screen.findByLabelText("rule.md 内容");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "# new rule");
    await userEvent.tab();

    await waitFor(() => {
      expect(writeConfig).toHaveBeenCalledWith({ name: "rule", content: "# new rule" });
    });
  });

  it("preferences.json 解析失败时模型下拉仍可用，并可用默认值覆盖恢复运行偏好", async () => {
    const { writeConfig } = installBridge({ contents: { preferences: "{ broken json" } });
    const onUpdate = vi.fn();
    render(<KairosSettings settings={makeSettings()} onUpdate={onUpdate} />);

    const trigger = await screen.findByLabelText("Kairos 模型");
    await waitFor(() => expect(trigger).not.toBeDisabled());
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "DeepSeek V4 Pro" }));
    expect(onUpdate).toHaveBeenCalledWith({ kairos: { modelId: "deepseek-v4-pro" } });

    await userEvent.click(screen.getByRole("button", { name: "用默认值覆盖 preferences.json" }));

    await waitFor(() => {
      const written = lastWrite(writeConfig, "preferences")!;
      expect(written.rhythm).toBeDefined();
      expect(written.sleepRangeSeconds).toBeDefined();
    });
  });
});
