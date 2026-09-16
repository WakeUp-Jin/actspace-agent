import React from "react";
import { createRoot } from "react-dom/client";
import type { AgentRunResult, AppSettings, BootstrapState, CompactContextInput, ReviewGetSnapshotResult, RunAgentInput, RuntimeStreamEvent, SessionEvent, SessionRecord } from "@actspace/shared";
import { createMessageBlocks } from "@actspace/shared";
import { App } from "../src/renderer/App";
import { TooltipProvider } from "../src/renderer/components/ui/Tooltip";
import "../src/renderer/styles/index.css";

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

/** window.actspace 的设置相关方法默认 stub，供各用例 spread 进 mock。 */
const settingsApiStub = {
  getSettings: async () => defaultSettings,
  readAgentSystemPrompt: async () => ({ path: defaultSettings.agent.systemPromptPath, content: "" }),
  writeAgentSystemPrompt: async (input: { content: string }) => ({
    path: defaultSettings.agent.systemPromptPath,
    content: input.content,
  }),
  updateSettings: async () => defaultSettings,
  setProviderKey: async () => ({ ok: true }),
  clearProviderKey: async () => ({ ok: true }),
  testProviderConnection: async () => ({ ok: true, message: "连接成功" }),
  visualizeReply: async () => ({ html: "<!doctype html><html></html>", sourceHash: "stub", cached: false }),
  listVisualizations: async () => ({ items: [] }),
  describeContext: async () => null,
  getReviewSnapshot: async () => createReviewChanges(0, 0),
  initGitRepository: async () => ({
    ok: true,
    alreadyRepository: true,
    workspaceRoot: "/tmp/workspace",
  }),
  compactContext: async (input: CompactContextInput) => ({
    sessionId: input.sessionId,
    agentRunId: input.agentRunId,
    status: "skipped" as const,
    events: [],
    contextSnapshot: {
      totalTokens: 0,
      maxTokens: 200_000,
      percentUsed: 0,
      buckets: [],
    },
    contextState: null,
  }),
  listWorkspaceDir: async () => ({ root: "/tmp/workspace", relativePath: "", entries: [] }),
  readWorkspaceFile: async () => ({ relativePath: "", renderKind: "text" as const, size: 0, mtimeMs: 0, content: "" }),
  archiveSession: async () => ({ ok: true }),
  archiveSessions: async (input: { sessionIds: string[] }) => ({
    ok: true,
    archivedSessionIds: input.sessionIds,
    failedSessionIds: [],
  }),
  setUiZoom: () => {},
  setNativeTheme: () => {},
  onShuttingDown: () => () => {},
};

function createReviewChanges(additions: number, deletions: number): ReviewGetSnapshotResult {
  const hasChanges = additions + deletions > 0;
  return {
    ok: true,
    snapshot: {
      id: `review-${additions}-${deletions}`,
      generation: 1,
      workspaceId: "ws_source",
      workspaceRoot: "/tmp/workspace",
      repoRoot: "/tmp/workspace",
      selection: { kind: "uncommitted" },
      baseline: { kind: "git-ref", label: "HEAD" },
      target: { label: "Working tree" },
      status: hasChanges ? "ready" : "empty",
      files: hasChanges ? [
        {
          id: "src/example.ts",
          path: "src/example.ts",
          status: "modified",
          additions,
          deletions,
          binary: false,
          renderKind: "text",
          source: "workingTree",
          diffLoadStatus: "idle",
          viewed: false,
          fingerprint: "example-fingerprint",
        },
      ] : [],
      totals: { files: hasChanges ? 1 : 0, additions, deletions, changedLines: additions + deletions, estimatedChangedBytes: 0 },
      capabilities: {
        canStageFile: hasChanges,
        canStageHunk: hasChanges,
        canUnstageFile: false,
        canUnstageHunk: false,
        canRevertFile: hasChanges,
        canRevertHunk: hasChanges,
        canLoadFullFile: true,
        canOpenFile: true,
        canCommit: hasChanges,
        canPush: false,
        canCreatePullRequest: false,
        disabledReasons: {},
      },
      loadPolicy: { mode: "all-files" },
      queryOptions: { ignoreWhitespaceChanges: false },
      generatedAt: new Date().toISOString(),
    },
  };
}

