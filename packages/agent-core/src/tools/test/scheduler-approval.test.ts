import { describe, it, expect, vi } from "vitest";
import {
  ToolScheduler,
  type ApprovalGate,
  type ToolApprovalRequest,
  type ToolApprovalDecision,
} from "../scheduler";
import type { InternalTool, ToolResult } from "../../internal-tools";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function createTool(name: string, options?: {
  decision?: "allow" | "deny" | "ask";
  reason?: string;
  allowSimilar?: boolean;
  executionEnvironment?: "sandbox" | "real";
}): InternalTool {
  const decision = options?.decision ?? "ask";
  return {
    name,
    description: `Tool ${name}`,
    parameters: { type: "object", properties: { command: { type: "string", description: "cmd" } }, required: ["command"] },
    isReadOnly: false,
    previewKind: "bash",
    handler: async () => ({ success: true, data: `${name} executed` }),
    checkPermissions: async () => ({
      decision,
      reason: options?.reason ?? `${name} requires approval`,
      summary: `Run ${name}`,
      riskLevel: "medium" as const,
      allowSimilar: options?.allowSimilar,
      executionEnvironment: options?.executionEnvironment,
      sanitizedArgs: { command: "test-cmd" },
    }),
  };
}

function createMockGate(): ApprovalGate & {
  pendingRequests: ToolApprovalRequest[];
  resolvers: Map<string, (d: ToolApprovalDecision) => void>;
  approve: (requestId: string) => void;
  deny: (requestId: string) => void;
} {
  const resolvers = new Map<string, (d: ToolApprovalDecision) => void>();
  const pendingRequests: ToolApprovalRequest[] = [];

  return {
    pendingRequests,
    resolvers,
    waitForDecision(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
      pendingRequests.push(request);
      return new Promise((resolve) => {
        resolvers.set(request.id, resolve);
      });
    },
    onApprovalRequired: vi.fn(),
    approve(requestId: string) {
      const resolver = resolvers.get(requestId);
      if (!resolver) throw new Error(`No pending request: ${requestId}`);
      resolver({ requestId, decision: "approve_once", decidedAt: Date.now() });
    },
    deny(requestId: string) {
      const resolver = resolvers.get(requestId);
      if (!resolver) throw new Error(`No pending request: ${requestId}`);
      resolver({ requestId, decision: "deny", decidedAt: Date.now() });
    },
  };
}

