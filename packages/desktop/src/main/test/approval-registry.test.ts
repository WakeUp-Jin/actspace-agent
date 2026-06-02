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
});
