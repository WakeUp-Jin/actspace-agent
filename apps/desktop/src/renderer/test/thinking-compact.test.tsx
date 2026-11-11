import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock, SettingsV4Snapshot } from "@actspace/shared";
import { ThinkingBlock } from "../components/messages/ThinkingBlock";
import { formatThinkingElapsed, thinkingOpeningClause } from "../components/messages/thinking-title";
import { ConversationDisplaySection } from "../components/settings/sections/ConversationDisplaySection";
import type { SectionProps } from "../components/settings/sections/shared";
import { setupBridge } from "./helpers/bridge";
import { TestConversationView } from "./helpers/workbench";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";

/** 简化思考过程（中间消息区规范 › 简化思考过程）。 */

type Thinking = Extract<MessageBlock, { kind: "thinking" }>;

const START = Date.UTC(2026, 10, 11, 12, 0, 0);
const FIRST = "用户希望思考过程不要打扰阅读";

function thinking(overrides: Partial<Thinking> = {}): Thinking {
  return { kind: "thinking", id: "t-1", title: "Thinking...", content: "用户希望", createdAt: "2026-11-11T12:00:00.000Z", collapsedByDefault: false, status: "running", startedAtMs: START, ...overrides };
}

async function withSetting(simplifyThinking: boolean) {
  setupBridge({ "settings.getV4": vi.fn(async () => ({ version: 4, revision: "r", settings: { general: { simplifyThinking } } })) });
}

/** 读取设置是异步的；渲染后冲一下微任务，让共享订阅拿到值。 */
async function renderBlock(message: Thinking, props: { replyCompleted?: boolean } = {}) {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<ThinkingBlock message={message} {...props} />); });
  await act(async () => {});
  return view;
}

/** 思考块里只有标题这一个按钮。 */
const toggle = () => screen.getByRole("button");

afterEach(() => { vi.useRealTimers(); });

describe("simplified thinking (setting on)", () => {
  it("stays one line while running and counts seconds", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(START);
    await withSetting(true);
    await renderBlock(thinking());

    expect(document.querySelector(".thinking-content")).toBeNull();
    expect(toggle()).toHaveAccessibleName("Thinking 1s");
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(toggle()).toHaveAccessibleName("Thinking 5s");
  });

  it("shows the opening clause once it is complete and never changes it", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(START + 3000);
    await withSetting(true);
    const view = await renderBlock(thinking());
    expect(toggle()).toHaveAccessibleName("Thinking 3s");

    view.rerender(<ThinkingBlock message={thinking({ content: `${FIRST}。现在的问题是正文一边流式输出` })} />);
    expect(toggle()).toHaveAccessibleName(`Thinking 3s · ${FIRST}`);

    view.rerender(<ThinkingBlock message={thinking({ content: `${FIRST}。现在的问题是正文一边流式输出。\n\n先看 ThinkingBlock，再决定。` })} />);
    expect(toggle()).toHaveAccessibleName(`Thinking 3s · ${FIRST}`);
  });

  it("opens on click, keeps the choice across rerenders, and collapses when the reply completes", async () => {
    await withSetting(true);
    const message = thinking({ content: `${FIRST}。细节` });
    const view = await renderBlock(message);

    fireEvent.click(toggle());
    expect(screen.getByText(`${FIRST}。细节`)).toBeInTheDocument();
    view.rerender(<ThinkingBlock message={{ ...message, content: `${FIRST}。细节更多` }} />);
    expect(screen.getByText(`${FIRST}。细节更多`)).toBeInTheDocument();
    view.rerender(<ThinkingBlock message={{ ...message, status: "completed" }} replyCompleted />);
    expect(document.querySelector(".thinking-content")).toBeNull();
  });

  it("titles a finished thought by its duration, or plainly when unknown", async () => {
    await withSetting(true);
    const view = await renderBlock(thinking({ status: "completed", durationMs: 9000, content: "done" }));
    expect(toggle()).toHaveAccessibleName("Thought for 9s");
    expect(document.querySelector(".tool-log-shimmer")).toBeNull();

    view.rerender(<ThinkingBlock message={{ kind: "thinking", id: "t-2", title: "Thinking", content: "done", createdAt: "2026-11-11T12:00:00.000Z", collapsedByDefault: true }} />);
    expect(toggle()).toHaveAccessibleName("Thinking");
  });
});

