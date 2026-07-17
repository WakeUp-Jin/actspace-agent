import { describe, expect, it, vi } from "vitest";
import type { ToolApprovalRequest } from "@actspace/agent-core";
import { PendingApprovalRegistry } from "../approval-registry";

function makeRequest(partial: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
  return {
    id: "approval-1",
    toolCallId: "tool-call-1",
    toolName: "bash",
    args: { command: "pnpm test" },
    summary: "Run tests",
    reason: "Command requires approval",
    riskLevel: "medium",
    createdAt: Date.now(),
    ...partial,
  };
}

describe("PendingApprovalRegistry", () => {
  it("notifies when an approval decision resolves", async () => {
    const onApprovalResolved = vi.fn();
    const registry = new PendingApprovalRegistry({ onApprovalResolved });
    registry.setCurrentTurn("session-1", "turn-1");
    const request = makeRequest();

    const promise = registry.waitForDecision(request);
    const result = registry.decide(request.id, "approve_once");
    const decision = await promise;

    expect(result).toEqual({ ok: true });
    expect(decision).toMatchObject({ requestId: request.id, decision: "approve_once" });
    expect(onApprovalResolved).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ requestId: request.id, decision: "approve_once" }),
      "session-1",
      "turn-1",
    );
  });

  it("rejects allow_similar for delete_file approvals", async () => {
    const onApprovalResolved = vi.fn();
    const registry = new PendingApprovalRegistry({ onApprovalResolved });
    registry.setCurrentTurn("session-delete", "turn-delete");
    const request = makeRequest({
      id: "approval-delete-1",
      toolCallId: "tool-delete-1",
      toolName: "delete_file",
      args: { path: "/workspace/notes.md" },
      summary: "Delete notes.md",
      reason: "delete_file is a destructive file operation and requires approval.",
      riskLevel: "high",
    });

    const promise = registry.waitForDecision(request);

    expect(registry.decide(request.id, "allow_similar")).toEqual({
      ok: false,
      reason: "delete_file_only_allows_approve_once_or_deny",
    });
    expect(registry.size).toBe(1);
    expect(onApprovalResolved).not.toHaveBeenCalled();

    expect(registry.decide(request.id, "deny")).toEqual({ ok: true });
    await expect(promise).resolves.toMatchObject({
      requestId: request.id,
      decision: "deny",
    });
  });

  it("aborts all pending approvals for the stopped turn", async () => {
    const onApprovalResolved = vi.fn();
    const registry = new PendingApprovalRegistry({ onApprovalResolved });
    registry.setCurrentTurn("session-abort", "turn-abort");
    const request = makeRequest({ id: "approval-abort" });

    const decisionPromise = registry.waitForDecision(request);
    expect(registry.abortTurn("session-abort", "turn-abort")).toBe(1);

    await expect(decisionPromise).resolves.toMatchObject({
      requestId: request.id,
      decision: "abort",
    });
    expect(registry.size).toBe(0);
    expect(onApprovalResolved).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ decision: "abort" }),
      "session-abort",
      "turn-abort",
    );
  });

  it("authorizes Browser Use once for the current session", async () => {
    const onApprovalRequired = vi.fn();
    const registry = new PendingApprovalRegistry({ onApprovalRequired });
    const first = makeRequest({
      id: "browser-approval-1",
      toolName: "browser_tabs",
      approvalScope: "browser_session",
      sessionId: "session-browser",
      turnId: "turn-1",
    });

    const firstDecision = registry.waitForDecision(first);
    registry.onApprovalRequired(first);
    expect(onApprovalRequired).toHaveBeenCalledTimes(1);
    expect(registry.decide(first.id, "approve_once")).toEqual({ ok: true });
    await expect(firstDecision).resolves.toMatchObject({ decision: "approve_once" });
    expect(registry.isBrowserAuthorized("session-browser")).toBe(true);

    const second = makeRequest({
      id: "browser-approval-2",
      toolName: "browser_cua",
      approvalScope: "browser_session",
      sessionId: "session-browser",
      turnId: "turn-2",
    });
    await expect(registry.waitForDecision(second)).resolves.toMatchObject({ decision: "approve_once" });
    registry.onApprovalRequired(second);
    expect(onApprovalRequired).toHaveBeenCalledTimes(1);
  });

  it("denies Browser Use only for the current turn and asks again next turn", async () => {
    const onApprovalRequired = vi.fn();
    const registry = new PendingApprovalRegistry({ onApprovalRequired });
    const first = makeRequest({
      id: "browser-deny-1",
      toolName: "browser_tabs",
      approvalScope: "browser_session",
      sessionId: "session-browser",
      turnId: "turn-1",
    });

    const firstDecision = registry.waitForDecision(first);
    registry.onApprovalRequired(first);
    registry.decide(first.id, "deny");
    await expect(firstDecision).resolves.toMatchObject({ decision: "deny" });
    expect(registry.isBrowserDeniedForTurn("session-browser", "turn-1")).toBe(true);

    const sameTurn = makeRequest({
      id: "browser-deny-2",
      toolName: "browser_navigation",
      approvalScope: "browser_session",
      sessionId: "session-browser",
      turnId: "turn-1",
    });
    await expect(registry.waitForDecision(sameTurn)).resolves.toMatchObject({ decision: "deny" });
    registry.onApprovalRequired(sameTurn);
    expect(onApprovalRequired).toHaveBeenCalledTimes(1);

    const nextTurn = makeRequest({
      id: "browser-deny-3",
      toolName: "browser_tabs",
      approvalScope: "browser_session",
      sessionId: "session-browser",
      turnId: "turn-2",
    });
    const nextDecision = registry.waitForDecision(nextTurn);
    registry.onApprovalRequired(nextTurn);
    expect(onApprovalRequired).toHaveBeenCalledTimes(2);
    registry.decide(nextTurn.id, "deny");
    await nextDecision;
  });
});
