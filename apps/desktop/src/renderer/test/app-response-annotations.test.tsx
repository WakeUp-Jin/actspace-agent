import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppSettings, BootstrapState, RunAgentInput, SessionRecord, WorkspaceListResult } from "@actspace/shared";
import { App } from "../App";
import { TooltipProvider } from "../components/ui/Tooltip";
import { recordProjectionFixture } from "./projection-fixture";
import { clearSelection, selectText, stubRangeRects } from "./fixtures/response-annotation-helpers";

const bootstrapState: BootstrapState = {
  appVersion: "0.1.0",
  dataRoot: "/tmp/actspace",
  sessionRoot: "/tmp/actspace/sessions",
  logRoot: "/tmp/actspace/logs",
  tmpRoot: "/tmp/actspace/tmp",
  workspaceRoot: "/tmp/workspace",
};

const defaultSettings: AppSettings = {
  version: 1,
  defaultModelId: null,
  providers: { deepseek: { hasApiKey: false }, kimi: { hasApiKey: false } },
  searchProviders: { zhipu: { hasApiKey: false }, tavily: { hasApiKey: false }, tinyfish: { hasApiKey: false }, exa: { hasApiKey: false } },
  agent: { systemPromptPath: "/tmp/actspace/prompts/main-agent.md", temperature: null, maxTokens: null, disabledTools: [], bashAlwaysAsk: false, exploreModelId: null },
  skills: { disabled: [] },
};

const TITLES: Record<string, string> = { "annotated-a": "批注甲", "annotated-b": "批注乙" };

/** 每个会话一问一答：journal seq 0 是用户消息，seq 1 是回复，回复 id 为 `v2-1`，可批注。 */
function createAnsweredSession(sessionId: string): SessionRecord {
  const now = "2026-09-28T00:00:00.000Z";
  return {
    meta: { schemaVersion: 2, id: sessionId, title: TITLES[sessionId]!, createdAt: now, updatedAt: now, agentRunCount: 1, agentForm: "chat", workspaceRoot: "/tmp/workspace" },
    events: [
      { id: "u", sessionId, agentRunId: "run-0", type: "user_message", timestamp: now, schemaVersion: 2, payload: { content: "问题" } },
      { id: "a", sessionId, agentRunId: "run-0", type: "assistant_message", timestamp: now, schemaVersion: 2, payload: { content: `${sessionId} 第一段内容\n\n第二段的正文` } },
    ],
    messageBlocks: [],
    contextSnapshot: null,
    contextState: null,
  };
}

