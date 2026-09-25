import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppSettings, BootstrapState, SessionRecord, WorkspaceListResult, RunAgentInput } from "@actspace/shared";
import { App } from "../App";
import { TooltipProvider } from "../components/ui/Tooltip";
import { recordProjectionFixture } from "./projection-fixture";
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
  skills: { disabled: [] },
};

const settingsApiStub = {
  getSessionPage: async ({ sessionId }: { sessionId: string }) => recordProjectionFixture(await window.actspace.getSession({ sessionId })),
  getSettings: async () => defaultSettings,
  getReviewSnapshot: async () => ({ ok: false, code: "not_available", message: "No changes" }),
  listVisualizations: async () => ({ items: [] }),
  setUiZoom: () => {}, setNativeTheme: () => {}, onShuttingDown: () => () => {},
};
function createWorkspaceRegistryFixture(createdAt: string): WorkspaceListResult {
  return { version: 1, defaultWorkspaceId: "default", items: [{ id: "default", kind: "default", label: "workspace", path: "/tmp/workspace", order: 0, createdAt, updatedAt: createdAt }] };
}

function createEmptySessionRecord(sessionId: string): SessionRecord {
  const now = new Date().toISOString();
  return {
    meta: {
      schemaVersion: 2,
      id: sessionId,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      agentRunCount: 0,
    },
    events: [],
    messageBlocks: [],
    contextSnapshot: null,
    contextState: null,
  };
}

function renderApp() {
  return render(
    <TooltipProvider delayDuration={0}>
      <App />
    </TooltipProvider>,
  );
}


afterEach(() => { delete (window as { actspace?: unknown }).actspace; window.localStorage.clear(); });
it("restores a rejected Chat draft without a phantom message, failed turn, or workspace controls", async () => {
  window.localStorage.clear();
  const record = createEmptySessionRecord("chat-rejection");
  record.meta.agentForm = "chat";
  record.meta.workspaceRoot = "/tmp/workspace";
  const attachment = { id: "bad", kind: "file" as const, name: "bad.txt", path: "/fixture/bad.txt" };
  const runAgent = vi.fn(async (input: RunAgentInput) => ({ status: "rejected" as const, sessionId: input.sessionId, agentRunId: input.agentRunId, error: { code: "invalid_utf8" as const, fileName: "bad.txt", attachmentId: "bad" } }));
  window.actspace = {
    ...settingsApiStub,
    getBootstrapState: async () => bootstrapState,
    listWorkspaces: async () => createWorkspaceRegistryFixture(record.meta.createdAt),
    listSessions: async () => [{ id: record.meta.id, title: record.meta.title, updatedAt: record.meta.updatedAt, agentRunCount: 0, agentForm: "chat", workspaceRoot: "/tmp/workspace" }],
    getSession: async () => record, createSession: async () => record,
    listPendingApprovals: async () => [], onAgentStream: () => () => {},
    selectFiles: async () => ({ canceled: false, attachments: [attachment] }),
    runAgent,
  } as unknown as typeof window.actspace;
  const user = userEvent.setup(); renderApp();
  await screen.findByText("Chat");
  expect(screen.queryByLabelText("初始工作区与运行位置选择")).toBeNull();
  expect(screen.queryByLabelText("查看工作区环境")).toBeNull();
  await user.click(screen.getByLabelText("添加 Agent、上下文或工具"));
  await user.click(screen.getByText("图片与文件"));
  await screen.findByLabelText("已附加的文件 bad.txt");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "保留正文" } });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("不是 UTF-8"));
  expect(screen.getByRole("textbox")).toHaveValue("保留正文");
  expect(screen.getByLabelText("已附加的文件 bad.txt")).toBeVisible();
  expect(screen.queryByText("保留正文", { selector: "p" })).toBeNull();
  expect(screen.queryByRole("button", { name: /停止/ })).toBeNull();
  expect(runAgent).toHaveBeenCalledTimes(1);
  await user.click(screen.getByLabelText("移除 bad.txt"));
  expect(screen.queryByRole("alert")).toBeNull();
});
