import { createHash, randomUUID } from "node:crypto";
import type { ApprovalReason, ApprovalResourceSummary, GrantAudience, GrantSuggestion, PermissionMode, RuntimeV2JsonValue, SessionGrant } from "@actspace/shared/runtime-v2";
import type { ToolActivationLease } from "./activation-lease.js";
import { materializeToolArguments } from "./argument-validator.js";
import type { ApprovalBroker, ApprovalRequest } from "@actspace/tools-approval";
import { canonicalJson } from "./definition.js";
import type { ToolArtifactOwner, ToolArtifactRef, ToolBodyResult, ToolCapabilitySet, ToolExecutionContext, ToolMiddlewareContext, ToolProgressUpdate } from "./executor.js";
import { enforceCoreToolGuards } from "./core-guards.js";
import { ToolRuntimeError, type ToolFailure } from "./errors.js";
import type { OrderedCommitSlot } from "./ordered-commit.js";
import { sortToolContributions } from "./contributions.js";
import { redactToolText, redactToolValue } from "./redaction.js";
import type { CapturedToolRegistration } from "./registry.js";
import type { ToolExecutionResult } from "./result.js";
import type { CordisContext } from "@actspace/cordis-adapter";
import { waterfallDispatch } from "@actspace/cordis-adapter";
import { canonicalizeFileResource, combinePermissionDecisions, evaluateGlobalBoundary, isPathWithin, sessionGrantsCoverResources, type OnceApproval, type ToolGrantSuggestion, type ToolPermissionDecision, type ToolResource } from "./permission/index.js";

export type ToolCallInput = {
  readonly callId: string;
  readonly name: string;
  readonly arguments: unknown;
  readonly sessionId: string;
  readonly agentId?: string;
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
  recordPermission?(type: "permission/asked" | "permission/decided" | "permission/scope-denied" | "permission/grant-added" | "permission/grant-revoked", data: Readonly<Record<string, RuntimeV2JsonValue>>): Promise<void>;
}