describe("ToolScheduler approval flow", () => {
  it("ask → approve → should execute handler", async () => {
    const gate = createMockGate();
    const scheduler = new ToolScheduler({ truncateThreshold: 2000, approvalGate: gate });
    const tool = createTool("bash");
    let handlerCalled = false;
    tool.handler = async () => { handlerCalled = true; return { success: true, data: "done" }; };

    const promise = scheduler.execute(tool, "bash", { command: "pnpm install" });
    await tick();

    expect(gate.pendingRequests).toHaveLength(1);
    gate.approve(gate.pendingRequests[0].id);

    const execution = await promise;
    expect(execution.result.success).toBe(true);
    expect(execution.result.data).toBe("done");
    expect(execution.record.status).toBe("success");
    expect(handlerCalled).toBe(true);
  });

  it("ask → deny → should cancel without executing handler", async () => {
    const gate = createMockGate();
    const scheduler = new ToolScheduler({ truncateThreshold: 2000, approvalGate: gate });
    const tool = createTool("bash");
    let handlerCalled = false;
    tool.handler = async () => { handlerCalled = true; return { success: true, data: "done" }; };

    const promise = scheduler.execute(tool, "bash", { command: "pnpm install" });
    await tick();

    expect(gate.pendingRequests).toHaveLength(1);
    gate.deny(gate.pendingRequests[0].id);

    const execution = await promise;
    expect(execution.result.success).toBe(false);
    expect(execution.result.error).toContain("denied");
    expect(execution.record.status).toBe("cancelled");
    expect(handlerCalled).toBe(false);
  });

  it("ask → timeout → should cancel", async () => {
    const gate = createMockGate();
    const scheduler = new ToolScheduler({ truncateThreshold: 2000, approvalGate: gate });
    const tool = createTool("bash");

    const promise = scheduler.execute(tool, "bash", { command: "pnpm install" });
    await tick();

    const requestId = gate.pendingRequests[0].id;
    const resolver = gate.resolvers.get(requestId)!;
    resolver({ requestId, decision: "timeout", decidedAt: Date.now() });

    const execution = await promise;
    expect(execution.result.success).toBe(false);
    expect(execution.result.error).toContain("timed out");
    expect(execution.record.status).toBe("cancelled");
  });

  it("ask → abort → should cancel immediately without executing handler", async () => {
    const gate = createMockGate();
    const scheduler = new ToolScheduler({ truncateThreshold: 2000, approvalGate: gate });
    const tool = createTool("bash");
    let handlerCalled = false;
    tool.handler = async () => { handlerCalled = true; return { success: true, data: "done" }; };

    const promise = scheduler.execute(tool, "bash", { command: "pnpm install" });
    await tick();

    const requestId = gate.pendingRequests[0].id;
    gate.resolvers.get(requestId)!({ requestId, decision: "abort", decidedAt: Date.now() });

    const execution = await promise;
    expect(execution.result.success).toBe(false);
    expect(execution.result.error).toContain("Turn stopped");
    expect(execution.record.status).toBe("cancelled");
    expect(handlerCalled).toBe(false);
  });

  it("ask → allow_similar → should execute handler", async () => {
    const gate = createMockGate();
    const scheduler = new ToolScheduler({ truncateThreshold: 2000, approvalGate: gate });
    const tool = createTool("bash");

    const promise = scheduler.execute(tool, "bash", { command: "pnpm install" });
    await tick();

    const requestId = gate.pendingRequests[0].id;
    const resolver = gate.resolvers.get(requestId)!;
    resolver({ requestId, decision: "allow_similar", decidedAt: Date.now() });

    const execution = await promise;
    expect(execution.result.success).toBe(true);
    expect(execution.record.status).toBe("success");
  });

  it("ask → allow_similar should cancel when permission disallows similar approvals", async () => {
    const gate = createMockGate();
    const scheduler = new ToolScheduler({ truncateThreshold: 2000, approvalGate: gate });
    const tool = createTool("delete_file", { allowSimilar: false });
    let handlerCalled = false;
    tool.handler = async () => { handlerCalled = true; return { success: true, data: "deleted" }; };

    const promise = scheduler.execute(tool, "delete_file", { path: "notes.md" });
    await tick();

    const requestId = gate.pendingRequests[0].id;
    const resolver = gate.resolvers.get(requestId)!;
    resolver({ requestId, decision: "allow_similar", decidedAt: Date.now() });

    const execution = await promise;
    expect(execution.result.success).toBe(false);
    expect(execution.result.error).toContain("does not allow similar-operation approval");
    expect(execution.record.status).toBe("cancelled");
    expect(handlerCalled).toBe(false);
  });

  it("should call onApprovalRequired before waiting", async () => {
    const gate = createMockGate();
    const scheduler = new ToolScheduler({ truncateThreshold: 2000, approvalGate: gate });
    const tool = createTool("bash", { executionEnvironment: "sandbox" });

    const promise = scheduler.execute(tool, "bash", { command: "pnpm install" });
    await tick();

    expect(gate.onApprovalRequired).toHaveBeenCalledTimes(1);
    const calledRequest = (gate.onApprovalRequired as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledRequest.toolName).toBe("bash");
    expect(calledRequest.executionEnvironment).toBe("sandbox");

    gate.approve(gate.pendingRequests[0].id);
    await promise;
  });

  it("without gate, ask should return cancelled", async () => {
    const scheduler = new ToolScheduler({ truncateThreshold: 2000 });
    const tool = createTool("bash");

    const execution = await scheduler.execute(tool, "bash", { command: "pnpm install" });
    expect(execution.result.success).toBe(false);
    expect(execution.record.status).toBe("cancelled");
    expect(execution.result.data).toMatchObject({ status: "awaiting_approval" });
  });

  it("record should contain approvalDecision after resolve", async () => {
    const gate = createMockGate();
    const scheduler = new ToolScheduler({ truncateThreshold: 2000, approvalGate: gate });
    const tool = createTool("bash");

    const promise = scheduler.execute(tool, "bash", { command: "test" });
    await tick();

    gate.approve(gate.pendingRequests[0].id);

    const execution = await promise;
    expect(execution.record.approvalDecision).toBeDefined();
    expect(execution.record.approvalDecision!.decision).toBe("approve_once");
  });

  it("allow decision should skip gate entirely", async () => {
    const gate = createMockGate();
    const scheduler = new ToolScheduler({ truncateThreshold: 2000, approvalGate: gate });
    const tool = createTool("bash", { decision: "allow" });

    const execution = await scheduler.execute(tool, "bash", { command: "pwd" });
    expect(execution.result.success).toBe(true);
    expect(gate.pendingRequests).toHaveLength(0);
  });

  it("deny decision should skip gate entirely", async () => {
    const gate = createMockGate();
    const scheduler = new ToolScheduler({ truncateThreshold: 2000, approvalGate: gate });
    const tool = createTool("bash", { decision: "deny", reason: "Dangerous" });

    const execution = await scheduler.execute(tool, "bash", { command: "rm -rf /" });
    expect(execution.result.success).toBe(false);
    expect(execution.result.error).toContain("no approval request was created");
    expect(execution.record.status).toBe("cancelled");
    expect(gate.pendingRequests).toHaveLength(0);
  });
});
