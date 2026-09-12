import { createHash, randomUUID } from "node:crypto";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolActivationLease } from "./activation-lease.js";
import { materializeToolArguments } from "./argument-validator.js";
import type { ApprovalBroker, ApprovalRequest } from "@actspace/tools-approval";
import { canonicalJson } from "./definition.js";
import type { ToolArtifactOwner, ToolArtifactRef, ToolBodyResult, ToolCapabilitySet, ToolExecutionContext, ToolMiddlewareContext, ToolProgressUpdate } from "./executor.js";
import { enforceCoreToolGuards } from "./core-guards.js";
import { ToolRuntimeError, type ToolFailure } from "./errors.js";
import type { OrderedCommitSlot } from "./ordered-commit.js";
import { evaluateToolPolicies, sortToolContributions } from "./policy.js";
import { redactToolText, redactToolValue } from "./redaction.js";
import type { CapturedToolRegistration } from "./registry.js";
import type { ToolExecutionResult } from "./result.js";
import type { CordisContext } from "@actspace/cordis-adapter";
import { waterfallDispatch } from "@actspace/cordis-adapter";

export type ToolCallInput = {
  readonly callId: string;
  readonly name: string;
  readonly arguments: unknown;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly signal?: AbortSignal;
};

export type ToolDispatchFact = {
  readonly callId: string;
  readonly pluginId: string;
  readonly name: string;
  readonly registrationId: string;
  readonly definitionVersion: number;
  readonly definitionDigest: string;
};

export interface ToolJournalPort {
  recordDispatch(fact: ToolDispatchFact): Promise<void>;
  checkpointBeforeBody(): Promise<void>;
  commitResult(result: ToolExecutionResult): Promise<void>;
}

export type ToolPreparedEnvironment = {
  readonly resolveArtifact?: import("./executor.js").SessionArtifactResolver;
  readonly workspaceRoot: string;
  readonly hostCapabilities: ReadonlySet<string>;
  readonly capabilitySet: ToolCapabilitySet;
  readonly approvalBroker?: ApprovalBroker;
  readonly approvalTimeoutMs?: number;
  readonly journal: ToolJournalPort;
  readonly onExecutionStarted?: (call: { readonly callId: string; readonly name: string }) => void;
  readonly reportProgress?: (update: ToolProgressUpdate & {
    readonly sessionId: string;
    readonly agentRunId: string;
    readonly turnId: string;
    readonly stepId: string;
    readonly callId: string;
    readonly pluginId: string;
    readonly name: string;
  }) => void;
  readonly notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>;
  /** Cordis scope carrier shared with the owning Agent Loop. */
  readonly eventCarrier?: object;
  readonly createArtifact: (input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly owner: ToolArtifactOwner;
  }) => Promise<ToolArtifactRef>;
  readonly context?: CordisContext;
};

export type PreparedDispatch =
  | { readonly kind: "body" }
  | { readonly kind: "terminal"; readonly result: ToolExecutionResult };

export class PreparedToolExecution {
  readonly pluginId: string;
  readonly name: string;
  readonly callId: string;
  readonly registrationId: string;
  readonly definitionVersion: number;
  readonly definitionDigest: string;
  readonly concurrency: "exclusive" | "parallel";
  readonly #controller = new AbortController();
  readonly #lease: ToolActivationLease;
  #args: Readonly<Record<string, RuntimeV2JsonValue>> | undefined;
  #finalizers: Array<() => Promise<void>> = [];
  #stage: PreparedDispatch | undefined;
  #body: ToolBodyResult | undefined;
  #executed = false;
  #committed = false;
  #released = false;
  #forceOutcomeUnknown = false;

