import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { renderMessage } from "../components/ConversationView";

const original = window.actspace;
afterEach(() => { window.actspace = original; });
const deferredToolDetail = { sessionId: "parent", callId: "call" };

it.each(["agent", "explore"] as const)("renders deferred %s as a directly usable child-session card", (agentKind) => {
  const load = vi.fn();
  const open = vi.fn();
  window.actspace = { ...original, getSessionToolDetail: load };
  const message: MessageBlock = {
    kind: "agent", id: "child", createdAt: "now", description: "检查工作区",
    subagentType: "explore", agentKind, status: "completed", summary: "检查完成", displayText: "检查工作区",
    transcriptRef: { kind: "subagent_transcript", sessionId: "parent", agentRunId: "run", runId: "child-session" },
    deferredToolDetail,
  };
  render(<>{renderMessage(message, undefined, open)}</>);
  expect(screen.getByText("检查完成")).toBeVisible();
  expect(screen.getByText("已完成")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Open SubAgent transcript/ }));
  expect(open).toHaveBeenCalledWith(message);
  expect(load).not.toHaveBeenCalled();
  expect(screen.queryByText("展开完整工具结果")).not.toBeInTheDocument();
});

it("keeps the tool identity visible while loading details on demand and retrying errors", async () => {
  const message: MessageBlock = {
    kind: "glob", id: "glob", renderKey: "page:glob", createdAt: "now", pattern: "**/*.css", scope: ".", resultCount: 125,
    displayText: "Glob **/*.css in .", deferredToolDetail,
  };
  const full: MessageBlock = { ...message, renderKey: undefined, resultPreview: ["src/styles/main.css", "src/styles/theme.css"], deferredToolDetail: undefined };
  const load = vi.fn().mockRejectedValueOnce(new Error("读取失败")).mockResolvedValueOnce([full]);
  window.actspace = { ...original, getSessionToolDetail: load };
  render(<>{renderMessage(message)}</>);
  expect(screen.getByRole("button", { name: "Glob **/*.css in ." })).toBeVisible();
  expect(screen.queryByText("展开完整工具结果")).not.toBeInTheDocument();
  expect(load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Glob **/*.css in ." }));
  expect(await screen.findByRole("alert")).toHaveTextContent("读取失败");
  expect(screen.getByRole("button", { name: "Glob **/*.css in ." })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Glob **/*.css in ." }));
  fireEvent.click(screen.getByRole("button", { name: "Glob **/*.css in ." }));
  await waitFor(() => expect(screen.getByText("src/styles/theme.css")).toBeVisible());
  expect(load).toHaveBeenLastCalledWith(deferredToolDetail);
  expect(screen.queryByText("展开完整工具结果")).not.toBeInTheDocument();
});

it("expands an existing preview with no explicit status without fetching", () => {
  const load = vi.fn();
  window.actspace = { ...original, getSessionToolDetail: load };
  render(<>{renderMessage({ kind: "glob", id: "small", createdAt: "now", pattern: "*.css", scope: ".", resultCount: 1, displayText: "Glob *.css in .", resultPreview: ["main.css"] })}</>);
  fireEvent.click(screen.getByRole("button", { name: "Glob *.css in ." }));
  expect(screen.getByText("main.css")).toBeVisible();
  expect(load).not.toHaveBeenCalled();
});

it("loads web tool content through its existing toggle and preserves expansion", async () => {
  const message: MessageBlock = { kind: "web_search", id: "web", createdAt: "now", mode: "query", query: "docs", displayText: "Search docs", deferredToolDetail };
  const load = vi.fn().mockResolvedValue([{ ...message, deferredToolDetail: undefined, contentPreview: "Loaded search result" }]);
  window.actspace = { ...original, getSessionToolDetail: load };
  render(<>{renderMessage(message)}</>);
  fireEvent.click(screen.getByRole("button", { name: "Search docs" }));
  expect(await screen.findByText("Loaded search result")).toBeVisible();
  expect(screen.getByRole("button", { name: "Search docs" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "Search docs" }));
  fireEvent.click(screen.getByRole("button", { name: "Search docs" }));
  expect(load).toHaveBeenCalledTimes(1);
});

it("keeps Read file navigation separate from loading its result", async () => {
  const message: MessageBlock = { kind: "read", id: "read", createdAt: "now", filePath: "README.md", displayText: "Read README.md", deferredToolDetail };
  const load = vi.fn().mockResolvedValue([{ ...message, deferredToolDetail: undefined, resultPreview: ["# Read result"] }]);
  const openFile = vi.fn();
  window.actspace = { ...original, getSessionToolDetail: load };
  render(<>{renderMessage(message, undefined, undefined, false, openFile)}</>);
  fireEvent.click(screen.getByRole("button", { name: "Read README.md" }));
  expect(openFile).toHaveBeenCalledTimes(1);
  expect(load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show result for Read README.md" }));
  expect(await screen.findByText("# Read result")).toBeVisible();
});