// Explicit UI fixture: no provider, filesystem tools, or production session writes.
const records = new Map(["a", "b"].map(id => [id, {
  meta: { schemaVersion: 2, id, title: `切换验收 ${id.toUpperCase()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), agentRunCount: 0 },
  events: [], messageBlocks: [], contextSnapshot: null,
}] as [string, SessionRecord]));
let emit: (event: RuntimeStreamEvent) => void = () => {};
const runs = new Map<string, { input: RunAgentInput; resolve: (result: AgentRunResult) => void; count: number }>();
window.actspace = {
  ...settingsApiStub,
  getBootstrapState: async () => bootstrapState,
  listSessions: async () => [...records.values()].map(r => ({ id: r.meta.id, title: r.meta.title, updatedAt: r.meta.updatedAt, agentRunCount: r.meta.agentRunCount })),
  getSession: async ({ sessionId }: { sessionId: string }) => records.get(sessionId),
  listPendingApprovals: async () => [],
  onAgentStream: (callback: typeof emit) => { emit = callback; return () => {}; },
  abortAgentRun: async ({ sessionId }: { sessionId: string }) => { finish(sessionId, true); return true; },
  runAgent: (input: RunAgentInput) => new Promise<AgentRunResult>(resolve => {
    runs.set(input.sessionId, { input, resolve, count: 0 });
    emit({ type: "agent_run_started", sessionId: input.sessionId, agentRunId: input.agentRunId });
    advance(input.sessionId);
  }),
} as unknown as Window["actspace"];
function advance(sessionId: string) {
  const run = runs.get(sessionId);
  if (!run) return;
  run.count++;
  const identity = { sessionId, agentRunId: run.input.agentRunId };
  emit({ ...identity, type: "assistant_text_delta", delta: `后台进度 ${run.count}。` });
  emit({ ...identity, type: "tool_started", turnId: "fixture-turn", llmCallId: "fixture-call", toolCallId: `read-${run.count}`, toolName: "read_file", argsPreview: "{}", preview: { kind: "read", filePath: `file-${run.count}.md`, displayText: `Read file-${run.count}.md` } });
  emit({ ...identity, type: "tool_finished", turnId: "fixture-turn", llmCallId: "fixture-call", toolCallId: `read-${run.count}`, toolName: "read_file", isError: false, status: "completed", preview: { kind: "read", filePath: `file-${run.count}.md`, displayText: `Read file-${run.count}.md` } });
}
function finish(sessionId: string, aborted = false) {
  const run = runs.get(sessionId);
  if (!run) return;
  const record = records.get(sessionId)!;
  const identity = { sessionId, agentRunId: run.input.agentRunId };
  const base = { ...identity, timestamp: record.meta.createdAt, schemaVersion: 2 as const };
  const events: SessionEvent[] = [
    { ...base, id: "v2-1", type: "user_message", payload: { content: run.input.userInput } },
    { ...base, id: "v2-2", type: "assistant_message", payload: { content: `${sessionId.toUpperCase()} ${aborted ? "已停止" : "后台任务已完成"}，共 ${run.count} 次进度更新。` } },
  ];
  records.set(sessionId, { ...record, events, messageBlocks: createMessageBlocks(events) });
  emit({ ...identity, type: aborted ? "agent_run_aborted" : "agent_run_finished" } as RuntimeStreamEvent);
  run.resolve({ ...identity, status: aborted ? "aborted" : "completed", events, contextSnapshot: null });
  runs.delete(sessionId);
}
createRoot(document.getElementById("root")!).render(<TooltipProvider delayDuration={0}>
  <div style={{ height: 36, display: "flex", gap: 16 }}>
    <span>显式测试样例 · 不调用模型</span>
    <button onClick={() => advance("a")}>推进 A</button><button onClick={() => finish("a")}>完成 A</button>
    <button onClick={() => advance("b")}>推进 B</button><button onClick={() => finish("b")}>完成 B</button>
  </div>
  <div style={{ height: "calc(100vh - 36px)" }}><App /></div>
</TooltipProvider>);
