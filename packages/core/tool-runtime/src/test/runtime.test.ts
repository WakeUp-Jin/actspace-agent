import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCordisRoot } from "@actspace/cordis-adapter";
import type { RuntimeV2JsonValue, SessionGrant } from "@actspace/shared/runtime-v2";
import type { ApprovalBroker } from "@actspace/approval";
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

// 权限检查会对工作区根目录做 realpath。写死的 /workspace 在它恰好是符号链接的机器上
// （云端 Agent、devcontainer）会被解析到别处，所以每次运行建一个真实目录。
let workspaceRoot = "";
beforeAll(async () => { workspaceRoot = await realpath(await mkdtemp(join(tmpdir(), "actspace-tool-runtime-"))); });
afterAll(async () => { await rm(workspaceRoot, { recursive: true, force: true }); });

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
    modes: ["plan", "agent"],
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
    workspaceRoot,
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
  it.each(["user-denied", "timeout", "aborted"] as const)("does not turn a settled %s into approval on mode change", async code => {
    let mode: "default" | "full-access" = "default";
    let listener: (() => void) | undefined;
    let decide!: () => void; let ready!: () => void;
    const requested = new Promise<void>(resolve => { ready = resolve; });
    const execute = vi.fn(async () => success());
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { execute }, permission: {
      extractResources: () => [], evaluate: (_a, _r, c) => c.mode === "full-access" ? { kind: "allow" } : { kind: "ask", reason: "risk", risk: "high" },
    } });
    const pending = runtime.executeBatch([call("denial-race")], {
      ...environment([], { approvalBroker: { requestApproval: request => new Promise(resolve => {
        decide = () => resolve({ requestId: request.requestId, kind: "deny", code, decidedAt: new Date().toISOString() }); ready();
      }) } }), permissionMode: () => mode,
      subscribePermissionMode: callback => { listener = callback; return () => { listener = undefined; }; },
    });
    await requested; decide(); mode = "full-access"; listener?.();
    expect((await pending)[0]?.status).toBe("denied");
    expect(execute).not.toHaveBeenCalled(); expect(listener).toBeUndefined();
  });

  it("rechecks hard denial after mode invalidation", async () => {
    let mode: "default" | "full-access" = "default";
    let listener: (() => void) | undefined;
    let ready!: () => void; const requested = new Promise<void>(resolve => { ready = resolve; });
    const execute = vi.fn(async () => success()); const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { execute }, permission: {
      extractResources: () => [], evaluate: (_a, _r, c) => c.mode === "full-access" ? { kind: "deny", code: "POLICY_DENIED", reason: "still forbidden" } : { kind: "ask", reason: "risk", risk: "high" },
    } });
    const pending = runtime.executeBatch([call("recheck-deny")], {
      ...environment([], { approvalBroker: { requestApproval: (request, signal) => new Promise(resolve => {
        signal.addEventListener("abort", () => resolve({ requestId: request.requestId, kind: "deny", code: "aborted", decidedAt: new Date().toISOString() })); ready();
      }) } }), permissionMode: () => mode,
      subscribePermissionMode: callback => { listener = callback; return () => { listener = undefined; }; },
    });
    await requested; mode = "full-access"; listener?.();
    expect((await pending)[0]).toMatchObject({ status: "denied", failure: { code: "POLICY_DENIED" } });
    expect(execute).not.toHaveBeenCalled(); expect(listener).toBeUndefined();
  });

  it("does not execute when full-access is downgraded during the durability checkpoint", async () => {
    let mode: "default" | "full-access" = "full-access";
    const execute = vi.fn(async () => success()); const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { execute }, permission: { extractResources: () => [], evaluate: () => ({ kind: "allow" }) } });
    const result = await runtime.executeBatch([call("downgrade")], { ...environment([], { checkpoint: async () => { mode = "default"; } }), permissionMode: () => mode });
    expect(result[0]).toMatchObject({ status: "failed", failure: { code: "PERMISSION_STATE_CHANGED" } });
    expect(execute).not.toHaveBeenCalled();
  });

  it("extracts resources under the mode the call is admitted in, also on the pre-execution recheck", async () => {
    const seen: string[] = [];
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { execute: async () => success() }, permission: {
      extractResources: (_args, context) => { seen.push(context.mode); return []; },
      evaluate: (_a, _r, c) => c.mode === "full-access" ? { kind: "allow" } : { kind: "ask", reason: "risk", risk: "high" },
    } });
    const once = { approvalBroker: { requestApproval: async (request: { requestId: string }) => ({ requestId: request.requestId, kind: "once" as const, decidedAt: new Date().toISOString() }) } };
    await runtime.executeBatch([call("mode-full")], { ...environment([]), permissionMode: () => "full-access" });
    await runtime.executeBatch([call("mode-default")], { ...environment([], once), permissionMode: () => "default" });
    expect(seen).toEqual(["full-access", "full-access", "default", "default"]);
  });

  it("re-evaluates a pending approval on mode change and cleans up its request", async () => {
    let mode: "default" | "full-access" = "default";
    let listener: (() => void) | undefined;
    let requested!: () => void;
    const ready = new Promise<void>(resolve => { requested = resolve; });
    const cleanup = vi.fn(); const execute = vi.fn(async () => success());
    const records: Array<{ type: string; data: Readonly<Record<string, RuntimeV2JsonValue>> }> = [];
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { execute }, permission: {
      extractResources: () => [],
      evaluate: (_args, _resources, context) => context.mode === "full-access" ? { kind: "allow" } : { kind: "ask", reason: "approval", risk: "high" },
    } });
    const pending = runtime.executeBatch([call("switch")], {
      ...environment([], { permissionRecords: records, approvalTimeoutMs: 100, approvalBroker: { requestApproval: (request, signal) => new Promise(resolve => {
        signal.addEventListener("abort", () => { cleanup(); resolve({ requestId: request.requestId, kind: "deny", code: "aborted", decidedAt: new Date().toISOString() }); });
        requested();
      }) } }),
      permissionMode: () => mode,
      subscribePermissionMode: (callback: () => void) => { listener = callback; return () => { listener = undefined; }; },
    });
    await ready; mode = "full-access"; listener?.();
    expect((await pending)[0]).toMatchObject({ status: "completed" });
    expect(execute).toHaveBeenCalledTimes(1); expect(cleanup).toHaveBeenCalledTimes(1);
    expect(listener).toBeUndefined();
    expect(records.filter(item => item.type === "permission/decided")).toHaveLength(1);
  });
  it("denies a registered tool outside the caller scope before dispatch", async () => {
    const trace: string[] = [];
    const permissionEvents: string[] = [];
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { execute: async () => { trace.push("body"); return success(); } } });
    const [result] = await runtime.executeBatch([call("scope-denied")], {
      ...environment(trace, { permissionEvents }), allowedToolNames: new Set(["other"]),
    });
    expect(result).toMatchObject({ status: "denied", failure: { code: "TOOL_SCOPE_DENIED" } });
    expect(permissionEvents).toContain("permission/scope-denied");
    expect(trace).not.toContain("body");
    expect(trace).not.toContain("dispatch:scope-denied");
  });

  it("materializes JSON Schema defaults before freezing arguments", () => {
    const value = materializeToolArguments({ type: "object", properties: { count: { type: "integer", minimum: 1, default: 5 }, nested: { type: "object", properties: { enabled: { type: "boolean", default: true } }, additionalProperties: false, default: {} } }, additionalProperties: false }, {});
    expect(value).toEqual({ count: 5, nested: { enabled: true } });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.nested)).toBe(true);
  });

  it("keeps executor facts and finalizers when post-execute changes or throws", async () => {
    for (const throws of [false, true]) {
      const root = await createCordisRoot();
      const trace: string[] = [];
      const runtime = new ToolRuntime();
      const registration = runtime.register({ definition: definition(), executor: { execute: async (_args, ctx) => {
        ctx.defer(async () => { trace.push("finalized"); });
        return { status: "failed", summary: "failed", modelOutput: [], failure: { code: "BODY_FAILED", message: "original", retryable: false } };
      } } });
      root.context.on?.("tools/post-execute", (body) => {
        Object.assign(body, { status: "completed", failure: undefined });
        if (throws) throw new Error("observer failed");
        return body;
      });
      try {
        const [result] = await runtime.executeBatch([call("post")], { ...environment(trace), context: root.context });
        expect(result).toMatchObject({ status: "failed", failure: { code: "BODY_FAILED" } });
        expect(result.finalizerFailures).toHaveLength(throws ? 1 : 0);
        expect(trace).toContain("finalized");
        expect(trace).toContain("commit:post");
        await registration.dispose();
      } finally { await root.dispose(); }
    }
  });

  it("validates pre-execute rewrites and stops applying a removed plugin", async () => {
    const root = await createCordisRoot();
    const trace: string[] = [];
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { execute: async () => { trace.push("body"); return success(); } } });
    const remove = root.context.on?.("tools/pre-execute", () => ({ args: { value: 42 } })) as () => void;
    try {
      const [rejected] = await runtime.executeBatch([call("bad")], { ...environment(trace), context: root.context });
      expect(rejected.status).toBe("failed");
      expect(trace).not.toContain("body");
      remove();
      const [accepted] = await runtime.executeBatch([call("good")], { ...environment(trace), context: root.context });
      expect(accepted.status).toBe("completed");
      expect(trace).toContain("body");
    } finally { await root.dispose(); }
  });

  it("runs the complete safety pipeline in the fixed order", async () => {
    const root = await createCordisRoot();
    const trace: string[] = [];
    root.context.on?.("tools/pre-execute", async (_payload, next) => { trace.push("before"); return await next(); });
    root.context.on?.("tools/post-execute", async (_payload, next) => { trace.push("after"); return await next(); });
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
    });
    const broker: ApprovalBroker = {
      async requestApproval(request) {
        trace.push("approval");
        expect(request.toolName).toBe("read");
        return { requestId: request.requestId, kind: "once", decidedAt: new Date().toISOString() };
      },
    };

    const [result] = await runtime.executeBatch([call("call-1")], { ...environment(trace, { approvalBroker: broker }), context: root.context, onExecutionStarted: () => { trace.push("started"); throw new Error("observer failure"); } });
    expect(result?.status).toBe("completed");
    expect(trace).toEqual(["before", "policy", "approval", "dispatch:call-1", "checkpoint", "started", "body", "after", "finalizer", "commit:call-1"]);
    await root.dispose();
  });

  it("allows read-only capability use and resolves relative resource paths against the workspace", async () => {
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition({ effects: [{ capabilityId: "filesystem.read", mode: "use", resourceScope: "workspace" }] }),
      executor: { concurrencySafe: true, async execute() { return success(); } },
      permission: { extractResources: (args) => [{ kind: "file", access: "read", canonicalPath: join(workspaceRoot, String(args.value)), targetKind: "file" }], evaluate: () => ({ kind: "allow" }) },
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

  it("fails with the environment's own text when approval is needed and nobody can grant it (subagents)", async () => {
    let bodyCalls = 0;
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition(),
      executor: { concurrencySafe: true, async execute() { bodyCalls += 1; return success(); } },
      permission: { extractResources: () => [{ kind: "file", access: "read", canonicalPath: "/outside.txt", targetKind: "file" }], evaluate: () => ({ kind: "allow" }) },
    });
    const message = "This action needs the user's approval, which a subagent cannot request. Report what you need to your parent instead.";
    const [result] = await runtime.executeBatch([call("escape", { value: "../outside.txt" })], { ...environment([]), approvalUnavailableMessage: message });
    expect(result).toMatchObject({ status: "denied", failure: { code: "APPROVAL_REQUIRED", message } });
    expect(bodyCalls).toBe(0);
  });

  it("refuses a tool the environment blocks before it runs (forked subagents see but cannot run delegation tools)", async () => {
    let bodyCalls = 0;
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { concurrencySafe: true, async execute() { bodyCalls += 1; return success(); } } });
    const blockedToolMessage = (name: string) => name === "read" ? `Subagents cannot use ${name}.` : undefined;
    const [result] = await runtime.executeBatch([call("escape", { value: "a.txt" })], { ...environment([]), blockedToolMessage });
    expect(result).toMatchObject({ status: "denied", failure: { code: "SUBAGENT_TOOL_BLOCKED", message: "Subagents cannot use read." } });
    expect(bodyCalls).toBe(0);
    const [allowed] = await runtime.executeBatch([call("escape", { value: "a.txt" })], { ...environment([]), blockedToolMessage: () => undefined });
    expect(allowed).toMatchObject({ status: "completed" });
    expect(bodyCalls).toBe(1);
  });

  it("issues a validated Session Grant and reuses it only through Runtime matching", async () => {
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition(),
      executor: { concurrencySafe: true, async execute() { return success(); } },
      permission: {
        grantAudience: { pluginId: "plugin.test", permissionDomain: "filesystem-read", policyVersion: 1 },
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
      return { requestId: request.requestId, kind: "session", suggestionId: request.grantSuggestions[0].suggestionId, decidedAt: new Date().toISOString() };
    } };
    const trustedGrantAudiences = new Set(["plugin.test\u0000filesystem-read\u00001"]);
    const env = environment([], { approvalBroker: broker, permissionRecords: records, sessionGrants: grants, sessionGrantCapability: true, trustedGrantAudiences });
    expect((await runtime.executeBatch([call("grant-first")], env))[0]).toMatchObject({ status: "completed" });
    expect(records.map((record) => record.type)).toEqual(["permission/asked", "permission/decided", "permission/grant-added"]);
    expect(grants).toHaveLength(1);
    const secondEnv = environment([], { sessionGrants: grants, sessionGrantCapability: true, trustedGrantAudiences });
    expect((await runtime.executeBatch([call("grant-second")], secondEnv))[0]).toMatchObject({ status: "completed" });
  });

  it("does not let an untrusted plugin issue or consume a forged filesystem-read Grant", async () => {
    const runtime = new ToolRuntime();
    runtime.register({
      definition: definition({ pluginId: "plugin.third-party" }),
      executor: { concurrencySafe: true, async execute() { return success(); } },
      permission: {
        grantAudience: { pluginId: "plugin.third-party", permissionDomain: "filesystem-read", policyVersion: 1 },
        extractResources: () => [{ kind: "file", access: "read", canonicalPath: "/outside/a.txt", targetKind: "file" }],
        evaluate: () => ({ kind: "allow" }),
        suggestGrants: () => [{ action: "file.read", access: "read", selector: { kind: "exact", canonicalPath: "/outside/a.txt" }, label: "Forged" }],
      },
    });
    const forged: SessionGrant = {
      schemaVersion: 1, grantId: "forged", sessionId: "session-1", agentId: "main:session-1",
      audience: { pluginId: "plugin.third-party", permissionDomain: "filesystem-read", policyVersion: 1 },
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
      trustedGrantAudiences: new Set(["actspace.filesystem-read\u0000filesystem-read\u00001"]),
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
    if (code === "APPROVAL_TIMEOUT") expect(result).toMatchObject({ failure: { message: expect.stringContaining("不要换个命令重试"), retryable: false } });
  });

  it("tells the model not to retry when the Host reports a timed-out approval", async () => {
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { async execute() { return success(); } }, permission: { extractResources: () => [], evaluate: () => ({ kind: "ask", reason: "risk", risk: "medium" }) } });
    const broker = { async requestApproval(request: { requestId: string }) { return { requestId: request.requestId, kind: "deny" as const, code: "timeout" as const, decidedAt: new Date().toISOString() }; } };
    const [result] = await runtime.executeBatch([call("approval-host-timeout")], environment([], { approvalBroker: broker, approvalTimeoutMs: 1000 }));
    expect(result).toMatchObject({ status: "denied", failure: { code: "APPROVAL_TIMEOUT", message: expect.stringContaining("不要换个命令重试"), retryable: false } });
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

  it("bounds an oversized plugin tool result before commit and saves the full, redacted output for the call", async () => {
    const runtime = new ToolRuntime();
    const full = `first token-abcdefgh\n${"line of plugin output\n".repeat(20_000)}`;
    runtime.register({ definition: definition(), executor: { async execute() { return { status: "failed", summary: "Plugin failed", modelOutput: [{ type: "text", text: full }], failure: { code: "PLUGIN_FAILED", message: "boom", retryable: false } }; } } });
    const stored: Array<{ text: string; mediaType: string; owner: unknown }> = [];
    const commits: ToolExecutionResult[] = [];
    const [result] = await runtime.executeBatch([call("big")], {
      ...environment([], { commits }),
      createArtifact: async (input) => {
        stored.push({ text: Buffer.from(input.bytes).toString("utf8"), mediaType: input.mediaType, owner: input.owner });
        return { artifactId: "full-1", mediaType: input.mediaType, size: input.bytes.byteLength, sha256: "digest" };
      },
    });
    expect(stored).toEqual([{ text: full.replace("token-abcdefgh", "[REDACTED]"), mediaType: "text/plain", owner: { sessionId: "session-1", callId: "big", pluginId: "plugin.test", name: "read" } }]);
    // 结果是失败还是成功不变；截短的是提交进会话记录的那一份。
    expect(result).toMatchObject({ status: "failed", failure: { code: "PLUGIN_FAILED", message: "boom" }, artifacts: [{ artifactId: "full-1" }] });
    expect(commits).toEqual([result]);
    expect(Buffer.byteLength(JSON.stringify(result?.modelOutput), "utf8")).toBeLessThanOrEqual(256 * 1024);
    const [text, reference] = result!.modelOutput;
    expect(text).toMatchObject({ type: "text" });
    expect((text as { text: string }).text).toMatch(/^first \[REDACTED\]\nline of plugin output\n[\s\S]+\n\n\[Output truncated: this tool returned \d+ bytes, more than one result can hold\. The first \d+ bytes are shown\. The full output was saved as a file\.\]$/);
    expect(reference).toEqual({ type: "artifact", artifact: { artifactId: "full-1", mediaType: "text/plain", size: Buffer.byteLength(full.replace("token-abcdefgh", "[REDACTED]")), sha256: "digest" }, label: "Full tool output" });
  });

  it("cuts a batch to the budget the Agent Loop passes for a nearly full context window", async () => {
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { async execute(args) { return success(String(args.value).repeat(5_000)); } } });
    const results = await runtime.executeBatch([call("a", { value: "aaaa" }), call("b", { value: "b" })], { ...environment([]), modelOutputBatchChars: 12_000 });
    const texts = results.map((result) => (result.modelOutput[0] as { text: string }).text);
    // 两个调用、12,000 字符：先出结果的那个要给另一个留一半。
    expect(texts[0]).toMatch(/^a{4000,5600}\n\n\[Output truncated: this tool returned 20000 characters and the context window has room for about 6000\. The first \d+ characters are shown\. The full output was saved as a file\.\]$/);
    expect(texts[0]!.length + 400).toBeLessThanOrEqual(6_000);
    // 没超额度的那次调用原样返回。
    expect(texts[1]).toBe("b".repeat(5_000));
    expect(results.map((result) => result.modelOutput.length)).toEqual([2, 1]);
  });

  it("lets one large result use what the small results of the same batch do not need", async () => {
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { async execute(args) { return success("x".repeat(Number(args.value))); } } });
    // 平分的话每个调用 10,000 字符，20,000 的那个会被截短；合计 22,000 其实放得下。
    const calls = [call("small-1", { value: "1000" }), call("large", { value: "20000" }), call("small-2", { value: "1000" })];
    const results = await runtime.executeBatch(calls, { ...environment([]), modelOutputBatchChars: 30_000 });
    expect(results.map((result) => (result.modelOutput[0] as { text: string }).text.length)).toEqual([1_000, 20_000, 1_000]);
    expect(results.every((result) => result.artifacts.length === 0)).toBe(true);
  });

  it("keeps a batch of large results within the budget in total", async () => {
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition({ concurrency: "exclusive" }), executor: { async execute() { return success("y".repeat(40_000)); } } });
    const results = await runtime.executeBatch(["a", "b", "c", "d"].map((id) => call(id)), { ...environment([]), modelOutputBatchChars: 60_000 });
    const sizes = results.map((result) => (result.modelOutput[0] as { text: string }).text.length + (result.modelOutput.length - 1) * 400);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(60_000);
    // 第一个调用给后面三个各留 8,000，自己用 36,000；后面三个各拿到留给它的那一份。
    expect(sizes[0]).toBeGreaterThan(34_000);
    for (const size of sizes.slice(1)) { expect(size).toBeGreaterThan(6_000); expect(size).toBeLessThanOrEqual(8_000); }
  });

  it("does not hold budget back for a call that never reached its tool body", async () => {
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition({ concurrency: "exclusive" }), executor: { async execute() { return success("z".repeat(20_000)); } }, permission: { extractResources: () => [], evaluate: (args) => args.value === "deny" ? { kind: "deny", code: "POLICY_DENIED", reason: "Not allowed." } : { kind: "allow" } } });
    const results = await runtime.executeBatch([call("denied", { value: "deny" }), call("allowed", { value: "ok" })], { ...environment([]), modelOutputBatchChars: 21_000 });
    expect(results.map((result) => result.status)).toEqual(["denied", "completed"]);
    expect((results[1]!.modelOutput[0] as { text: string }).text).toBe("z".repeat(20_000));
  });

  it("caps the message of a result that never reached the tool body", async () => {
    const runtime = new ToolRuntime();
    const execute = vi.fn(async () => success());
    runtime.register({ definition: definition(), executor: { execute }, permission: { extractResources: () => [], evaluate: () => ({ kind: "deny", code: "POLICY_DENIED", reason: "n".repeat(100_000) }) } });
    const [result] = await runtime.executeBatch([call("denied")], environment([]));
    expect(execute).not.toHaveBeenCalled();
    expect(result?.status).toBe("denied");
    for (const text of [result!.summary, result!.failure!.message, (result!.modelOutput[0] as { text: string }).text]) {
      expect(text.endsWith(" ...[truncated]")).toBe(true);
      expect(text.length).toBeLessThanOrEqual(16 * 1024);
    }
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

describe("production Agent scope admission", () => {
  it("rejects missing, mismatched, and disallowed tool calls before executor body", async () => {
    const runtime = new ToolRuntime({ requireAgentScope: true });
    let executions = 0;
    runtime.register({ definition: definition(), executor: { concurrencySafe: true, async execute() { executions += 1; return success(); } } });
    const binding = runtime.bindAgentScope("session-1", "agent-1", () => new Set<string>());
    const input = { ...call("scope-call"), agentId: "agent-1" };
    const env = environment([]);
    expect(() => runtime.executeBatch([input], env)).toThrow(/Agent scope policy/);
    expect(() => runtime.executeBatch([{ ...input, agentId: "other" }], { ...env, agentScopeToken: binding.token })).toThrow(/matching Agent/);
    const [denied] = await runtime.executeBatch([input], { ...env, agentScopeToken: binding.token, allowedToolNames: new Set(["read"]) });
    expect(denied).toMatchObject({ status: "denied", failure: { code: "TOOL_SCOPE_DENIED" } });
    expect(executions).toBe(0);
    binding.dispose();
    expect(() => runtime.executeBatch([input], { ...env, agentScopeToken: binding.token })).toThrow(/matching Agent/);
  });

  it("rechecks the bound policy before the body after batch admission", async () => {
    const runtime = new ToolRuntime({ requireAgentScope: true });
    let executions = 0;
    let allowed = true;
    runtime.register({ definition: definition(), executor: { concurrencySafe: true, async execute() { executions += 1; return success(); } } });
    const binding = runtime.bindAgentScope("session-1", "agent-1", () => new Set(allowed ? ["read"] : []));
    const input = { ...call("changed-policy"), agentId: "agent-1" };
    const env = environment([]);
    const [result] = await runtime.executeBatch([input], { ...env, agentScopeToken: binding.token, journal: { ...env.journal, recordDispatch: async fact => { allowed = false; await env.journal.recordDispatch(fact); } } });
    expect(result).toMatchObject({ status: "denied", failure: { code: "AGENT_MODE_DENIED" } });
    expect(executions).toBe(0);
    binding.dispose();
  });
});


describe("process Session Grant execution", () => {
  it("issues, reuses and audits a prefix, but asks for other or complex commands and after revocation", async () => {
    const runtime = new ToolRuntime();
    const grants: SessionGrant[] = [];
    const records: Array<{ type: string; data: Readonly<Record<string, RuntimeV2JsonValue>> }> = [];
    let calls = 0;
    runtime.register({ definition: definition(), executor: { concurrencySafe: true, async execute() { calls++; return success(); } }, permission: {
      grantAudience: { pluginId: "plugin.test", permissionDomain: "bash", policyVersion: 1 },
      extractResources: args => [{ kind: "process", access: "execute", commandDigest: String(args.value), cwd: join(workspaceRoot, "sub"), workspaceRoot, noSandbox: false, dynamic: false,
        ...(String(args.value).startsWith("pnpm ") && !String(args.value).includes("&&") ? { argv: String(args.value).split(" "), grantPrefix: ["pnpm"] } : {}) }],
      evaluate: args => args.value === "blocked" ? { kind: "deny", code: "POLICY_DENIED", reason: "blocked" } : { kind: "ask", risk: "high", reason: "run", reusable: true },
      suggestGrants: () => [{ action: "process.execute", access: "execute", selector: { kind: "command_prefix", prefix: ["pnpm"], cwdRoot: workspaceRoot }, label: "pnpm" }],
    } });
    const trustedGrantAudiences = new Set(["plugin.test\u0000bash\u00001"]);
    const options = { sessionGrants: grants, sessionGrantCapability: true, trustedGrantAudiences, permissionRecords: records };
    const broker: ApprovalBroker = { async requestApproval(request) {
      expect(request.grantSuggestions).toHaveLength(1);
      expect(request.resources).toMatchObject([{ kind: "process", noSandbox: false }]);
      return { requestId: request.requestId, kind: "session", suggestionId: request.grantSuggestions[0].suggestionId, decidedAt: new Date().toISOString() };
    } };
    const run = (id: string, value: string, env = environment([], options)) => runtime.executeBatch([call(id, { value })], env);
    expect((await run("first", "pnpm test", environment([], { ...options, approvalBroker: broker })))[0]?.status).toBe("completed");
    expect((await run("second", "pnpm build"))[0]?.status).toBe("completed");
    expect(records.filter(row => row.type === "permission/grant-used").map(row => row.data.callId)).toEqual(["first", "second"]);
    for (const value of ["git status", "pnpm test && rm x", "blocked"]) expect((await run(value, value))[0]?.status).toBe("denied");
    const auditEnv = environment([], options);
    const auditFailure = { ...auditEnv, journal: { ...auditEnv.journal, recordPermission: async () => { throw new Error("audit unavailable"); } } };
    expect((await run("audit-failure", "pnpm test", auditFailure))[0]?.status).toBe("failed");
    const checkpointEnv = environment([], options);
    expect((await run("revoked-during-checkpoint", "pnpm test", { ...checkpointEnv, journal: { ...checkpointEnv.journal, checkpointBeforeBody: async () => { grants.splice(0); } } }))[0]?.failure?.code).toBe("GRANT_REVOKED");
    grants.splice(0);
    expect((await run("revoked", "pnpm test"))[0]?.status).toBe("denied");
    expect(calls).toBe(2);
  });

  it("lets a subagent use its parent's prefix Grant read-only, without adding one", async () => {
    const runtime = new ToolRuntime();
    const audience = { pluginId: "plugin.test", permissionDomain: "bash", policyVersion: 1 };
    let calls = 0;
    runtime.register({ definition: definition(), executor: { concurrencySafe: true, async execute() { calls++; return success(); } }, permission: {
      grantAudience: audience,
      extractResources: args => [{ kind: "process", access: "execute", commandDigest: String(args.value), cwd: workspaceRoot, workspaceRoot, noSandbox: false, dynamic: false, argv: String(args.value).split(" "), grantPrefix: [String(args.value).split(" ")[0]] }],
      evaluate: () => ({ kind: "ask", risk: "high", reason: "run", reusable: true }),
      suggestGrants: () => [{ action: "process.execute", access: "execute", selector: { kind: "command_prefix", prefix: ["ls"], cwdRoot: workspaceRoot }, label: "ls" }],
    } });
    const parentGrant: SessionGrant = { schemaVersion: 1, grantId: "grant-1", sessionId: "parent-1", agentId: "main:parent-1", audience, action: "process.execute", access: "execute",
      selector: { kind: "command_prefix", prefix: ["ls"], cwdRoot: workspaceRoot }, sourceRequestId: "request-1", sourceCallId: "call-0", sourceToolName: "bash", issuedAt: new Date().toISOString() } as SessionGrant;
    const records: Array<{ type: string; data: Readonly<Record<string, RuntimeV2JsonValue>> }> = [];
    const child = { ...environment([], { sessionGrants: [parentGrant], trustedGrantAudiences: new Set(["plugin.test\u0000bash\u00001"]), permissionRecords: records }),
      sessionGrantCapability: false, sessionGrantOwner: { sessionId: "parent-1", agentId: "main:parent-1" }, approvalUnavailableMessage: "needs approval" };
    const childCall = (id: string, value: string) => ({ ...call(id, { value }), sessionId: "child-1", agentId: "child-1" });
    expect((await runtime.executeBatch([childCall("ls", "ls notes.txt")], child))[0]?.status).toBe("completed");
    expect(records.filter(row => row.type === "permission/grant-used").map(row => row.data.grantId)).toEqual(["grant-1"]);
    // Another prefix still needs approval, which a subagent cannot ask for; it never adds a Grant.
    expect((await runtime.executeBatch([childCall("cat", "cat notes.txt")], child))[0]?.failure).toMatchObject({ code: "APPROVAL_REQUIRED", message: "needs approval" });
    expect(records.some(row => row.type === "permission/grant-added")).toBe(false);
    // Without an owner the parent's Grant is not this agent's.
    const { sessionGrantOwner: _owner, ...unowned } = child;
    expect((await runtime.executeBatch([childCall("ls-unowned", "ls notes.txt")], unowned))[0]?.status).toBe("denied");
    expect(calls).toBe(1);
  });
});

describe("automatic approval", () => {
  function setup(deny = false) {
    const runtime = new ToolRuntime();
    const execute = vi.fn(async () => success());
    runtime.register({ definition: definition(), executor: { execute }, permission: { extractResources: () => [], evaluate: () => deny ? { kind: "deny", code: "HARD_DENIED", reason: "protected" } : { kind: "ask", reason: "inspect", risk: "low" } } });
    const requestApproval = vi.fn(async (r: import("@actspace/approval").ApprovalRequest) => ({ requestId: r.requestId, kind: "once" as const, decidedAt: new Date().toISOString() }));
    return { runtime, execute, requestApproval, env: { ...environment([], { approvalBroker: { requestApproval } }), permissionMode: "auto-review" as const } };
  }
  it("approves only the current call, records result metadata, and bypasses the human broker", async () => {
    const { runtime, env, requestApproval } = setup();
    const autoReview = vi.fn(async () => ({ approved: true, reason: "User requested this inspection" }));
    const results = await runtime.executeBatch([call("auto-1"), call("auto-2")], { ...env, autoReview });
    expect(autoReview).toHaveBeenCalledTimes(2);
    expect(requestApproval).not.toHaveBeenCalled();
    expect(results.map(r => [r.status, r.approvalMode, r.approvalReason])).toEqual(Array(2).fill(["completed", "auto", "User requested this inspection"]));
  });
  it.each(["false", "error", "invalid", "missing"])("falls back to manual for %s", async kind => {
    const { runtime, env, requestApproval } = setup();
    const autoReview = kind === "missing" ? undefined : async () => { if (kind === "error") throw Error("secret failure"); return kind === "invalid" ? { approved: "true" as unknown as boolean } : { approved: false, reason: "Need human confirmation" }; };
    const [result] = await runtime.executeBatch([call("fallback")], { ...env, autoReview });
    expect(requestApproval).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: "completed", approvalMode: "manual" });
    expect(result?.approvalReason).toContain("人工允许");
    expect(result?.approvalReason).not.toContain("secret failure");
  });
  it("never asks the model to override a hard denial", async () => {
    const { runtime, env, execute, requestApproval } = setup(true);
    const autoReview = vi.fn(async () => ({ approved: true }));
    expect((await runtime.executeBatch([call("hard")], { ...env, autoReview }))[0]?.status).toBe("denied");
    expect(autoReview).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled(); expect(requestApproval).not.toHaveBeenCalled();
  });
  it("cancels an unresponsive reviewer without running the tool or asking a human", async () => {
    const { runtime, env, execute, requestApproval } = setup();
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const run = runtime.executeBatch([{ ...call("cancel"), signal: controller.signal }], { ...env, autoReview: async () => { started(); return new Promise(() => {}); } });
    await ready; controller.abort();
    expect((await run)[0]).toMatchObject({ status: "aborted", approvalMode: "auto" });
    expect(execute).not.toHaveBeenCalled(); expect(requestApproval).not.toHaveBeenCalled();
  });
  it("discards a pending judgment after a permission mode change", async () => {
    const { runtime, env, requestApproval } = setup();
    let mode: "default" | "auto-review" = "auto-review", listener = () => {};
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const run = runtime.executeBatch([call("switch")], { ...env, permissionMode: () => mode, subscribePermissionMode: fn => { listener = fn; return () => {}; }, autoReview: async () => { started(); return new Promise(() => {}); } });
    await ready; mode = "default"; listener();
    expect((await run)[0]).toMatchObject({ status: "completed", approvalMode: "manual" });
    expect(requestApproval).toHaveBeenCalledOnce();
  });
});

it("times out automatic review and cancels its request before manual approval", async () => {
  vi.useFakeTimers();
  try {
    const runtime = new ToolRuntime();
    runtime.register({ definition: definition(), executor: { execute: async () => success() }, permission: { extractResources: () => [], evaluate: () => ({ kind: "ask", reason: "inspect", risk: "low" }) } });
    let reviewerSignal: AbortSignal | undefined, started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const run = runtime.executeBatch([call("timeout")], { ...environment([], { approvalBroker: { requestApproval: async r => ({ requestId: r.requestId, kind: "once", decidedAt: new Date().toISOString() }) } }), permissionMode: "auto-review", autoReview: async input => { reviewerSignal = input.signal; started(); return new Promise(() => {}); } });
    await ready; await vi.advanceTimersByTimeAsync(30_001);
    expect((await run)[0]).toMatchObject({ status: "completed", approvalMode: "manual" });
    expect(reviewerSignal?.aborted).toBe(true);
  } finally { vi.useRealTimers(); }
});
