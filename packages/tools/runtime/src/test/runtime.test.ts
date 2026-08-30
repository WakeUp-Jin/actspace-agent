import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ApprovalBroker } from "@actspace/tools-approval";
import type { ToolDefinition } from "../definition.js";
import type { ToolBodyResult, ToolCapabilitySet } from "../executor.js";
import type { ToolJournalPort, ToolPreparedEnvironment } from "../prepared-execution.js";
import type { ToolExecutionResult } from "../result.js";
import { ToolRuntime } from "../runtime.js";
import { materializeToolArguments } from "../argument-validator.js";

class FakeCapabilities implements ToolCapabilitySet {
  readonly ids: readonly string[];
  constructor(private readonly values: ReadonlyMap<string, unknown>) {
    this.ids = Object.freeze([...values.keys()].sort());
  }
  has(capabilityId: string): boolean { return this.values.has(capabilityId); }
  get<T>(capabilityId: string): T {
    if (!this.values.has(capabilityId)) throw new Error(`Missing ${capabilityId}`);
    return this.values.get(capabilityId) as T;
  }
}

function definition(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    abiVersion: 2,
    pluginId: "plugin.test",
    name: "read",
    definitionVersion: 1,
    description: "Read a value",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
        token: { type: "string" },
      },
      required: ["value"],
      additionalProperties: false,
    },
    effects: [{ capabilityId: "filesystem.read", mode: "read", resourceScope: null }],
    concurrency: "read-only",
    sensitiveArgumentPaths: ["/token"],
    resultSchemaVersion: 1,
    ...overrides,
  };
}

function call(callId: string, args: unknown = { value: callId }) {
  return { callId, name: "read", arguments: args, sessionId: "session-1", agentRunId: "run-1", turnId: "turn-1", stepId: "step-1" } as const;
}

function environment(
  trace: string[],
  options: {
    approvalBroker?: ApprovalBroker;
    checkpoint?: () => Promise<void>;
    commits?: ToolExecutionResult[];
    approvalTimeoutMs?: number;
  } = {},
): ToolPreparedEnvironment {
  const commits = options.commits ?? [];
  const journal: ToolJournalPort = {
    async recordDispatch(fact) { trace.push(`dispatch:${fact.callId}`); },
    async checkpointBeforeBody() {
      trace.push("checkpoint");
      await options.checkpoint?.();
    },
    async commitResult(result) {
      trace.push(`commit:${result.callId}`);
      commits.push(result);
    },
  };
  const capabilitySet = new FakeCapabilities(new Map([["filesystem.read", Object.freeze({ kind: "read" })]]));
  return {
    workspaceRoot: "/workspace",
    hostCapabilities: new Set(["filesystem.read"]),
    capabilitySet,
    approvalBroker: options.approvalBroker,
    approvalTimeoutMs: options.approvalTimeoutMs,
    journal,
    createArtifact: async () => ({ artifactId: "artifact-1", mediaType: "text/plain", size: 1, sha256: "digest" }),
  };
}

function success(summary = "ok"): ToolBodyResult {
  return { status: "completed", summary, modelOutput: [{ type: "text", text: summary }] };
}

