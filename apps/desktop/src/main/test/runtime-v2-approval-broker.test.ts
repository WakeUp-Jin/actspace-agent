import { describe, expect, it, vi } from "vitest";
import { DesktopApprovalBroker } from "../runtime-v2/approval-broker";
import { PendingApprovalRegistry } from "../approval-registry";

describe("DesktopApprovalBroker", () => {
  it("cancels only the pending request, leaving sibling approvals live", async () => {
    const registry = new PendingApprovalRegistry();
    const request = { toolName: "bash", args: {}, summary: "test", reason: "test", sessionId: "s", agentRunId: "r", createdAt: Date.now() };
    const first = registry.waitForDecision({ ...request, id: "first" });
    const second = registry.waitForDecision({ ...request, id: "second" });
    registry.abortRequest("first");
    expect(await first).toMatchObject({ decision: "abort" });
    expect(registry.listPending().map(item => item.id)).toEqual(["second"]);
    registry.decide("second", "once");
    expect(await second).toMatchObject({ decision: "once" });
    expect(registry.size).toBe(0);
  });
  it("aborts the Host approval entry when the v2 run is cancelled", async () => {
    const abortRequest = vi.fn(() => 1);
    let resolveDecision!: (value: { requestId: string; decision: "abort"; decidedAt: number }) => void;
    const broker = new DesktopApprovalBroker({
      waitForDecision: () => new Promise((resolve) => { resolveDecision = resolve; }),
      onApprovalRequired: () => undefined,
      abortRequest,
    });
    const controller = new AbortController();
    const decision = broker.requestApproval({ schemaVersion: 1, requestId: "approval", pluginId: "plugin", toolName: "write", callId: "call", sessionId: "session", agentRunId: "run", agentId: "main:session", definitionDigest: "definition", normalizedArgsDigest: "args", reasons: [{ code: "TEST", message: "write", risk: "medium" }], resources: [], grantSuggestions: [], supportedLifetimes: ["once"], requestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }, controller.signal);

    controller.abort();

    await expect(decision).resolves.toMatchObject({ kind: "deny", code: "aborted" });
    expect(abortRequest).toHaveBeenCalledWith("approval");
    resolveDecision({ requestId: "approval", decision: "abort", decidedAt: Date.now() });
  });

  it.each([[true, "real"], [false, "sandbox"], [undefined, undefined]] as const)("shows a process with noSandbox=%s as the %s environment", async (noSandbox, environment) => {
    const onApprovalRequired = vi.fn();
    const broker = new DesktopApprovalBroker({ waitForDecision: async () => ({ requestId: "approval", decision: "once", decidedAt: Date.now() }), onApprovalRequired });
    const resource = { kind: "process" as const, access: "execute" as const, commandDigest: "digest", cwd: "/workspace", dynamic: false, ...(noSandbox === undefined ? {} : { noSandbox }) };
    await broker.requestApproval({ schemaVersion: 1, requestId: "approval", pluginId: "plugin", toolName: "bash", callId: "call", sessionId: "session", agentRunId: "run", agentId: "main:session", definitionDigest: "definition", normalizedArgsDigest: "args", reasons: [{ code: "TEST", message: "run", risk: "high" }], resources: [resource], grantSuggestions: [], supportedLifetimes: ["once"], requestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }, new AbortController().signal);
    expect(onApprovalRequired.mock.calls[0]![0].executionEnvironment).toBe(environment);
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
