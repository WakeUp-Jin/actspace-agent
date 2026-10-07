import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { ComposerMode, ModelSelectionId, SkillCatalogItem } from "@actspace/shared";
import { Composer } from "../components/Composer";
import { ComposerPalette, paletteModes, type ComposerPaletteProps } from "../components/composer/ComposerPalette";
import type { ComposerModelOption } from "../components/composer/model-options";
import { TooltipProvider } from "../components/ui/Tooltip";
import type { ModelCatalog } from "../target/use-model-catalog";
import { mockContextSnapshot } from "./fixtures/workbenchFixture";

const catalog: ModelCatalog = {
  source: "local-providers",
  groups: [
    { key: "anthropic:Anthropic", label: "Anthropic", models: [{ id: "anthropic/sonnet", label: "Sonnet 5.5" }, { id: "anthropic/opus", label: "Opus 5.5" }] },
    { key: "deepseek:DeepSeek", label: "DeepSeek", models: [{ id: "deepseek/flash", label: "deepseek-flash" }] },
  ],
};

const sonnetOption: ComposerModelOption = {
  id: "anthropic/sonnet" as ModelSelectionId,
  label: "Sonnet 5.5",
  provider: "openrouter",
  apiModel: "anthropic/claude-sonnet-5-5",
  thinkingDefault: true,
  supportsThinkingToggle: true,
  reasoningMandatory: false,
};

function skill(name: string, description: string): SkillCatalogItem {
  return { name, description, scope: "project", source: "project", location: `/work/.skills/${name}`, directory: `/work/.skills/${name}`, status: "available", removable: true, enabledForAgent: true, shadowed: false };
}

type HarnessProps = Partial<Omit<ComposerPaletteProps, "open" | "onOpenChange" | "children">> & { initiallyOpen?: boolean };

function renderPalette(overrides: HarnessProps = {}) {
  const calls = {
    onReturnFocus: vi.fn(),
    onSelectMode: vi.fn(),
    onSelectAttachment: vi.fn(),
    onSelectModel: vi.fn(),
    onToggleSkill: vi.fn(),
    onOptionsChange: vi.fn(),
  };
  function Harness() {
    const [open, setOpen] = useState(overrides.initiallyOpen ?? true);
    return (
      <ComposerPalette
        open={open}
        onOpenChange={setOpen}
        onReturnFocus={calls.onReturnFocus}
        mode={overrides.mode ?? "agent"}
        sessionStarted={overrides.sessionStarted ?? false}
        modeDisabled={overrides.modeDisabled ?? false}
        onSelectMode={calls.onSelectMode}
        attachment={overrides.attachment ?? { label: "图片", icon: "images", onSelect: calls.onSelectAttachment }}
        skills={overrides.skills === undefined ? {
          items: [skill("frontend-design", "前端设计规范"), skill("release", "发布流程")],
          loading: false,
          error: null,
          selected: [],
          onToggle: calls.onToggleSkill,
          onRetry: vi.fn(),
        } : overrides.skills}
        models={overrides.models ?? {
          catalog,
          selectedModelId: "anthropic/opus",
          selectedLabel: "Opus 5.5",
          onSelect: calls.onSelectModel,
          options: { find: (id) => (id === sonnetOption.id ? sonnetOption : undefined), values: {}, onChange: calls.onOptionsChange },
        }}
      >
        <div>
          <textarea aria-label="消息输入框" />
          <button type="button" onClick={() => setOpen(!open)}>加号</button>
        </div>
      </ComposerPalette>
    );
  }
  render(<Harness />);
  return calls;
}

const search = () => screen.getByRole("combobox");
const activeOption = () => document.getElementById(search().getAttribute("aria-activedescendant") ?? "");
const optionNames = (name: string) => within(screen.getByRole("listbox", { name })).getAllByRole("option").map((option) => option.getAttribute("aria-label"));

afterEach(() => cleanup());

