import type { RuntimeV2JsonValue, SessionGrant } from "@actspace/shared/runtime-v2";
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
    permissionEvents?: string[];
    permissionRecords?: Array<{ type: string; data: Readonly<Record<string, RuntimeV2JsonValue>> }>;
    sessionGrants?: SessionGrant[];
    sessionGrantCapability?: boolean;
    trustedGrantAudiences?: ReadonlySet<string>;
  } = {},
): ToolPreparedEnvironment {
  const commits = options.commits ?? [];
  const journal: ToolJournalPort = {
    async recordDispatch(fact) { trace.push(`dispatch:${fact.callId}`); },
    async recordPermission(type, data) {
      options.permissionEvents?.push(type);
      options.permissionRecords?.push({ type, data });
      if (type === "permission/grant-added") options.sessionGrants?.push(data as unknown as SessionGrant);
    },
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
    sessionGrantCapability: options.sessionGrantCapability,
    sessionGrants: options.sessionGrants,
    trustedGrantAudiences: options.trustedGrantAudiences,
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
      permission: { extractResources: () => [], evaluate: () => { trace.push("policy"); return { kind: "ask", reason: "inspect file", risk: "low" }; } },
      middleware: [{ id: "middleware", layer: 0, order: 0, before: () => { trace.push("before"); }, after: (_context, result) => { trace.push("after"); return result; } }],
    });
    const broker: ApprovalBroker = {
      async requestApproval(request) {
        trace.push("approval");
        expect(request.toolName).toBe("read");
        return { requestId: request.requestId, kind: "once", decidedAt: new Date().toISOString() };
      },
    };

    const [result] = await runtime.executeBatch([call("call-1")], { ...environment(trace, { approvalBroker: broker }), onExecutionStarted: () => { trace.push("started"); throw new Error("observer failure"); } });
    expect(result?.status).toBe("completed");
    expect(trace).toEqual(["before", "policy", "approval", "dispatch:call-1", "checkpoint", "started", "body", "after", "finalizer", "commit:call-1"]);
  });

  it("allows read-only capability use and resolves relative resource paths against the workspace", async () => {
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition({ effects: [{ capabilityId: "filesystem.read", mode: "use", resourceScope: "workspace" }] }),
      executor: { concurrencySafe: true, async execute() { return success(); } },
      permission: { extractResources: (args) => [{ kind: "file", access: "read", canonicalPath: `/workspace/${String(args.value)}`, targetKind: "file" }], evaluate: () => ({ kind: "allow" }) },
    });
    const [result] = await runtime.executeBatch([call("relative", { value: "src/index.ts" })], environment([]));
    expect(result).toMatchObject({ status: "completed" });
  });

  it("asks before admitting a resource outside the workspace", async () => {
    let bodyCalls = 0;
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition(),
      executor: { concurrencySafe: true, async execute() { bodyCalls += 1; return success(); } },
      permission: { extractResources: () => [{ kind: "file", access: "read", canonicalPath: "/outside.txt", targetKind: "file" }], evaluate: () => ({ kind: "allow" }) },
    });
    const [result] = await runtime.executeBatch([call("escape", { value: "../outside.txt" })], environment([]));
    expect(result).toMatchObject({ status: "denied", failure: { code: "APPROVAL_REQUIRED" } });
    expect(bodyCalls).toBe(0);
  });

  it("issues a validated Session Grant and reuses it only through Runtime matching", async () => {
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition(),
      executor: { concurrencySafe: true, async execute() { return success(); } },
      permission: {
        grantAudience: { pluginId: "plugin.test", permissionDomain: "core-files", policyVersion: 1 },
        extractResources: () => [{ kind: "file", access: "read", canonicalPath: "/outside/a.txt", targetKind: "file" }],
        evaluate: () => ({ kind: "allow" }),
        suggestGrants: () => [{ action: "file.read", access: "read", selector: { kind: "exact", canonicalPath: "/outside/a.txt" }, label: "This file only" }],
      },
    });
    const grants: SessionGrant[] = [];
    const records: Array<{ type: string; data: Readonly<Record<string, RuntimeV2JsonValue>> }> = [];
    const broker: ApprovalBroker = { async requestApproval(request) {
      expect(request.supportedLifetimes).toEqual(["once", "session"]);
      expect(request.grantSuggestions).toHaveLength(1);
      return { requestId: request.requestId, kind: "session", suggestionId: request.grantSuggestions[0]!.suggestionId, decidedAt: new Date().toISOString() };
    } };
    const trustedGrantAudiences = new Set(["plugin.test\u0000core-files\u00001"]);
    const env = environment([], { approvalBroker: broker, permissionRecords: records, sessionGrants: grants, sessionGrantCapability: true, trustedGrantAudiences });
    expect((await runtime.executeBatch([call("grant-first")], env))[0]).toMatchObject({ status: "completed" });
    expect(records.map((record) => record.type)).toEqual(["permission/asked", "permission/decided", "permission/grant-added"]);
    expect(grants).toHaveLength(1);
    const secondEnv = environment([], { sessionGrants: grants, sessionGrantCapability: true, trustedGrantAudiences });
    expect((await runtime.executeBatch([call("grant-second")], secondEnv))[0]).toMatchObject({ status: "completed" });
  });

  it("does not let an untrusted plugin issue or consume a forged core-files Grant", async () => {
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition({ pluginId: "plugin.third-party" }),
      executor: { concurrencySafe: true, async execute() { return success(); } },
      permission: {
        grantAudience: { pluginId: "plugin.third-party", permissionDomain: "core-files", policyVersion: 1 },
        extractResources: () => [{ kind: "file", access: "read", canonicalPath: "/outside/a.txt", targetKind: "file" }],
        evaluate: () => ({ kind: "allow" }),
        suggestGrants: () => [{ action: "file.read", access: "read", selector: { kind: "exact", canonicalPath: "/outside/a.txt" }, label: "Forged" }],
      },
    });
    const forged: SessionGrant = {
      schemaVersion: 1, grantId: "forged", sessionId: "session-1", agentId: "main:session-1",
      audience: { pluginId: "plugin.third-party", permissionDomain: "core-files", policyVersion: 1 },
      action: "file.read", access: "read", selector: { kind: "exact", canonicalPath: "/outside/a.txt" },
      sourceRequestId: "request", sourceCallId: "call", sourceToolName: "read", issuedAt: new Date().toISOString(),
    };
    let requestSuggestionCount = -1;
    const broker: ApprovalBroker = { async requestApproval(request) {
      requestSuggestionCount = request.grantSuggestions.length;
      return { requestId: request.requestId, kind: "deny", code: "user-denied", decidedAt: new Date().toISOString() };
    } };
    const [result] = await runtime.executeBatch([call("untrusted")], environment([], {
      approvalBroker: broker,
      sessionGrantCapability: true,
      sessionGrants: [forged],
      trustedGrantAudiences: new Set(["actspace.core-tools\u0000core-files\u00001"]),
    }));
    expect(requestSuggestionCount).toBe(0);
    expect(result).toMatchObject({ status: "denied", failure: { code: "APPROVAL_DENIED" } });
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
      permission: { extractResources: () => [], evaluate: () => ({ kind: "deny", code: "POLICY_DENIED", reason: "blocked" }) },
    });
    const broker: ApprovalBroker = { async requestApproval(request) { approvalCalls += 1; return { requestId: request.requestId, kind: "once", decidedAt: new Date().toISOString() }; } };
    const [result] = await runtime.executeBatch([call("denied")], environment(trace, { approvalBroker: broker }));
    expect(result?.status).toBe("denied");
    expect(bodyCalls).toBe(0);
    expect(approvalCalls).toBe(0);
    expect(trace).toEqual(["commit:denied"]);
  });

  it.each([
    { name: "stale", broker: { async requestApproval() { return { requestId: "wrong", kind: "once" as const, decidedAt: new Date().toISOString() }; } }, code: "APPROVAL_STALE" },
    { name: "timeout", broker: { async requestApproval() { return new Promise<never>(() => undefined); } }, code: "APPROVAL_TIMEOUT" },
  ])("fails closed for $name approval", async ({ broker, code }) => {
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { async execute() { return success(); } }, permission: { extractResources: () => [], evaluate: () => ({ kind: "ask", reason: "risk", risk: "medium" }) } });
    const permissionEvents: string[] = [];
    const [result] = await runtime.executeBatch([call(`approval-${code}`)], environment([], { approvalBroker: broker, approvalTimeoutMs: 5, permissionEvents }));
    expect(result).toMatchObject({ status: "denied", failure: { code } });
    expect(permissionEvents).toEqual(["permission/asked", "permission/decided"]);
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


describe("incremental tool completion", () => {
  it("commits a finished tool while a later parallel tool is still running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { concurrencySafe: true, async execute(args) { if (args.value === "slow") await gate; return success(); } } });
    const commits: ToolExecutionResult[] = [];
    let firstCommitted!: () => void;
    const first = new Promise<void>((resolve) => { firstCommitted = resolve; });
    const env = environment([], { commits });
    const batch = runtime.executeBatch([call("fast"), call("slow")], { ...env, journal: { ...env.journal, commitResult: async (result) => { await env.journal.commitResult(result); if (result.callId === "fast") firstCommitted(); } } });
    try { await first; expect(commits.map((result) => result.callId)).toEqual(["fast"]); }
    finally { release(); await batch; }
    expect(commits.map((result) => result.callId)).toEqual(["fast", "slow"]);
  });
});