  constructor(
    private readonly registration: CapturedToolRegistration,
    private readonly input: ToolCallInput,
    private readonly environment: ToolPreparedEnvironment,
    private readonly slot: OrderedCommitSlot,
  ) {
    this.pluginId = registration.definition.pluginId;
    this.name = registration.definition.name;
    this.callId = input.callId;
    this.registrationId = registration.registrationId;
    this.definitionVersion = registration.definition.definitionVersion;
    this.definitionDigest = registration.definition.definitionDigest;
    this.#lease = registration.leaseOwner.acquire();
    this.concurrency = registration.definition.concurrency === "exclusive" ? "exclusive" : "parallel";
    if (input.signal !== undefined) {
      if (input.signal.aborted) this.#controller.abort(input.signal.reason);
      else input.signal.addEventListener("abort", () => this.#controller.abort(input.signal?.reason), { once: true });
    }
  }

  async stage(): Promise<PreparedDispatch> {
    if (this.#stage !== undefined) return this.#stage;
    try {
      this.#args = materializeToolArguments(this.registration.definition.inputSchema, this.input.arguments);
      if (this.environment.context !== undefined) {
        const transformed = await waterfallDispatch(this.environment.context, "tools/pre-execute", {
          callId: this.callId,
          name: this.name,
          args: this.#args,
          definitionDigest: this.definitionDigest,
        }, () => ({ callId: this.callId, name: this.name, args: this.#args, definitionDigest: this.definitionDigest }), this.environment.eventCarrier);
        if (isArgsPatch(transformed)) this.#args = materializeToolArguments(this.registration.definition.inputSchema, transformed.args);
      }
      const middlewareContext = this.#middlewareContext();
      for (const middleware of sortToolContributions(this.registration.middleware)) await middleware.before?.(middlewareContext);
      const policy = await evaluateToolPolicies(this.registration.policies, {
        definition: this.registration.definition,
        callId: this.callId,
        args: this.#args,
        hostCapabilities: [...this.environment.hostCapabilities].sort(),
        workspaceRoot: this.environment.workspaceRoot,
      });
      if (policy.kind === "deny") return this.#rememberTerminal(this.#failureResult("denied", { code: policy.code || "POLICY_DENIED", message: policy.reason, retryable: false, phase: "policy" }));
      if (policy.kind === "require-approval") {
        const approval = await this.#requestApproval(policy.reason, policy.risk);
        if (approval !== "allow") return this.#rememberTerminal(this.#failureResult("denied", approval));
      }
      enforceCoreToolGuards({
        definition: this.registration.definition,
        args: this.#args,
        hostCapabilities: this.environment.hostCapabilities,
        workspaceRoot: this.environment.workspaceRoot,
        resourcePaths: this.registration.resolveResourcePaths(this.#args),
        lease: this.#lease,
        signal: this.#controller.signal,
        executorConcurrencySafe: this.registration.executor.concurrencySafe === true,
      });
      await this.environment.journal.recordDispatch({ callId: this.callId, pluginId: this.pluginId, name: this.name, registrationId: this.registrationId, definitionVersion: this.definitionVersion, definitionDigest: this.definitionDigest });
      try {
        await this.environment.journal.checkpointBeforeBody();
      } catch (error) {
        return this.#rememberTerminal(this.#failureResult("failed", { code: "CHECKPOINT_FAILED", message: "Tool dispatch could not pass its durability checkpoint.", retryable: true, phase: "checkpoint" }));
      }
      this.#stage = Object.freeze({ kind: "body" });
      return this.#stage;
    } catch (error) {
      const failure = toFailure(error, this.#controller.signal.aborted ? "guard" : "prepare");
      return this.#rememberTerminal(this.#failureResult(failure.code === "TOOL_ABORTED" ? "aborted" : failure.code.includes("DENIED") ? "denied" : "failed", failure));
    }
  }

  async runBody(): Promise<ToolBodyResult> {
    const stage = await this.stage();
    if (stage.kind !== "body") throw new ToolRuntimeError({ code: "TOOL_ALREADY_EXECUTED", message: "Prepared call has no body stage.", retryable: false, phase: "body" });
    if (this.#body !== undefined) return this.#body;
    const context: ToolExecutionContext = {
      pluginId: this.pluginId,
      name: this.name,
      callId: this.callId,
      sessionId: this.input.sessionId,
      workspaceRoot: this.environment.workspaceRoot,
      agentRunId: this.input.agentRunId,
      turnId: this.input.turnId,
      stepId: this.input.stepId,
      signal: this.#controller.signal,
      capabilities: this.environment.capabilitySet,
      reportProgress: (update) => this.environment.reportProgress?.({
        ...update,
        sessionId: this.input.sessionId,
        agentRunId: this.input.agentRunId,
        turnId: this.input.turnId,
        stepId: this.input.stepId,
        callId: this.callId,
        pluginId: this.pluginId,
        name: this.name,
      }),
      ...(this.environment.notifyAgent === undefined ? {} : { notifyAgent: this.environment.notifyAgent }),
      createArtifact: (input) => this.environment.createArtifact({
        ...input,
        owner: { sessionId: this.input.sessionId, callId: this.callId, pluginId: this.pluginId, name: this.name },
      }),
      defer: (finalizer) => this.#finalizers.push(finalizer),
    };
    try {
      const invoke = async () => {
        try { this.environment.onExecutionStarted?.({ callId: this.callId, name: this.name }); } catch { /* Observers cannot affect tool execution. */ }
        return this.registration.executor.execute(this.#args ?? {}, context);
      };
      if (this.environment.context === undefined) this.#body = await invoke();
      else {
        const intercepted = await waterfallDispatch(this.environment.context, "tools/execute", { context, execute: invoke }, () => ({ context, execute: invoke }), this.environment.eventCarrier);
        this.#body = isExecutePatch(intercepted) ? await intercepted.execute() : await invoke();
      }
    } catch (error) {
      this.#body = {
        status: "failed",
        modelOutput: [{ type: "text", text: this.#controller.signal.aborted ? "Tool execution was aborted." : "Tool execution failed." }],
        summary: this.#controller.signal.aborted ? "Aborted" : "Execution failed",
        failure: { code: this.#controller.signal.aborted ? "TOOL_ABORTED" : "TOOL_EXECUTION_FAILED", message: redactToolText(error instanceof Error ? error.message : String(error)), retryable: this.#controller.signal.aborted },
      };
    }
    return this.#body;
  }

  async finalize(): Promise<ToolExecutionResult> {
    const stage = await this.stage();
    if (stage.kind === "terminal") return stage.result;
    let body = await this.runBody();
    const finalizerFailures: ToolFailure[] = [];
    for (const middleware of [...sortToolContributions(this.registration.middleware)].reverse()) {
      try {
        if (middleware.after !== undefined) body = await middleware.after(this.#middlewareContext(), body);
      } catch (error) {
        finalizerFailures.push(toFailure(error, "finalize"));
      }
    }
    if (this.environment.context !== undefined) {
      const transformed = await waterfallDispatch(this.environment.context, "tools/post-execute", body, () => body, this.environment.eventCarrier);
      if (isToolBodyResult(transformed)) body = transformed;
    }
    for (const finalizer of [...this.#finalizers].reverse()) {
      try { await finalizer(); } catch (error) { finalizerFailures.push(toFailure(error, "finalize")); }
    }
    return this.#normalizeBody(body, finalizerFailures);
  }

  async execute(): Promise<ToolExecutionResult> {
    if (this.#executed) throw new ToolRuntimeError({ code: "TOOL_ALREADY_EXECUTED", message: `Prepared tool call ${this.callId} is one-shot.`, retryable: false, phase: "prepare" });
    this.#executed = true;
    try {
      const result = await this.finalize();
      await this.commit(result);
      return result;
    } finally {
      await this.#releaseAfterUse();
    }
  }

  async commit(result: ToolExecutionResult): Promise<void> {
    if (this.#committed) throw new ToolRuntimeError({ code: "TOOL_COMMIT_FAILED", message: `Tool call ${this.callId} already committed.`, retryable: false, phase: "commit" });
    this.#committed = true;
    await this.slot.commit(() => this.environment.journal.commitResult(result));
  }

  cancel(reason: unknown, options: { readonly outcomeUnknown?: boolean } = {}): void {
    this.#forceOutcomeUnknown ||= options.outcomeUnknown === true;
    this.#controller.abort(reason);
  }

  async dispose(): Promise<void> {
    if (this.#released) return;
    if (!this.#committed) await this.slot.abandon();
    await this.#releaseAfterUse();
  }

  async #requestApproval(reason: string, risk: "low" | "medium" | "high"): Promise<"allow" | ToolFailure> {
    if (this.environment.approvalBroker === undefined) {
      return { code: "APPROVAL_REQUIRED", message: "Host approval is required but no ApprovalBroker is available.", retryable: false, phase: "approval" };
    }
    const request: ApprovalRequest = {
      requestId: randomUUID(),
      callId: this.callId,
      sessionId: this.input.sessionId,
      agentRunId: this.input.agentRunId,
      pluginId: this.pluginId,
      name: this.name,
      definitionDigest: this.definitionDigest,
      normalizedArgsDigest: createHash("sha256").update(canonicalJson(this.#args)).digest("hex"),
      requestedEffects: this.registration.definition.effects,
      reason,
      risk,
      argumentSummary: redactToolValue(this.#args ?? {}, this.registration.definition.sensitiveArgumentPaths) as Readonly<Record<string, unknown>>,
    };
    try {
      const decision = await withTimeout(this.environment.approvalBroker.requestApproval(request, this.#controller.signal), this.environment.approvalTimeoutMs ?? 30_000);
      if (decision.requestId !== request.requestId) return { code: "APPROVAL_STALE", message: "Approval response does not match this request.", retryable: false, phase: "approval" };
      return decision.decision === "allow" ? "allow" : { code: "APPROVAL_DENIED", message: decision.reason ?? "Host denied tool execution.", retryable: false, phase: "approval" };
    } catch (error) {
      return { code: "APPROVAL_TIMEOUT", message: this.#controller.signal.aborted ? "Approval was aborted." : "Approval timed out.", retryable: true, phase: "approval" };
    }
  }

  #normalizeBody(body: ToolBodyResult, finalizerFailures: readonly ToolFailure[]): ToolExecutionResult {
    const invalid = (body.status === "completed" && body.failure !== undefined) || (body.status === "failed" && body.failure === undefined);
    const failure = invalid
      ? { code: "TOOL_EXECUTION_FAILED", message: "Executor returned an invalid result envelope.", retryable: false, phase: "body" as const }
      : body.failure === undefined ? undefined : { ...body.failure, message: redactToolText(body.failure.message), phase: "body" as const };
    const status = this.#forceOutcomeUnknown ? "outcome-unknown" : this.#controller.signal.aborted ? "aborted" : invalid ? "failed" : body.status;
    const renderer = normalizeRenderer(body.renderer);
    return Object.freeze({
      status,
      callId: this.callId,
      pluginId: this.pluginId,
      name: this.name,
      registrationId: this.registrationId,
      definitionVersion: this.definitionVersion,
      definitionDigest: this.definitionDigest,
      summary: redactToolText(body.summary),
      modelOutput: Object.freeze(body.modelOutput.map((block) => block.type === "text" ? { ...block, text: redactToolText(block.text) } : block.type === "json" ? { ...block, value: redactToolValue(block.value) } : block)),
      detail: Object.freeze((body.detail ?? []).map((block) => ({ ...block, value: redactToolValue(block.value) }))),
      artifacts: Object.freeze([...(body.artifacts ?? [])]),
      ...(renderer === undefined ? {} : { renderer }),
      ...(failure === undefined ? {} : { failure }),
      finalizerFailures: Object.freeze([...finalizerFailures]),
      dispatched: true,
    });
  }

  #failureResult(status: "failed" | "denied" | "aborted", failure: ToolFailure): ToolExecutionResult {
    return Object.freeze({
      status,
      callId: this.callId,
      pluginId: this.pluginId,
      name: this.name,
      registrationId: this.registrationId,
      definitionVersion: this.definitionVersion,
      definitionDigest: this.definitionDigest,
      summary: redactToolText(failure.message),
      modelOutput: Object.freeze([{ type: "text" as const, text: redactToolText(failure.message) }]),
      detail: Object.freeze([]),
      artifacts: Object.freeze([]),
      failure: Object.freeze({ ...failure, message: redactToolText(failure.message) }),
      finalizerFailures: Object.freeze([]),
      dispatched: failure.phase === "checkpoint",
    });
  }

  #rememberTerminal(result: ToolExecutionResult): PreparedDispatch {
    this.#stage = Object.freeze({ kind: "terminal", result });
    return this.#stage;
  }

  #middlewareContext(): ToolMiddlewareContext {
    return { definition: this.registration.definition, callId: this.callId, args: this.#args ?? {} };
  }

  async #releaseAfterUse(): Promise<void> {
    if (this.#released) return;
    this.#released = true;
    this.#lease.release();
  }
}

function normalizeRenderer(renderer: ToolBodyResult["renderer"]): NonNullable<ToolBodyResult["renderer"]> | undefined {
  if (renderer === undefined || !renderer.id || !Number.isSafeInteger(renderer.schemaVersion) || renderer.schemaVersion < 1) return undefined;
  return Object.freeze({ id: redactToolText(renderer.id), schemaVersion: renderer.schemaVersion, props: redactToolValue(renderer.props) });
}

function isArgsPatch(value: unknown): value is { readonly args: Readonly<Record<string, RuntimeV2JsonValue>> } {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "args" in value && value.args !== null && typeof value.args === "object" && !Array.isArray(value.args);
}

function isToolBodyResult(value: unknown): value is ToolBodyResult {
  return value !== null && typeof value === "object" && !Array.isArray(value) && (value as { status?: unknown }).status !== undefined && Array.isArray((value as { modelOutput?: unknown }).modelOutput);
}

function isExecutePatch(value: unknown): value is { readonly execute: () => Promise<ToolBodyResult> } {
  return value !== null && typeof value === "object" && !Array.isArray(value) && typeof (value as { execute?: unknown }).execute === "function";
}

function toFailure(error: unknown, phase: ToolFailure["phase"]): ToolFailure {
  if (error instanceof ToolRuntimeError) return error.failure;
  return { code: "TOOL_EXECUTION_FAILED", message: redactToolText(error instanceof Error ? error.message : String(error)), retryable: false, phase };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