describe("ComposerPalette", () => {
  it.each<[ComposerMode, boolean, ComposerMode[]]>([
    ["agent", false, ["plan", "chat"]],
    ["plan", false, ["chat"]],
    ["chat", false, ["plan"]],
    ["agent", true, ["plan"]],
    ["plan", true, []],
    ["chat", true, []],
  ])("lists only non-default modes (%s, started=%s)", (mode, started, expected) => {
    expect(paletteModes(mode, started)).toEqual(expected);
  });

  it("opens on the main page with search focused and the first row active", () => {
    renderPalette();
    expect(search()).toHaveFocus();
    expect(search()).toHaveAttribute("placeholder", "搜索 Skills、文件、模型…");
    expect(optionNames("添加上下文或工具")).toEqual(["Plan", "Chat", "图片", "Skills", "模型"]);
    expect(screen.getByRole("option", { name: "模型" })).toHaveTextContent("Opus 5.5");
    expect(activeOption()).toHaveAttribute("aria-label", "Plan");
    expect(activeOption()).toHaveAttribute("aria-selected", "true");
  });

  it("does not list Plan while in Plan, and shows no mode group in a started Chat session", () => {
    renderPalette({ mode: "plan", sessionStarted: true });
    expect(optionNames("添加上下文或工具")).toEqual(["图片", "Skills", "模型"]);
    cleanup();
    renderPalette({ mode: "chat", sessionStarted: true, skills: null, attachment: { label: "图片与文件", icon: "files", onSelect: vi.fn() } });
    expect(optionNames("添加上下文或工具")).toEqual(["图片与文件", "模型"]);
  });

  it("shows a model row after typing a model name and selects it with Enter", async () => {
    const user = userEvent.setup();
    const calls = renderPalette();
    await user.type(search(), "son");
    const results = screen.getByRole("listbox", { name: "添加上下文或工具" });
    const models = within(results).getByRole("group", { name: "模型" });
    expect(within(models).getByRole("option", { name: "Sonnet 5.5" })).toHaveTextContent("Anthropic");
    expect(within(results).queryByRole("option", { name: "Plan" })).not.toBeInTheDocument();
    expect(activeOption()).toHaveAttribute("aria-label", "Sonnet 5.5");
    await user.keyboard("{Enter}");
    expect(calls.onSelectModel).toHaveBeenCalledWith("anthropic/sonnet");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(calls.onReturnFocus).toHaveBeenCalledTimes(1);
  });

  it("searches Skills from the main page and says when nothing matches", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(search(), "发布");
    expect(within(screen.getByRole("group", { name: "Skills" })).getByRole("option", { name: "release" })).toBeInTheDocument();
    await user.clear(search());
    await user.type(search(), "zzz");
    expect(screen.queryAllByRole("option")).toEqual([]);
    expect(screen.getByText("没有匹配的结果。")).toBeInTheDocument();
  });

  it("cycles with the arrow keys and skips mode rows while running", async () => {
    const user = userEvent.setup();
    renderPalette({ modeDisabled: true });
    expect(screen.getByRole("option", { name: "Plan" })).toHaveAttribute("aria-disabled", "true");
    expect(activeOption()).toHaveAttribute("aria-label", "图片");
    await user.keyboard("{ArrowUp}");
    expect(activeOption()).toHaveAttribute("aria-label", "模型");
    await user.keyboard("{ArrowDown}");
    expect(activeOption()).toHaveAttribute("aria-label", "图片");
    await user.keyboard("{ArrowDown}");
    expect(activeOption()).toHaveAttribute("aria-label", "Skills");
  });

  it("selects a mode with Tab and an attachment entry with a click", async () => {
    const user = userEvent.setup();
    const calls = renderPalette();
    await user.keyboard("{ArrowDown}{Tab}");
    expect(calls.onSelectMode).toHaveBeenCalledWith("chat");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "加号" }));
    await user.click(screen.getByRole("option", { name: "图片" }));
    expect(calls.onSelectAttachment).toHaveBeenCalledTimes(1);
  });

  it("drills into Skills with →, toggles without closing, and comes back with ← or Backspace", async () => {
    const user = userEvent.setup();
    const calls = renderPalette();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(activeOption()).toHaveAttribute("aria-label", "Skills");
    await user.keyboard("{ArrowRight}");
    expect(optionNames("Skills")).toEqual(["frontend-design", "release"]);
    expect(search()).toHaveAttribute("placeholder", "搜索 Skills");
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(calls.onToggleSkill).toHaveBeenCalledWith("frontend-design");
    expect(screen.getByRole("listbox", { name: "Skills" })).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("listbox", { name: "添加上下文或工具" })).toBeInTheDocument();
    expect(activeOption()).toHaveAttribute("aria-label", "Skills");

    await user.keyboard("{ArrowRight}");
    await user.type(search(), "re");
    // 搜索框里有字时 ← 和 Backspace 只编辑文字。
    await user.keyboard("{Backspace}{ArrowLeft}");
    expect(screen.getByRole("listbox", { name: "Skills" })).toBeInTheDocument();
    await user.keyboard("{End}{Backspace}");
    expect(search()).toHaveValue("");
    expect(screen.getByRole("listbox", { name: "Skills" })).toBeInTheDocument();
    await user.keyboard("{Backspace}");
    expect(screen.getByRole("listbox", { name: "添加上下文或工具" })).toBeInTheDocument();
  });

  it("goes back one level on Escape and closes on the main page", async () => {
    const user = userEvent.setup();
    const calls = renderPalette();
    await user.click(screen.getByRole("option", { name: "模型" }));
    expect(optionNames("模型")).toEqual(["Sonnet 5.5", "Opus 5.5", "deepseek-flash"]);
    expect(within(screen.getByRole("group", { name: "Anthropic" })).getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: "Opus 5.5" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("listbox", { name: "添加上下文或工具" })).toBeInTheDocument();
    expect(activeOption()).toHaveAttribute("aria-label", "模型");
    expect(calls.onReturnFocus).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(calls.onReturnFocus).toHaveBeenCalledTimes(1);
  });

  it("opens a model's options as a page and returns to the model list", async () => {
    const user = userEvent.setup();
    const calls = renderPalette();
    await user.click(screen.getByRole("option", { name: "模型" }));
    expect(screen.queryByRole("button", { name: "编辑 anthropic/opus 选项" })).not.toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("Sonnet 5.5 选项")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回" })).toHaveFocus();
    await user.click(screen.getByRole("checkbox", { name: "anthropic/sonnet Thinking" }));
    expect(calls.onOptionsChange).toHaveBeenCalledWith("anthropic/sonnet", expect.any(Function));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("listbox", { name: "模型" })).toBeInTheDocument();
    expect(search()).toHaveFocus();
    expect(activeOption()).toHaveAttribute("aria-label", "Sonnet 5.5");
    await user.click(screen.getByRole("button", { name: "编辑 anthropic/sonnet 选项" }));
    expect(screen.getByText("Sonnet 5.5 选项")).toBeInTheDocument();
  });

  it("closes on an outside click without taking focus back, and the trigger toggles it", async () => {
    const user = userEvent.setup();
    const calls = renderPalette();
    await user.click(screen.getByLabelText("消息输入框"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(calls.onReturnFocus).not.toHaveBeenCalled();
    expect(screen.getByLabelText("消息输入框")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "加号" }));
    expect(screen.getByRole("listbox", { name: "添加上下文或工具" })).toBeInTheDocument();
    // 外部 pointerdown 推迟到 click 之后才处理：点触发器只由它自己关上，不会关了又开。
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await user.click(screen.getByRole("button", { name: "加号" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // 从外面关掉（触发器、别的浮层顶掉）也不抢焦点：焦点留在刚点的按钮上。
    expect(calls.onReturnFocus).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "加号" })).toHaveFocus();
  });
});

describe("Composer + panel", () => {
  it("returns focus to the message input after Escape", async () => {
    const user = userEvent.setup();
    render(<TooltipProvider delayDuration={0}><Composer contextSnapshot={mockContextSnapshot} /></TooltipProvider>);
    const plus = screen.getByRole("button", { name: "添加 Agent、上下文或工具" });
    await user.click(plus);
    expect(plus).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "搜索" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(plus).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("消息输入框")).toHaveFocus();
  });
});