describe("simplified thinking (setting off)", () => {
  it("keeps the original behavior: running thinking is expanded and titled by the message", async () => {
    await withSetting(false);
    await renderBlock(thinking({ content: `${FIRST}。细节` }));
    expect(screen.getByText(`${FIRST}。细节`)).toBeInTheDocument();
    expect(toggle()).toHaveAccessibleName("Thinking...");
  });
});

describe("thinkingOpeningClause", () => {
  it.each([
    ["用户希望思考过程不要打扰阅读。后面", "用户希望思考过程不要打扰阅读"],
    ["先看代码，再改", "先看代码"],
    ["Check file.ts first. Then edit", "Check file.ts first"],
    ["## 理解需求\n正文", "理解需求"],
    ["**Plan:** do it", "Plan"],
    ["  \n用户问题：怎么改", "用户问题"],
  ])("takes the first clause of %j", (content, expected) => {
    expect(thinkingOpeningClause(content)).toBe(expected);
  });

  it("waits while the first clause is unfinished", () => {
    expect(thinkingOpeningClause("用户希望")).toBeNull();
    expect(thinkingOpeningClause("Check file.")).toBeNull();
    expect(thinkingOpeningClause("   ")).toBeNull();
  });

  it("truncates past the width limit", () => {
    expect(thinkingOpeningClause("这是一个非常非常长的开头句子并且一直没有出现任何标点符号所以需要截断")).toBe("这是一个非常非常长的开头句子并且一直…");
    expect(thinkingOpeningClause(`${"a".repeat(40)}`)).toBe(`${"a".repeat(36)}…`);
  });
});

describe("formatThinkingElapsed", () => {
  it.each([[0, "1s"], [400, "1s"], [6000, "6s"], [65_000, "1m 5s"], [120_000, "2m"]])("formats %i ms as %s", (ms, text) => {
    expect(formatThinkingElapsed(ms)).toBe(text);
  });
});

describe("simplified thinking in the conversation", () => {
  it("keeps a running thought to one line while the turn streams, and leaves tools untouched", async () => {
    await withSetting(true);
    const turn: MessageBlock[] = [
      { kind: "user", id: "u-1", content: "把思考过程做得安静一点", createdAt: "2026-11-11T12:00:00.000Z" },
      { kind: "read", id: "r-1", filePath: "ThinkingBlock.tsx", displayText: "Read ThinkingBlock.tsx", status: "completed", createdAt: "2026-11-11T12:00:01.000Z" },
      thinking({ content: `${FIRST}。很长很长的推理正文` }),
    ];
    await act(async () => {
      render(<RightPanelProvider><TestConversationView messages={turn} contextSnapshot={null} sessionId="session-1" isStreaming /></RightPanelProvider>);
    });
    await act(async () => {});
    expect(screen.queryByText(`${FIRST}。很长很长的推理正文`)).toBeNull();
    expect(screen.getByRole("button", { name: new RegExp(`^Thinking (\\d+m )?\\d+s · ${FIRST}$`) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read ThinkingBlock.tsx" })).toBeInTheDocument();
  });
});

describe("conversation display settings", () => {
  it("writes general.simplifyThinking from its own toggle", async () => {
    const onUpdateNamespace = vi.fn(async () => null);
    const settingsV4 = { version: 4, revision: "r", settings: { general: { simplifyThinking: true } } } as unknown as SettingsV4Snapshot;
    render(<ConversationDisplaySection {...({ settingsV4, onUpdateNamespace } as unknown as SectionProps)} />);

    const row = screen.getByRole("switch", { name: "简化思考过程" });
    expect(row).toBeChecked();
    expect(screen.getByText("思考进行时只显示状态和用时，不展开正文。点击标题仍可查看全文。")).toBeInTheDocument();
    await act(async () => { fireEvent.click(row); });
    expect(onUpdateNamespace).toHaveBeenCalledWith({ namespace: "general", patch: { simplifyThinking: false } });
  });
});
