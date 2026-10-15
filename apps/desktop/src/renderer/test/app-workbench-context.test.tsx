import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppSettings, SessionListItem, SessionRecord } from "@actspace/shared";
import { App } from "../App";
import { useComposerContext } from "../components/composer/composer-context";
import { TooltipProvider } from "../components/ui/Tooltip";
import { useActiveSession } from "../session/active-session-context";
import { useSessionActions } from "../session/session-actions-context";
import { setupBridge } from "./helpers/bridge";
import { recordProjectionFixture } from "./projection-fixture";

// 14 T18：WorkbenchLayout / ConversationView / Sidebar 从 Context 读取当前会话、输入框和会话操作。
const NOW = "2026-10-06T00:00:00.000Z";

const settings: AppSettings = {
  version: 1,
  defaultModelId: null,
  providers: {},
  searchProviders: {},
  agent: { systemPromptPath: "/tmp/actspace/prompts/main-agent.md", temperature: null, maxTokens: null, disabledTools: [], bashAlwaysAsk: false, exploreModelId: null },
  skills: { disabled: [] },
  shortcuts: { quickOpen: { enabled: true, accelerator: "Alt+Space", target: { kind: "session", sessionId: "s-2" } } },
} as AppSettings;

function listItem(id: string, title: string): SessionListItem {
  return { id, title, updatedAt: NOW, agentRunCount: 1, workspaceRoot: "/tmp/workspace" };
}

function record(id: string, title: string): SessionRecord {
  return {
    meta: { schemaVersion: 2, id, title, createdAt: NOW, updatedAt: NOW, agentRunCount: 1, workspaceRoot: "/tmp/workspace" },
    events: [{ id: `v2-${id}`, schemaVersion: 2, sessionId: id, agentRunId: `run-${id}`, type: "user_message", timestamp: NOW, payload: { content: `hello ${id}` } }],
  };
}

describe("workbench contexts", () => {
  it("requires each provider instead of silently rendering without one", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(useActiveSession)).toThrow(/ActiveSessionContext/);
    expect(() => renderHook(useComposerContext)).toThrow(/ComposerContext/);
    expect(() => renderHook(useSessionActions)).toThrow(/SessionActionsContext/);
    error.mockRestore();
  });

  it("opens the quick-open session and focuses its composer through the active-session context", { timeout: 15_000 }, async () => {
    const items = [listItem("s-1", "First"), listItem("s-2", "Second")];
    let pending: { requestedAt: string } | null = { requestedAt: NOW };
    setupBridge({
      "settings.get": async () => settings,
      "quickOpen.consume": async () => { const request = pending; pending = null; return request; },
      "sessions.list": async () => items,
      "sessions.listPage": async () => ({ items, groups: [{ workspaceRoot: "/tmp/workspace", pinned: false, hasMore: false }], indexing: false, failed: 0 }),
      "sessions.getPage": async ({ sessionId }: { sessionId: string }) => recordProjectionFixture(record(sessionId, items.find((item) => item.id === sessionId)!.title)),
      "workspaces.list": async () => ({ version: 1, items: [{ id: "default", kind: "folder", label: "workspace", path: "/tmp/workspace", order: 0, createdAt: NOW, updatedAt: NOW }] }),
      "approvals.listPending": async () => [],
      "tasks.command": async (command: { sessionId: string }) => ({ snapshot: { sessionId: command.sessionId, revision: 1, paused: false, tasks: [], queue: [], runs: [] } }),
      "visualize.list": async () => ({ items: [] }),
    });
    render(<TooltipProvider><App /></TooltipProvider>);
    await waitFor(() => expect(document.querySelector('.session-row[data-session-id="s-2"]')?.className).toMatch(/active|selected/));
    await screen.findByText("hello s-2");
    await act(async () => {});
    await waitFor(() => expect(screen.getByRole("textbox", { name: /消息|输入/ })).toHaveFocus());
  });
});