describe("Tool Runtime execution contract", () => {
  it("materializes JSON Schema defaults before freezing arguments", () => {
    const value = materializeToolArguments({ type: "object", properties: { count: { type: "integer", minimum: 1, default: 5 }, nested: { type: "object", properties: { enabled: { type: "boolean", default: true } }, additionalProperties: false, default: {} } }, additionalProperties: false }, {});
    expect(value).toEqual({ count: 5, nested: { enabled: true } });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.nested)).toBe(true);
  });

  it("runs the complete safety pipeline in the fixed order", async () => {
    const trace: string[] = [];
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition(),
      executor: {
        async execute(_args, context) {
          trace.push("body");
          context.defer(async () => { trace.push("finalizer"); });
          return success();
        },
      },
      policies: [{ id: "policy", layer: 0, order: 0, evaluate: () => { trace.push("policy"); return { kind: "require-approval", reason: "inspect file", risk: "low" }; } }],
      middleware: [{ id: "middleware", layer: 0, order: 0, before: () => { trace.push("before"); }, after: (_context, result) => { trace.push("after"); return result; } }],
    });
    const broker: ApprovalBroker = {
      async requestApproval(request) {
        trace.push("approval");
        expect(request.argumentSummary).toEqual({ value: "call-1" });
        return { requestId: request.requestId, decision: "allow", decidedAt: "2026-08-22T12:00:00.000Z" };
      },
    };

    const [result] = await runtime.executeBatch([call("call-1")], environment(trace, { approvalBroker: broker }));
    expect(result?.status).toBe("completed");
    expect(trace).toEqual(["before", "policy", "approval", "dispatch:call-1", "checkpoint", "body", "after", "finalizer", "commit:call-1"]);
  });

  it("allows read-only capability use and resolves relative resource paths against the workspace", async () => {
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition({ effects: [{ capabilityId: "filesystem.read", mode: "use", resourceScope: "workspace" }] }),
      executor: { concurrencySafe: true, async execute() { return success(); } },
      resolveResourcePaths: (args) => [String(args.value)],
    });
    const [result] = await runtime.executeBatch([call("relative", { value: "src/index.ts" })], environment([]));
    expect(result).toMatchObject({ status: "completed" });
  });

  it("rejects relative resource paths that escape the workspace", async () => {
    let bodyCalls = 0;
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition(),
      executor: { concurrencySafe: true, async execute() { bodyCalls += 1; return success(); } },
      resolveResourcePaths: (args) => [String(args.value)],
    });
    const [result] = await runtime.executeBatch([call("escape", { value: "../outside.txt" })], environment([]));
    expect(result).toMatchObject({ status: "denied", failure: { code: "WORKSPACE_BOUNDARY_DENIED" } });
    expect(bodyCalls).toBe(0);
  });

  it("fails checkpoint closed before invoking the executor body", async () => {
    let bodyCalls = 0;
    const trace: string[] = [];
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { async execute() { bodyCalls += 1; return success(); } } });
    const [result] = await runtime.executeBatch([call("checkpoint")], environment(trace, { checkpoint: async () => { throw new Error("disk full"); } }));
    expect(bodyCalls).toBe(0);
    expect(result).toMatchObject({ status: "failed", dispatched: true, failure: { code: "CHECKPOINT_FAILED" } });
    expect(trace).toEqual(["dispatch:checkpoint", "checkpoint", "commit:checkpoint"]);
  });

  it("keeps policy denial monotonic and skips approval, dispatch and body", async () => {
    let bodyCalls = 0;
    let approvalCalls = 0;
    const trace: string[] = [];
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition(),
      executor: { async execute() { bodyCalls += 1; return success(); } },
      policies: [
        { id: "approval", layer: 0, order: 0, evaluate: () => ({ kind: "require-approval", reason: "risk", risk: "high" }) },
        { id: "deny", layer: 0, order: 1, evaluate: () => ({ kind: "deny", code: "POLICY_DENIED", reason: "blocked" }) },
        { id: "late", layer: 1, order: 0, evaluate: () => ({ kind: "continue" }) },
      ],
    });
    const broker: ApprovalBroker = { async requestApproval(request) { approvalCalls += 1; return { requestId: request.requestId, decision: "allow", decidedAt: "now" }; } };
    const [result] = await runtime.executeBatch([call("denied")], environment(trace, { approvalBroker: broker }));
    expect(result?.status).toBe("denied");
    expect(bodyCalls).toBe(0);
    expect(approvalCalls).toBe(0);
    expect(trace).toEqual(["commit:denied"]);
  });

  it.each([
    { name: "stale", broker: { async requestApproval() { return { requestId: "wrong", decision: "allow" as const, decidedAt: "now" }; } }, code: "APPROVAL_STALE" },
    { name: "timeout", broker: { async requestApproval() { return new Promise<never>(() => undefined); } }, code: "APPROVAL_TIMEOUT" },
  ])("fails closed for $name approval", async ({ broker, code }) => {
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { async execute() { return success(); } }, policies: [{ id: "ask", layer: 0, order: 0, evaluate: () => ({ kind: "require-approval", reason: "risk", risk: "medium" }) }] });
    const [result] = await runtime.executeBatch([call(`approval-${code}`)], environment([], { approvalBroker: broker, approvalTimeoutMs: 5 }));
    expect(result).toMatchObject({ status: "denied", failure: { code } });
  });

  it("rejects invalid args with a field path and no body invocation", async () => {
    let bodyCalls = 0;
    const commits: ToolExecutionResult[] = [];
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { async execute() { bodyCalls += 1; return success(); } } });
    const [result] = await runtime.executeBatch([call("invalid", { unknown: "SECRET-CANARY" })], environment([], { commits }));
    expect(bodyCalls).toBe(0);
    expect(result).toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS", fieldPath: "$/value" } });
    expect(JSON.stringify(commits)).not.toContain("SECRET-CANARY");
  });

  it("runs read-only bodies in a bounded pool but commits in model order", async () => {
    const trace: string[] = [];
    const commits: ToolExecutionResult[] = [];
    let active = 0;
    let peak = 0;
    const runtime = new ToolRuntime({ maxParallel: 3 });
    runtime.register({
      definition: definition(),
      executor: {
        concurrencySafe: true,
        async execute(args) {
          active += 1;
          peak = Math.max(peak, active);
          const value = String(args.value);
          await new Promise((resolve) => setTimeout(resolve, value.endsWith("0") ? 15 : 1));
          trace.push(`body:${value}`);
          active -= 1;
          return success(value);
        },
      },
    });
    const calls = Array.from({ length: 8 }, (_, index) => call(`call-${index}`));
    await runtime.executeBatch(calls, environment(trace, { commits }));
    expect(peak).toBe(3);
    expect(trace.filter((item) => item.startsWith("body:"))[0]).not.toBe("body:call-0");
    expect(commits.map((result) => result.callId)).toEqual(calls.map((item) => item.callId));
  });

  it("keeps captured registration alive through replacement and drains exactly once", async () => {
    const trace: string[] = [];
    const runtime = new ToolRuntime();
    const old = runtime.register({ definition: definition(), executor: { async execute() { return success("old"); } } });
    const [prepared] = runtime.scheduler.prepareBatch([call("replace")], environment(trace));
    old.beginDrain();
    const replacement = runtime.register({ definition: definition({ definitionVersion: 2 }), executor: { async execute() { return success("new"); } } });
    const drain = old.dispose(100);
    const result = await prepared?.execute();
    await drain;
    expect(result?.summary).toBe("old");
    const [next] = await runtime.executeBatch([call("next")], environment([]));
    expect(next?.summary).toBe("new");
    await replacement.dispose();
  });

  it("reports a stuck registration lease and can finish disposal after it releases", async () => {
    const runtime = new ToolRuntime();
    const registration = runtime.register({ definition: definition(), executor: { async execute() { return success("unused"); } } });
    const lease = registration.registration.leaseOwner.acquire();

    await expect(registration.dispose(5)).rejects.toThrow("Timed out draining");
    expect(registration.registration.leaseOwner.state).toBe("draining");

    lease.release();
    await registration.dispose(100);
    expect(registration.registration.leaseOwner.state).toBe("disposed");
  });

  it("preserves body outcome when a LIFO finalizer fails and redacts outputs", async () => {
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition(),
      executor: {
        async execute(_args, context) {
          context.defer(async () => { throw new Error("cleanup token-abcdefgh failed"); });
          return {
            status: "completed",
            summary: "used token-abcdefgh",
            modelOutput: [{ type: "json", value: { apiKey: "secret", ok: true } as RuntimeV2JsonValue }],
          };
        },
      },
    });
    const [result] = await runtime.executeBatch([call("redact")], environment([]));
    expect(result?.status).toBe("completed");
    expect(result?.finalizerFailures).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("token-abcdefgh");
    expect(JSON.stringify(result)).not.toContain('"secret"');
  });

  it("rejects duplicate ids and invalid concurrency declarations", async () => {
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { async execute() { return success(); } } });
    expect(() => runtime.register({ definition: definition(), executor: { async execute() { return success(); } } })).toThrow("Duplicate tool name");

    const unsafe = new ToolRuntime();
    unsafe.register({ definition: definition({ concurrency: "declared-safe" }), executor: { async execute() { return success(); } } });
    const [result] = await unsafe.executeBatch([call("unsafe")], environment([]));
    expect(result).toMatchObject({ status: "denied", failure: { code: "CAPABILITY_DENIED" } });
  });

  it("admits only flat provider-safe names and captures by name directly", async () => {
    const runtime = new ToolRuntime();
    expect(() => runtime.register({ definition: definition({ name: "plugin.test/read" }), executor: { async execute() { return success(); } } })).toThrow("Tool name must match");
    runtime.register({ definition: definition(), executor: { async execute() { return success("direct"); } } });
    expect(runtime.registry.capture("read").definition.name).toBe("read");
    expect(() => runtime.registry.capture("plugin.test/read")).toThrow("Tool plugin.test/read is not active");
  });
});