function installBridge(runAgent: (input: RunAgentInput) => Promise<unknown>) {
  const records = new Map(Object.keys(TITLES).map((id) => [id, createAnsweredSession(id)] as const));
  window.actspace = {
    getBootstrapState: async () => bootstrapState,
    getSettings: async () => defaultSettings,
    getSessionPage: async ({ sessionId }: { sessionId: string }) => recordProjectionFixture(records.get(sessionId)!),
    getReviewSnapshot: async () => ({ ok: false, code: "not_available", message: "No changes" }),
    listVisualizations: async () => ({ items: [] }),
    setUiZoom: () => {}, setNativeTheme: () => {}, onShuttingDown: () => () => {},
    listWorkspaces: async (): Promise<WorkspaceListResult> => ({ version: 1, defaultWorkspaceId: "default", items: [{ id: "default", kind: "default", label: "workspace", path: "/tmp/workspace", order: 0, createdAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z" }] }),
    listSessions: async () => [...records.values()].map((record) => ({ id: record.meta.id, title: record.meta.title, updatedAt: record.meta.updatedAt, agentRunCount: 1, agentForm: "chat", workspaceRoot: "/tmp/workspace" })),
    getSession: async ({ sessionId }: { sessionId: string }) => records.get(sessionId),
    createSession: async () => records.get("annotated-a"),
    listPendingApprovals: async () => [],
    onAgentStream: () => () => {},
    runAgent: vi.fn(runAgent),
  } as unknown as typeof window.actspace;
  return window.actspace.runAgent as ReturnType<typeof vi.fn>;
}

function renderApp() {
  return render(<TooltipProvider delayDuration={0}><App /></TooltipProvider>);
}

async function selectSession(sessionId: string) {
  const row = await waitFor(() => {
    const element = document.querySelector<HTMLElement>(`[data-session-id="${sessionId}"]`);
    if (!element) throw new Error(`session row ${sessionId} not rendered`);
    return element;
  });
  await userEvent.click(within(row).getByRole("button", { name: TITLES[sessionId] }));
}

async function annotateReply(sessionId: string, needle = "第二段") {
  const reply = await waitFor(() => {
    const element = document.querySelector<HTMLElement>('[data-assistant-message-id="v2-1"]');
    if (!element?.textContent?.includes(sessionId)) throw new Error(`reply of ${sessionId} not rendered`);
    return element;
  });
  selectText(reply, needle);
  await userEvent.click(await screen.findByRole("button", { name: "添加到对话" }));
}

let restoreRects: () => void;
beforeEach(() => {
  window.localStorage.clear();
  restoreRects = stubRangeRects();
});
afterEach(() => {
  clearSelection();
  restoreRects();
  delete (window as { actspace?: unknown }).actspace;
  window.localStorage.clear();
});

it("sends an annotation-only message and clears the tray once the run is submitted", async () => {
  const runAgent = installBridge(() => new Promise(() => {}));
  renderApp();
  await selectSession("annotated-a");
  await annotateReply("annotated-a");
  const tray = screen.getByRole("region", { name: "回复引用" });
  expect(within(tray).getByText("1 条引用")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
  await waitFor(() => expect(runAgent).toHaveBeenCalledTimes(1));
  expect(runAgent.mock.calls[0]![0].responseAnnotations).toEqual([
    expect.objectContaining({ assistantMessageId: "v2-1", selectedText: "第二段", prefixContext: "annotated-a 第一段内容\n", suffixContext: "的正文" }),
  ]);
  expect(screen.queryByRole("region", { name: "回复引用" })).toBeNull();
});

it("restores the tray when main rejects the annotation", async () => {
  installBridge(async (input) => ({ status: "rejected", sessionId: input.sessionId, agentRunId: input.agentRunId, referenceIssue: { code: "annotation_source_missing", kind: "annotation", index: 0 } }));
  renderApp();
  await selectSession("annotated-a");
  await annotateReply("annotated-a");
  await userEvent.type(screen.getByRole("textbox", { name: "消息输入框" }), "解释一下");
  await userEvent.click(screen.getByRole("button", { name: "发送消息" }));

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("引用的回复已不在当前会话中"));
  expect(screen.getByRole("textbox", { name: "消息输入框" })).toHaveValue("解释一下");
  const tray = screen.getByRole("region", { name: "回复引用" });
  expect(within(tray).getByText("1 条引用")).toBeVisible();
  expect(within(tray).getByText("第二段")).toBeVisible();
});

it("restores the tray when sending throws", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  installBridge(async () => { throw new Error("ipc failed"); });
  renderApp();
  await selectSession("annotated-a");
  await annotateReply("annotated-a");
  await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
  expect(within(screen.getByRole("region", { name: "回复引用" })).getByText("1 条引用")).toBeVisible();
  errorLog.mockRestore();
});

it("keeps annotation drafts per session", async () => {
  installBridge(() => new Promise(() => {}));
  renderApp();
  await selectSession("annotated-a");
  await annotateReply("annotated-a");
  expect(within(screen.getByRole("region", { name: "回复引用" })).getByText("1 条引用")).toBeVisible();

  await selectSession("annotated-b");
  await waitFor(() => expect(document.querySelector('[data-assistant-message-id="v2-1"]')).toHaveTextContent("annotated-b"));
  expect(screen.queryByRole("region", { name: "回复引用" })).toBeNull();
  await annotateReply("annotated-b", "第一段");
  await annotateReply("annotated-b", "正文");
  expect(within(screen.getByRole("region", { name: "回复引用" })).getByText("2 条引用")).toBeVisible();

  await selectSession("annotated-a");
  await waitFor(() => expect(document.querySelector('[data-assistant-message-id="v2-1"]')).toHaveTextContent("annotated-a"));
  const tray = screen.getByRole("region", { name: "回复引用" });
  expect(within(tray).getByText("1 条引用")).toBeVisible();
});
