import type { FixtureRunInput, FixtureCompactionInput, FixtureCompactionResult } from "./task-host-fixture";
import { taskHostFixture } from "./task-host-fixture";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppSettings, BootstrapState,  SessionRecord, WorkspaceListResult } from "@actspace/shared";
import { App } from "../App";
import { TooltipProvider } from "../components/ui/Tooltip";
import { recordProjectionFixture } from "./projection-fixture";
import { clearSelection, selectText, stubRangeRects } from "./fixtures/response-annotation-helpers";
import { setupBridge } from "./helpers/bridge";
import { projectRecord } from "./helpers/session-records";

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

function installBridge(runAgent: (input: FixtureRunInput) => Promise<unknown>, prepare = false) {
  const records = new Map(Object.keys(TITLES).map((id) => [id, createAnsweredSession(id)] as const));
  const execute = vi.fn(runAgent);
  setupBridge(taskHostFixture({
    "app.getBootstrapState": async () => bootstrapState,
    "settings.get": async () => defaultSettings,
    "sessions.getPage": async ({ sessionId }: { sessionId: string }) => recordProjectionFixture(records.get(sessionId)!),
    "review.getSnapshot": async () => ({ ok: false, code: "not_available", message: "No changes" }),
    "visualize.list": async () => ({ items: [] }),
    "appearance.setUiZoom": () => {}, "appearance.setNativeTheme": () => {}, "events.shuttingDown": () => () => {},
    "workspaces.list": async (): Promise<WorkspaceListResult> => ({ version: 1, defaultWorkspaceId: "default", items: [{ id: "default", kind: "default", label: "workspace", path: "/tmp/workspace", order: 0, createdAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z" }] }),
    "sessions.list": async () => [...records.values()].map((record) => ({ id: record.meta.id, title: record.meta.title, updatedAt: record.meta.updatedAt, agentRunCount: 1, agentForm: "chat", workspaceRoot: "/tmp/workspace" })),
    getRecord: async ({ sessionId }: { sessionId: string }) => records.get(sessionId),
    "sessions.create": projectRecord(async () => records.get("annotated-a")),
    "approvals.listPending": async () => [],
    "events.agentStream": () => () => {},
    execute: prepare ? undefined : execute as (input: FixtureRunInput) => Promise<import("@actspace/shared").AgentRunResult>,
    prepare: prepare ? runAgent : undefined,
  }));
  return execute;
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
  // 切会话后 Composer 会在下一帧抢焦点；先等它落定，再像真实拖选那样让输入框失焦
  // （jsdom 里输入框拿着焦点会把脚本加的选区收起）。
  await act(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))));
  (document.activeElement as HTMLElement | null)?.blur();
  selectText(reply, needle);
  await userEvent.click(await screen.findByRole("menuitem", { name: "添加到对话" }));
  // 添加后评论框打开：不写评论直接 Enter 保存。jsdom 里消息区没有尺寸，评论框按“原文滚出视口”处理成
  // visibility:hidden，可访问名称为空，只能按 aria-label 选择器找。
  const input = await waitFor(() => {
    const element = document.querySelector<HTMLTextAreaElement>('textarea[aria-label$="条批注的评论"]');
    if (!element) throw new Error("comment popover not open");
    return element;
  });
  expect(input).toHaveFocus();
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(document.querySelector('textarea[aria-label$="条批注的评论"]')).toBeNull());
  // 保存后焦点回到 Composer。
  await waitFor(() => expect(screen.getByRole("textbox", { name: "消息输入框" })).toHaveFocus());
}

/** Composer 里的草稿批注胶囊（已发送的那份在用户消息上方，不算）。 */
function annotationPill(count: number) {
  const row = document.querySelector<HTMLElement>(".composer-annotations");
  return row ? within(row).queryByRole("button", { name: `${count} 条批注` }) : null;
}

let restoreRects: () => void;
beforeEach(() => {
  window.localStorage.clear();
  restoreRects = stubRangeRects();
});
afterEach(() => {
  clearSelection();
  restoreRects();
  window.localStorage.clear();
});

it("sends an annotation-only message and clears the pill once the run is submitted", async () => {
  const runAgent = installBridge(() => new Promise(() => {}));
  renderApp();
  await selectSession("annotated-a");
  await annotateReply("annotated-a");
  expect(annotationPill(1)).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
  await waitFor(() => expect(runAgent).toHaveBeenCalledTimes(1));
  expect(runAgent.mock.calls[0]![0].responseAnnotations).toEqual([
    expect.objectContaining({ assistantMessageId: "v2-1", selectedText: "第二段", prefixContext: "annotated-a 第一段内容\n", suffixContext: "的正文" }),
  ]);
  expect(document.querySelector(".composer-annotations")).toBeNull();
  // 发出去的批注改由用户消息上方的只读胶囊展示。
  expect(screen.getByRole("button", { name: "1 条批注" })).toBeVisible();
});

it("restores the drafts when main rejects the annotation", async () => {
  installBridge(async (input) => ({ status: "submission-failed", acknowledgement: "rejected", message: "Annotation unavailable", referenceIssue: { code: "annotation_source_missing", kind: "annotation", index: 0 } }), true);
  renderApp();
  await selectSession("annotated-a");
  await annotateReply("annotated-a");
  await userEvent.type(screen.getByRole("textbox", { name: "消息输入框" }), "解释一下");
  await userEvent.click(screen.getByRole("button", { name: "发送消息" }));

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("引用的回复已不在当前会话中"));
  expect(screen.getByRole("textbox", { name: "消息输入框" })).toHaveValue("解释一下");
  await userEvent.click(annotationPill(1)!);
  const card = await screen.findByRole("dialog", { name: "草稿批注" });
  expect(within(card).getByText("第二段")).toBeVisible();
});

it("restores the drafts when sending throws", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  installBridge(async () => { throw new Error("ipc failed"); }, true);
  renderApp();
  await selectSession("annotated-a");
  await annotateReply("annotated-a");
  await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
  expect(annotationPill(1)).toBeVisible();
  errorLog.mockRestore();
});

it("keeps annotation drafts per session", async () => {
  installBridge(() => new Promise(() => {}));
  renderApp();
  await selectSession("annotated-a");
  await annotateReply("annotated-a");
  expect(annotationPill(1)).toBeVisible();

  await selectSession("annotated-b");
  await waitFor(() => expect(document.querySelector('[data-assistant-message-id="v2-1"]')).toHaveTextContent("annotated-b"));
  expect(annotationPill(1)).toBeNull();
  await annotateReply("annotated-b", "第一段");
  await annotateReply("annotated-b", "正文");
  expect(annotationPill(2)).toBeVisible();

  await selectSession("annotated-a");
  await waitFor(() => expect(document.querySelector('[data-assistant-message-id="v2-1"]')).toHaveTextContent("annotated-a"));
  expect(annotationPill(1)).toBeVisible();
});