export type ToolPreparedEnvironment = {
  readonly resolveArtifact?: import("./executor.js").SessionArtifactResolver;
  readonly workspaceRoot: string;
  readonly permissionMode?: PermissionMode | (() => PermissionMode);
  readonly permissionModeExplicit?: boolean;
  readonly hostCapabilities: ReadonlySet<string>;
  readonly capabilitySet: ToolCapabilitySet;
  readonly approvalBroker?: ApprovalBroker;
  readonly approvalTimeoutMs?: number;
  readonly sessionGrants?: readonly SessionGrant[] | (() => readonly SessionGrant[]);
  readonly sessionGrantCapability?: boolean;
  readonly trustedGrantAudiences?: ReadonlySet<string>;
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
  #resources: readonly ToolResource[] = [];
  #onceApproval: OnceApproval | undefined;
  #admittedBySessionGrant = false;

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
      enforceCoreToolGuards({
        definition: this.registration.definition,
        args: this.#args,
        hostCapabilities: this.environment.hostCapabilities,
        lease: this.#lease,
        signal: this.#controller.signal,
        executorConcurrencySafe: this.registration.executor.concurrencySafe === true,
      });
      const mode = this.#permissionMode();
      this.#resources = Object.freeze(await this.registration.permission.extractResources(this.#args, {
        workspaceRoot: this.environment.workspaceRoot,
        canonicalizeFile: (path, access) => canonicalizeFileResource(path, access, this.environment.workspaceRoot),
      }));
      const global = evaluateGlobalBoundary(mode, this.environment.workspaceRoot, this.#resources);
      const tool = await this.registration.permission.evaluate(this.#args, this.#resources, {
        mode,
        workspaceRoot: this.environment.workspaceRoot,
        hostCapabilities: [...this.environment.hostCapabilities].sort(),
      });
      const globalWithGrant = this.#resolveGlobalGrant(global, tool);
      const permission = combinePermissionDecisions(globalWithGrant, tool);
      if (permission.kind === "deny") {
        await this.#recordPermission("permission/scope-denied", { callId: this.callId, code: permission.code, reason: permission.reason });
        return this.#rememberTerminal(this.#failureResult("denied", { code: permission.code || "POLICY_DENIED", message: permission.reason, retryable: false, phase: "policy" }));
      }
      if (permission.kind === "ask") {
        const approval = await this.#requestApproval(permission.reasons.map(({ code, message, risk, reusable }) => ({ code, message, risk, reusable })));
        if (!isOnceApproval(approval)) return this.#rememberTerminal(this.#failureResult("denied", approval));
        this.#onceApproval = approval;
      }
      await this.#recheck(mode);
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
      permissionMode: this.#permissionMode(),
      admittedResources: this.#resources,
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

  async #requestApproval(reasons: readonly RuntimeApprovalReason[]): Promise<OnceApproval | ToolFailure> {
    if (this.environment.approvalBroker === undefined) {
      return { code: "APPROVAL_REQUIRED", message: "Host approval is required but no ApprovalBroker is available.", retryable: false, phase: "approval" };
    }
    const requestedAt = new Date();
    const expiresAt = new Date(requestedAt.getTime() + (this.environment.approvalTimeoutMs ?? 10 * 60_000));
    const normalizedArgsDigest = createHash("sha256").update(canonicalJson(this.#args)).digest("hex");
    const grantSuggestions = await this.#grantSuggestions(reasons);
    const request: ApprovalRequest = {
      schemaVersion: 1,
      requestId: randomUUID(),
      callId: this.callId,
      sessionId: this.input.sessionId,
      agentRunId: this.input.agentRunId,
      agentId: this.input.agentId ?? `main:${this.input.sessionId}`,
      pluginId: this.pluginId,
      toolName: this.name,
      definitionDigest: this.definitionDigest,
      normalizedArgsDigest,
      reasons: reasons.map(({ code, message, risk }) => ({ code, message, risk })),
      resources: this.#resources.map(summarizeResource),
      grantSuggestions,
      supportedLifetimes: grantSuggestions.length === 0 ? ["once"] : ["once", "session"],
      requestedAt: requestedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    await this.#recordPermission("permission/asked", request as unknown as Readonly<Record<string, RuntimeV2JsonValue>>);
    try {
      const decision = await withTimeout(this.environment.approvalBroker.requestApproval(request, this.#controller.signal), this.environment.approvalTimeoutMs ?? 10 * 60_000);
      if (decision.requestId !== request.requestId) {
        await this.#recordPermission("permission/decided", { requestId: request.requestId, kind: "deny", code: "invalid-decision", decidedAt: new Date().toISOString() });
        return { code: "APPROVAL_STALE", message: "Approval response does not match this request.", retryable: false, phase: "approval" };
      }
      if (new Date(decision.decidedAt).getTime() > expiresAt.getTime()) {
        await this.#recordPermission("permission/decided", { requestId: request.requestId, kind: "deny", code: "timeout", decidedAt: new Date().toISOString() });
        return { code: "APPROVAL_STALE", message: "Approval response arrived after the request expired.", retryable: false, phase: "approval" };
      }
      if (decision.kind === "session") {
        const suggestion = grantSuggestions.find((candidate) => candidate.suggestionId === decision.suggestionId);
        if (suggestion === undefined) {
          await this.#recordPermission("permission/decided", { requestId: request.requestId, kind: "deny", code: "invalid-decision", decidedAt: new Date().toISOString() });
          return { code: "APPROVAL_INVALID", message: "Approval selected an unknown grant suggestion.", retryable: false, phase: "approval" };
        }
        await this.#recordPermission("permission/decided", decision as unknown as Readonly<Record<string, RuntimeV2JsonValue>>);
        const grant: SessionGrant = {
          schemaVersion: 1,
          grantId: randomUUID(),
          sessionId: request.sessionId,
          agentId: request.agentId,
          audience: suggestion.audience,
          action: suggestion.action,
          access: suggestion.access,
          selector: suggestion.selector,
          sourceRequestId: request.requestId,
          sourceCallId: request.callId,
          sourceToolName: request.toolName,
          issuedAt: decision.decidedAt,
        };
        await this.#recordPermission("permission/grant-added", grant as unknown as Readonly<Record<string, RuntimeV2JsonValue>>);
        this.#admittedBySessionGrant = true;
      } else {
        await this.#recordPermission("permission/decided", decision as unknown as Readonly<Record<string, RuntimeV2JsonValue>>);
      }
      if (decision.kind !== "once" && decision.kind !== "session") return { code: decision.code === "broker-unavailable" ? "APPROVAL_REQUIRED" : "APPROVAL_DENIED", message: decision.code, retryable: false, phase: "approval" };
      return { kind: "once", requestId: request.requestId, callId: this.callId, sessionId: this.input.sessionId, agentRunId: this.input.agentRunId, pluginId: this.pluginId, toolName: this.name, definitionDigest: this.definitionDigest, normalizedArgsDigest, issuedAt: decision.decidedAt, expiresAt: request.expiresAt };
    } catch (error) {
      await this.#recordPermission("permission/decided", { requestId: request.requestId, kind: "deny", code: this.#controller.signal.aborted ? "aborted" : "timeout", decidedAt: new Date().toISOString() });
      return { code: "APPROVAL_TIMEOUT", message: this.#controller.signal.aborted ? "Approval was aborted." : "Approval timed out.", retryable: true, phase: "approval" };
    }
  }

  async #recheck(expectedMode: PermissionMode): Promise<void> {
    enforceCoreToolGuards({ definition: this.registration.definition, args: this.#args ?? {}, hostCapabilities: this.environment.hostCapabilities, lease: this.#lease, signal: this.#controller.signal, executorConcurrencySafe: this.registration.executor.concurrencySafe === true });
    if (this.#permissionMode() !== expectedMode) throw new ToolRuntimeError({ code: "PERMISSION_STATE_CHANGED", message: "Permission mode changed while approval was pending.", retryable: true, phase: "guard" });
    const resources = Object.freeze(await this.registration.permission.extractResources(this.#args ?? {}, { workspaceRoot: this.environment.workspaceRoot, canonicalizeFile: (path, access) => canonicalizeFileResource(path, access, this.environment.workspaceRoot) }));
    if (canonicalJson(resources) !== canonicalJson(this.#resources)) throw new ToolRuntimeError({ code: "RESOURCE_SCOPE_CHANGED", message: "Tool resources changed while approval was pending.", retryable: true, phase: "guard" });
    if (this.#admittedBySessionGrant) {
      const audience = this.registration.permission.grantAudience;
      if (!this.#isTrustedGrantAudience(audience) || !sessionGrantsCoverResources(this.#sessionGrants(), this.#resources, { sessionId: this.input.sessionId, agentId: this.input.agentId ?? `main:${this.input.sessionId}`, audience })) throw new ToolRuntimeError({ code: "GRANT_REVOKED", message: "The selected Session Grant no longer covers this call.", retryable: true, phase: "approval" });
    }
    if (this.#onceApproval !== undefined) {
      if (this.#onceApproval.consumedAt !== undefined || Date.now() > new Date(this.#onceApproval.expiresAt).getTime()) throw new ToolRuntimeError({ code: "APPROVAL_STALE", message: "One-time approval is no longer valid.", retryable: false, phase: "approval" });
      this.#onceApproval.consumedAt = new Date().toISOString();
    }
  }

  #permissionMode(): PermissionMode {
    const value = this.environment.permissionMode;
    return typeof value === "function" ? value() : value ?? "default";
  }

  async #recordPermission(type: "permission/asked" | "permission/decided" | "permission/scope-denied" | "permission/grant-added" | "permission/grant-revoked", data: Readonly<Record<string, RuntimeV2JsonValue>>): Promise<void> {
    await this.environment.journal.recordPermission?.(type, data);
  }

  #sessionGrants(): readonly SessionGrant[] {
    const grants = this.environment.sessionGrants;
    return typeof grants === "function" ? grants() : grants ?? [];
  }

  #resolveGlobalGrant(global: ReturnType<typeof evaluateGlobalBoundary>, tool: ToolPermissionDecision): ReturnType<typeof evaluateGlobalBoundary> {
    if (global.kind !== "ask" || tool.kind !== "allow" || !this.environment.sessionGrantCapability) return global;
    const audience = this.registration.permission.grantAudience;
    if (!this.#isTrustedGrantAudience(audience) || global.reasons.some((reason) => !reason.reusable)) return global;
    if (!sessionGrantsCoverResources(this.#sessionGrants(), this.#resources, { sessionId: this.input.sessionId, agentId: this.input.agentId ?? `main:${this.input.sessionId}`, audience })) return global;
    this.#admittedBySessionGrant = true;
    return { kind: "pass" };
  }

  async #grantSuggestions(reasons: readonly RuntimeApprovalReason[]): Promise<readonly GrantSuggestion[]> {
    if (!this.environment.sessionGrantCapability || reasons.some((reason) => !reason.reusable)) return [];
    const audience = this.registration.permission.grantAudience;
    const suggest = this.registration.permission.suggestGrants;
    if (!this.#isTrustedGrantAudience(audience) || suggest === undefined) return [];
    const drafts = await suggest(this.#args ?? {}, this.#resources, { mode: this.#permissionMode(), workspaceRoot: this.environment.workspaceRoot, hostCapabilities: [...this.environment.hostCapabilities].sort() });
    return Object.freeze(drafts.filter((draft) => validGrantDraft(draft, this.#resources)).map((draft) => Object.freeze({ ...draft, suggestionId: randomUUID(), lifetime: "session" as const, audience })));
  }

  #isTrustedGrantAudience(audience: GrantAudience | undefined): audience is GrantAudience {
    return audience !== undefined
      && audience.pluginId === this.pluginId
      && this.environment.trustedGrantAudiences?.has(grantAudienceKey(audience)) === true;
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

function summarizeResource(resource: ToolResource): ApprovalResourceSummary {
  return resource.kind === "file"
    ? { kind: "file", access: resource.access, path: redactToolText(resource.canonicalPath), targetKind: resource.targetKind }
    : { kind: "process", access: "execute", commandDigest: resource.commandDigest, cwd: redactToolText(resource.cwd), dynamic: resource.dynamic };
}

function isOnceApproval(value: OnceApproval | ToolFailure): value is OnceApproval {
  return "kind" in value && value.kind === "once";
}

function validGrantDraft(draft: ToolGrantSuggestion, resources: readonly ToolResource[]): boolean {
  if (draft.action !== "file.read" && draft.action !== "file.write") return false;
  if (draft.access !== (draft.action === "file.read" ? "read" : "write")) return false;
  if (resources.length === 0 || resources.some((resource) => resource.kind !== "file" || resource.access !== draft.access)) return false;
  const selector = draft.selector;
  if (selector.kind === "exact") return resources.every((resource) => resource.kind === "file" && resource.canonicalPath === selector.canonicalPath);
  return resources.every((resource) => resource.kind === "file" && isPathWithin(selector.canonicalRoot, resource.canonicalPath));
}

type RuntimeApprovalReason = ApprovalReason & { readonly reusable: boolean };

function grantAudienceKey(audience: GrantAudience): string {
  return `${audience.pluginId}\u0000${audience.permissionDomain}\u0000${audience.policyVersion}`;
}
