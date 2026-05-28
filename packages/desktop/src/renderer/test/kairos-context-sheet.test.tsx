import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { KairosContextSnapshot } from "@actspace/shared";
import { KairosContextSheet } from "../components/kairos/KairosContextSheet";

const baseSnapshot: KairosContextSnapshot = {
  generatedAt: "2026-05-28T08:00:30Z",
  modelId: null,
  phase: "work",
  systemPrompt:
    "You are Kairos —— actspace 的自治守护进程。\n\n# 上下文段\n[当前时间] 2026-05-28T08:00:30Z（work）\n[活跃 briefs] 0 个",
  systemPromptTokens: 64,
  systemPromptSegments: [
    {
      label: "Kairos 角色与节奏",
      text: "You are Kairos —— actspace 的自治守护进程。\n\n详细规则略。",
      sourceFiles: ["packages/agent-core/src/kairos/prompt.ts"],
    },
    {
      label: "运行上下文",
      text: "[当前时间] 2026-05-28T08:00:30Z（work）\n[活跃 briefs] 0 个",
    },
    {
      label: "用户规则",
      text: "请始终用中文回复。",
      sourceFiles: ["/Users/me/.actspace/kairos/config/rule.md"],
    },
  ],
  historySummary: [
    { label: "week_2026-W21", text: "上周回顾要点。" },
  ],
  historyMessages: [
    {
      role: "user",
      source: "kairos_tick",
      content: "<tick first wake-up/>",
      timestamp: "2026-05-28T07:00:00Z",
    },
    {
      role: "assistant",
      content: "好的\n第二行\n第三行\n第四行——本行默认应被折叠。",
      timestamp: "2026-05-28T07:00:01Z",
    },
  ],
  tools: [
    {
      name: "sleep",
      description: "请求自治调度器睡眠 N 秒。",
      source: "kairos",
      parametersSchema: {
        type: "object",
        properties: { seconds: { type: "number", description: "睡眠秒数" } },
        required: ["seconds"],
      },
    },
    {
      name: "read_file",
      description: "读取本地文件内容（受 allowedRoots 限制）。",
      source: "shared",
      parametersSchema: {
        type: "object",
        properties: { path: { type: "string", description: "绝对路径" } },
        required: ["path"],
      },
    },
  ],
};

function Harness({ load }: { load: () => Promise<KairosContextSnapshot> }) {
  const [open, setOpen] = useState(true);
  return <KairosContextSheet open={open} onOpenChange={setOpen} load={load} />;
}

describe("KairosContextSheet", () => {
  it("renders the three primary sections and shows generatedAt in the title", async () => {
    const load = vi.fn(async () => baseSnapshot);
    render(<Harness load={load} />);
    expect(await screen.findByText("系统提示词")).toBeInTheDocument();
    expect(screen.getByText("会话历史 (短期记忆)")).toBeInTheDocument();
    expect(screen.getByText("工具列表")).toBeInTheDocument();
    // 标题旁的时间（短格式 HH:mm:ss）。时区会让具体值变化，因此只断言 ":" 数量。
    const dialog = screen.getByRole("dialog");
    const titleRow = within(dialog).getByText("上下文").parentElement;
    expect(titleRow?.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
    // 概览段（"Prompt token" / "跟随主 Agent" 等）应已下线，确保不再渲染
    expect(screen.queryByText("Prompt token")).not.toBeInTheDocument();
    expect(screen.queryByText("当前阶段")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("renders each prompt segment label with its source file badge (basename only)", async () => {
    render(<Harness load={async () => baseSnapshot} />);
    expect(await screen.findByText("Kairos 角色与节奏")).toBeInTheDocument();
    expect(screen.getByText("运行上下文")).toBeInTheDocument();
    expect(screen.getByText("用户规则")).toBeInTheDocument();
    // 文件徽章渲染 basename
    expect(screen.getByText("prompt.ts")).toBeInTheDocument();
    expect(screen.getByText("rule.md")).toBeInTheDocument();
    // 运行时段无来源 → 应有"运行时生成"占位
    expect(screen.getByText("运行时生成")).toBeInTheDocument();
  });

  it("copies the full prompt when 复制全文 is clicked", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    try {
      render(<Harness load={async () => baseSnapshot} />);
      await screen.findByText("系统提示词");
      await user.click(screen.getByRole("button", { name: "复制全文" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(baseSnapshot.systemPrompt));
      expect(screen.getByRole("button", { name: "已复制全文" })).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        value: originalClipboard,
        configurable: true,
      });
    }
  });

  it("copies the segment source path when its badge is clicked", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    try {
      render(<Harness load={async () => baseSnapshot} />);
      await screen.findByText("rule.md");
      // 找到 rule.md 徽章按钮（按钮 accessible name 取 button 内文本 basename）
      await user.click(screen.getByRole("button", { name: /rule\.md/ }));
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(
          "/Users/me/.actspace/kairos/config/rule.md",
        ),
      );
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        value: originalClipboard,
        configurable: true,
      });
    }
  });

  it("renders tools as chips showing only name (no description, schema, or source badge)", async () => {
    render(<Harness load={async () => baseSnapshot} />);
    await screen.findByText("工具列表");
    expect(screen.getByText("sleep")).toBeInTheDocument();
    expect(screen.getByText("read_file")).toBeInTheDocument();
    // v1.4 起 description 字段不再渲染——chip 只展示工具名。
    expect(screen.queryByText(/请求自治调度器睡眠/)).not.toBeInTheDocument();
    expect(screen.queryByText(/读取本地文件内容/)).not.toBeInTheDocument();
    // 仍然没有 schema 展开 / 来源角标
    expect(screen.queryByText(/"seconds"/)).not.toBeInTheDocument();
    expect(screen.queryByText("Kairos")).not.toBeInTheDocument();
    expect(screen.queryByText("共享")).not.toBeInTheDocument();
  });

  it("collapses long history messages to 3 lines by default and expands on click", async () => {
    const user = userEvent.setup();
    render(<Harness load={async () => baseSnapshot} />);
    await screen.findByText("会话历史 (短期记忆)");
    await user.click(screen.getByRole("button", { name: "会话历史 (短期记忆)" }));

    // 第 4 行（"第四行——本行默认应被折叠。"）默认不可见
    expect(screen.queryByText(/第四行——本行默认应被折叠/)).not.toBeInTheDocument();
    // 出现"展开本条"按钮
    const expand = screen.getByRole("button", { name: "展开本条" });
    await user.click(expand);
    expect(screen.getByText(/第四行——本行默认应被折叠/)).toBeInTheDocument();
  });

  it("renders error banner and retries on failure", async () => {
    const load = vi
      .fn<() => Promise<KairosContextSnapshot>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(baseSnapshot);
    const user = userEvent.setup();
    render(<Harness load={load} />);
    expect(await screen.findByText("无法加载上下文")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("系统提示词")).toBeInTheDocument();
  });
});
