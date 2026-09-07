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
    const decision = broker.requestApproval({ requestId: "approval", pluginId: "plugin", name: "write", callId: "call", sessionId: "session", agentRunId: "run", definitionDigest: "definition", normalizedArgsDigest: "args", requestedEffects: [], reason: "write", risk: "medium", argumentSummary: {} }, controller.signal);

    controller.abort();

    await expect(decision).resolves.toMatchObject({ decision: "deny" });
    expect(abortAgentRun).toHaveBeenCalledWith("session", "run");
    resolveDecision({ requestId: "approval", decision: "abort", decidedAt: Date.now() });
  });
});
