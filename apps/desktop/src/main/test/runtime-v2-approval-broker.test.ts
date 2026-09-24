import { describe, expect, it, vi } from "vitest";
import { DesktopApprovalBroker } from "../runtime-v2/approval-broker";

describe("DesktopApprovalBroker", () => {
  it("aborts the Host approval entry when the v2 run is cancelled", async () => {
    const abortAgentRun = vi.fn(() => 1);
    let resolveDecision!: (value: { requestId: string; decision: "abort"; decidedAt: number }) => void;
    const broker = new DesktopApprovalBroker({
      waitForDecision: () => new Promise((resolve) => { resolveDecision = resolve; }),
      onApprovalRequired: () => undefined,
      abortAgentRun,
    });
    const controller = new AbortController();
    const decision = broker.requestApproval({ schemaVersion: 1, requestId: "approval", pluginId: "plugin", toolName: "write", callId: "call", sessionId: "session", agentRunId: "run", agentId: "main:session", definitionDigest: "definition", normalizedArgsDigest: "args", reasons: [{ code: "TEST", message: "write", risk: "medium" }], resources: [], grantSuggestions: [], supportedLifetimes: ["once"], requestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }, controller.signal);

    controller.abort();

    await expect(decision).resolves.toMatchObject({ kind: "deny", code: "aborted" });
    expect(abortAgentRun).toHaveBeenCalledWith("session", "run");
    resolveDecision({ requestId: "approval", decision: "abort", decidedAt: Date.now() });
  });

  it("returns the Runtime suggestion id without accepting scope fields from Renderer", async () => {
    const broker = new DesktopApprovalBroker({
      waitForDecision: async () => ({ requestId: "approval", decision: "session", suggestionId: "suggestion-1", decidedAt: Date.now() }),
      onApprovalRequired: () => undefined,
    });
    const decision = await broker.requestApproval({ schemaVersion: 1, requestId: "approval", pluginId: "plugin", toolName: "write", callId: "call", sessionId: "session", agentRunId: "run", agentId: "main:session", definitionDigest: "definition", normalizedArgsDigest: "args", reasons: [{ code: "TEST", message: "write", risk: "medium" }], resources: [], grantSuggestions: [{ suggestionId: "suggestion-1", lifetime: "session", action: "file.write", access: "write", selector: { kind: "exact", canonicalPath: "/tmp/file" }, audience: { pluginId: "plugin", permissionDomain: "core-files", policyVersion: 1 }, label: "This file only" }], supportedLifetimes: ["once", "session"], requestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }, new AbortController().signal);
    expect(decision).toMatchObject({ kind: "session", suggestionId: "suggestion-1" });
  });
});
