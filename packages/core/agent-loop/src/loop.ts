import { randomUUID } from "node:crypto";
import type { RuntimeV2AgentMode, RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";
import { ContextEngine, surfaceMessage, snapshotContext, describeContextContent, estimateContextTokens, type ContextEngineOptions, type ContextSourceRegistry, type ContextSource } from "@actspace/context-engine";
import { contextFromCandidate } from "@actspace/prompt";
import type { LlmContentBlock, LlmMessage, LlmToolDefinition } from "@actspace/llm-service";
import type { LlmService } from "@actspace/llm-service";
import type { LlmStreamEvent } from "@actspace/llm-service";
import { LlmRuntimeError, redactLlmText, type LlmFailure } from "@actspace/llm-service";
import { DEFAULT_LLM_RETRY_POLICY, retryDelay, retryPolicySnapshot } from "@actspace/llm-service";
import type { RequestAssembler } from "@actspace/prompt";
import type { PreparedRequestMetadata } from "@actspace/prompt";
import type { AgentScope } from "@actspace/core-scope";
import type { SessionHandle } from "@actspace/session-persistence";
import type { ToolCallInput, ToolPreparedEnvironment } from "@actspace/tools-runtime";
import type { ToolRuntime } from "@actspace/tools-runtime";
import type { ToolExecutionResult } from "@actspace/tools-runtime";
import { allowedAgentModeTools, createAgentEventDispatcher, defaultAgentSubject, type AgentDescriptor, type AgentSubject, type AgentEventDispatcher } from "@actspace/core-agent";
import type { ContextCompactor } from "@actspace/context-engine";
import { AgentRuntimeError } from "@actspace/core-agent";
import type { MainAgentInbox } from "@actspace/core-agent";
import type { RunTurnResult } from "@actspace/core-agent";
import { type CordisContext, type AgentLoopIntervention, type AgentNotification } from "@actspace/cordis-adapter";

export type RunTurnInput = { readonly content: RuntimeV2JsonValue; readonly messageId?: string; readonly agentRunId?: string; readonly model?: string; readonly mode?: RuntimeV2AgentMode; readonly thinkingEnabled?: boolean; readonly reasoningEffort?: import("@actspace/shared").ModelReasoningEffort; readonly keepPendingOnAbort?: boolean; readonly selectedSkillIds?: readonly string[];
  /** Host wake turn: no user message; the first Step claims pending background notifications. */
  readonly wake?: boolean };
type LiveIdentity = {
  readonly parentSessionId?: string;
  readonly parentCallId?: string;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly turnId: string;
  readonly stepId?: string;
  readonly workspaceRoot?: string;
};
type StreamPayload =
  | { readonly kind: "assistant-delta"; readonly message: string }
  | { readonly kind: "reasoning-delta"; readonly message: string }
  | { readonly kind: "tool-call-delta"; readonly callId: string; readonly name: string; readonly argumentsDelta: string };
export type AgentLoopLiveEvent = LiveIdentity & (
  | (StreamPayload & { readonly requestId: string; readonly messageId: string })
  | { readonly kind: "run-state"; readonly message: string; readonly requestId?: string; readonly failure?: LlmFailure }
  | { readonly kind: "tool-prepared"; readonly requestId: string; readonly callId: string; readonly name: string; readonly arguments: RuntimeV2JsonValue }
  | { readonly kind: "tool-started"; readonly requestId: string; readonly callId: string; readonly name: string }
  | { readonly kind: "tool-finished"; readonly requestId: string; readonly callId: string; readonly name: string; readonly result: ToolExecutionResult; readonly resultEventId: string }
  | { readonly kind: "compaction-started" }
  | { readonly kind: "compaction-finished"; readonly removedCount: number; readonly durationMs: number }
  | { readonly kind: "compaction-failed"; readonly message: string }
  | { readonly kind: "inbox-claimed"; readonly messageId: string; readonly source?: import("@actspace/core-agent").InboxSource }
);
type WithoutSession<T> = T extends unknown ? Omit<T, "sessionId"> : never;

export type LoopExecutionConfiguration = Pick<RunTurnInput, "model" | "thinkingEnabled" | "reasoningEffort" | "selectedSkillIds">;
/** Host-owned queue port. claim() commits user Surface facts before returning. */
export interface LoopInputSource {
  claim(agentRunId: string): Promise<{ readonly messageIds: readonly string[]; readonly configuration: LoopExecutionConfiguration }>;
  hasPending(agentRunId: string): boolean;
}

export type AgentLoopOptions = {
  readonly descriptor: AgentDescriptor;
  readonly scope: AgentScope;
  readonly session: SessionHandle;
  readonly inbox: MainAgentInbox;
  readonly inputSource?: LoopInputSource;
  readonly observeContextToolResult?: (session: SessionHandle, event: import("@actspace/session-journal").SessionEventEnvelopeV1) => Promise<void>;
  readonly contextSources?: ContextSourceRegistry;
  readonly contextExtensions?: () => readonly ContextSource[];
  readonly createContextEngine?: (options: ContextEngineOptions) => ContextEngine;
  readonly assembler?: RequestAssembler;
  readonly modeRuntime?: (mode: RuntimeV2AgentMode) => Promise<{ readonly assembler?: RequestAssembler; readonly compaction?: ContextCompactor }>;
  readonly llm: LlmService;
  readonly tools: ToolRuntime;
  readonly toolEnvironment: (session: SessionHandle) => Omit<ToolPreparedEnvironment, "journal">;
  readonly compositionDigest: string;
  readonly hostCapabilityDigest: string;
  readonly host: RuntimeV2HostDescriptor;
  readonly allowedToolNames?: ReadonlySet<string>;
  readonly toolScopeToken?: object;
  readonly compaction?: ContextCompactor;
  readonly onLiveEvent?: (event: AgentLoopLiveEvent) => void;
  /** Real Cordis context used by the DSH-native assembly path. */
  readonly context?: CordisContext;
  /** Live subject fused with this Agent scope for all Agent events. */
  readonly agentSubject?: AgentSubject;
};

export class AgentLoop {
  readonly #events: AgentEventDispatcher;
  #active: AbortController | null = null;
  #idle: Promise<void> | null = null;
  #resolveIdle: (() => void) | null = null;
  #accepting = true;
  constructor(private readonly options: AgentLoopOptions) { this.#events = createAgentEventDispatcher(this.options.context, this.options.scope, this.options.agentSubject ?? defaultAgentSubject(this.options.scope)); }
  get active(): boolean { return this.#active !== null; }
  /** The immutable live subject shared by every dispatch from this loop. */
  get subject(): AgentSubject { return this.#events.subject; }
  async waitForIdle(): Promise<void> { await this.#idle; }
  abort(reason = "host-abort"): boolean { if (this.#active === null) return false; this.#active.abort(reason); return true; }
  quiesce(): void { this.#accepting = false; this.abort("runtime-shutdown"); }

  async runTurn(input: RunTurnInput): Promise<RunTurnResult> {
    if (!this.#accepting) throw new AgentRuntimeError("TURN_ABORTED", "Agent Loop is quiescing.");
    if (this.#active !== null) throw new AgentRuntimeError("TURN_ALREADY_ACTIVE", "This Session already has an active turn.");
    const controller = new AbortController(); this.#active = controller; this.#idle = new Promise<void>((resolve) => { this.#resolveIdle = resolve; });
    const agentRunId = input.agentRunId ?? randomUUID(); const turnId = randomUUID(); let stepCount = 0; let finalText = "";
    try {
      // A notification read by an earlier Run leaves nothing to deliver; settle without a turn.
      if (input.wake && !this.options.inbox.hasPendingNotifications()) return Object.freeze({ agentRunId, turnId, reason: "completed", steps: 0, finalText });
      this.notify("agent/session-start", { agentRunId, turnId, sessionId: this.options.session.header.sessionId });
      this.notify("agent/status", { agentRunId, turnId, status: "started" });
      this.emitLive({ kind: "run-state", agentRunId, turnId, message: "started" });
      const messageId = input.messageId ?? randomUUID();
      const mode = input.mode ?? "agent";
      let configuration: LoopExecutionConfiguration = input;
      const modeRevision = currentAgentModeRevision(this.options.session.journal.latestEvents(["agent/mode-set"]));
      const modeRuntime = await this.options.modeRuntime?.(mode);
      const assembler = modeRuntime?.assembler ?? this.options.assembler;
      const compaction = modeRuntime?.compaction ?? this.options.compaction;
      await this.options.session.append(core("turn/start", { turnId, agentRunId, mode, modeRevision }));
      const turnEnvironment = this.options.toolEnvironment(this.options.session);
      const configuredPermissionMode = typeof turnEnvironment.permissionMode === "function" ? turnEnvironment.permissionMode() : turnEnvironment.permissionMode ?? "default";
      if (turnEnvironment.permissionModeExplicit && currentPermissionMode(this.options.session.journal.latestEvents(["permission/mode-set"])) !== configuredPermissionMode) {
        await this.options.session.append(core("permission/mode-set", { mode: configuredPermissionMode, changedAt: new Date().toISOString(), source: "host" }));
      }
      const persistedContent = this.options.contextSources ? input.content : appendRuntimeContext(input.content, mode, modeRevision);
      if (!input.wake && !hasUserMessage(this.options.session, messageId)) await this.options.session.append(core("user/message", { messageId, agentRunId, turnId }, { surface: { kind: "append", node: { kind: "user", messageId, content: persistedContent } } }));
      // 旧 journal 的插入记录不能进入新 Run；当前用户输入仅由 Host Task 管理。
      for (const item of this.options.inbox.pending()) if (item.source === "steer" || item.target === "next-turn") await this.options.inbox.discard(item.messageId, "stale-steer");
      while (stepCount < this.options.descriptor.maxSteps) {
        if (controller.signal.aborted) throw new AgentRuntimeError("TURN_ABORTED", "Turn was aborted.");
        if (this.options.inputSource) {
          const consumed = await this.options.inputSource.claim(agentRunId);
          if (consumed.messageIds.length) configuration = consumed.configuration;
          for (const messageId of consumed.messageIds) this.emitLive({ kind: "inbox-claimed", agentRunId, turnId, messageId, source: "steer" });
        }
        const opensTurn = input.wake === true && stepCount === 0;
        for (const item of await this.options.inbox.claim({ opensTurn })) this.emitLive({ kind: "inbox-claimed", agentRunId, turnId, messageId: item.messageId, ...(item.source === undefined ? {} : { source: item.source }), ...(opensTurn && item.notice ? { notice: item.notice, content: typeof item.content === "string" ? item.content : JSON.stringify(item.content) } : {}) });
        const stepId = randomUUID(); stepCount += 1;
        const preStep = await this.waterfall("agent/pre-step", { agentRunId, turnId, stepId, stepIndex: stepCount, mode });
        this.emitLive({ kind: "run-state", agentRunId, turnId, stepId, message: "step-started" });
        await this.options.session.append(core("step/start", { turnId, stepId, agentRunId, stepIndex: stepCount, ...(isRecord(preStep) ? { metadata: preStep as RuntimeV2JsonValue } : {}) }));
        const budgetSummary = this.options.descriptor.kind === "subagent" && stepCount === this.options.descriptor.maxSteps;
        const tools = budgetSummary ? [] : this.toolDefinitions(mode);
        const visibleToolNames = new Set(tools.map((tool) => tool.name));
        let candidate = await this.candidate(assembler, {
          sessionId: this.options.session.header.sessionId,
          turnId,
          stepId,
          scope: this.options.scope,
          surface: this.options.session.journal.surface.entries.map((entry) => surfaceMessage(entry.node)),
          hostFacts: { agentRunId, agentMode: mode, hostKind: this.options.host.hostKind, invocationId: this.options.host.invocationId, workspaceRoot: this.options.session.header.cwd ?? this.options.host.workspaceRef ?? this.options.toolEnvironment(this.options.session).workspaceRoot },
          selectedSkillIds: Object.freeze(mode === "chat" ? [] : [...(configuration.selectedSkillIds ?? [])]),
        }, tools as unknown as RuntimeV2JsonValue[], { routeId: this.options.descriptor.routeId, model: configuration.model ?? this.options.descriptor.model });
        let requestId = randomUUID();
        let converted = await this.contextInput(candidate, requestId, { cacheRetention: mode === "chat" ? "long" : "short", ...(configuration.thinkingEnabled === undefined ? {} : { reasoning: configuration.thinkingEnabled }), ...(configuration.reasoningEffort === undefined ? {} : { reasoningEffort: configuration.reasoningEffort }) }, { mode, selectedSkillIds: configuration.selectedSkillIds ?? [], budgetSummary });
        let llmInput = converted.input;
        visibleToolNames.clear();
        for (const tool of llmInput.tools) visibleToolNames.add(tool.name);
        const requestMessages = Object.freeze([
          ...llmInput.messages,
          ...(budgetSummary && !this.options.contextSources ? [{ role: "user" as const, content: "Execution budget reached. No more tools are available. Summarize verified findings, unresolved questions and blockers for the parent now. Do not claim unperformed work is complete." }] : []),
        ]);
        const requestPlan = await this.waterfall("agent/request", { requestId, turnId, stepId, routeId: this.options.descriptor.routeId, model: configuration.model ?? this.options.descriptor.model, messages: requestMessages, tools: llmInput.tools });
        const requestRecord: Readonly<Record<string, unknown>> = isRecord(requestPlan) ? requestPlan : {};
        const requestRouteId = typeof requestRecord.routeId === "string" ? requestRecord.routeId : this.options.descriptor.routeId;
        const requestModel = typeof requestRecord.model === "string" ? requestRecord.model : configuration.model ?? this.options.descriptor.model;
        let requestMessageList = Array.isArray(requestRecord.messages) ? requestRecord.messages as unknown as readonly LlmMessage[] : requestMessages;
        if (this.options.contextSources && (requestRouteId !== llmInput.routeId || requestModel !== llmInput.model)) {
          candidate = { ...candidate, requestOptions: { routeId: requestRouteId, model: requestModel } };
          converted = await this.contextInput(candidate, requestId, llmInput.options, { mode, selectedSkillIds: configuration.selectedSkillIds ?? [], budgetSummary });
          llmInput = converted.input;
          requestMessageList = [...llmInput.messages.filter(message => message.role === "system"), ...requestMessageList.filter(message => message.role !== "system")];
        }
        const prepared = await this.options.llm.prepareAsync({
          requestId,
          sessionId: this.options.session.header.sessionId,
          routeId: requestRouteId,
          model: requestModel,
          messages: requestMessageList,
          tools: budgetSummary ? [] : Array.isArray(requestRecord.tools) ? requestRecord.tools as unknown as readonly LlmToolDefinition[] : llmInput.tools,
          options: llmInput.options,
          signal: controller.signal,
        });
        this.checkContextCapacity({ ...converted.input, messages: prepared.request.messages, tools: prepared.request.tools, options: prepared.request.options }, prepared.request.contextWindow ?? null, () => prepared.release());
        const retryPolicy = prepared.registration.retryPolicy ?? DEFAULT_LLM_RETRY_POLICY;
        const contextWindow = prepared.request.contextWindow ?? null;
        if (this.options.contextSources) converted = { ...converted, context: await converted.engine.recordPrepared(converted.context, { modelKey: `${prepared.request.routeId}/${prepared.request.model}`, label: prepared.request.model, contextWindow, autoCompactAtTokens: compaction?.threshold?.(contextWindow) ?? null }) };
        const metadata: PreparedRequestMetadata = { route: prepared.request.routeId, model: prepared.request.model, registrationId: prepared.registration.registrationId, adapterVersion: prepared.registration.adapter.adapterVersion, defaults: prepared.request.options as RuntimeV2JsonValue, retryPolicy: retryPolicySnapshot(retryPolicy) as unknown as RuntimeV2JsonValue, contextWindow };
        const snapshot = this.options.contextSources ? snapshotContext(converted.context, { ...llmInput, requestId, messages: prepared.request.messages, tools: prepared.request.tools, routeId: prepared.request.routeId, model: prepared.request.model }, metadata as unknown as RuntimeV2JsonValue, this.options.compositionDigest, this.options.hostCapabilityDigest, converted.input) : assembler!.finalize({ ...candidate, messages: requestMessageList.filter((message) => message.role !== "system") as unknown as readonly RuntimeV2JsonValue[] }, metadata, this.options.compositionDigest, this.options.hostCapabilityDigest);
        try {
          await converted.engine.bindRequest(converted.context);
          await this.options.session.append(core("request/header", { requestId, turnId, stepId, routeId: prepared.request.routeId, model: prepared.request.model, contextWindow, attempt: 1, agentMode: mode, agentModeRevision: modeRevision }));
          await this.options.session.append(core("request/context", { requestId, turnId, stepId, snapshot }));
          await this.checkpoint("before-llm-dispatch");
        } catch (error) { prepared.release(); throw error; }
        let output: Awaited<ReturnType<typeof collectStream>> | undefined;
        let attempt = 1;
        let activePrepared = prepared;
        while (output === undefined) {
          try {
            this.emitLive({ kind: "run-state", agentRunId, turnId, stepId, requestId, message: "request-started" });
            const stream = await this.waterfall("llm/stream", { requestId, turnId, stepId, request: activePrepared.request, signal: controller.signal }, () => activePrepared.dispatch() as unknown as Promise<Awaited<ReturnType<typeof activePrepared.dispatch>>>);
            output = await collectStream(stream as AsyncIterable<LlmStreamEvent>, controller.signal, async (event) => {
              this.emitLive({ ...event.live, agentRunId, turnId, stepId, requestId, messageId: event.messageId });
              await this.options.session.append(core("assistant/chunk", { messageId: event.messageId, chunkIndex: event.chunkIndex, requestId, turnId, stepId, kind: event.live.kind, content: event.live.kind === "tool-call-delta" ? event.live.argumentsDelta : event.live.message, ...(event.live.kind === "tool-call-delta" ? { callId: event.live.callId, name: event.live.name } : {}) }));
              this.#events.emit("llm/chunk", this.recordPayload(event.live));
            });
          } catch (error) {
            output = failedStreamOutput(normalizeLlmFailure(error, attempt));
          }
          if (output.failure === null) break;
          const recovery = await this.waterfall("agent/request-error", { requestId, turnId, stepId, attempt, failure: output.failure }, () => undefined as unknown as Readonly<Record<string, unknown>>);
          const recoveryRecord: Readonly<Record<string, unknown>> = isRecord(recovery) ? recovery : {};
          const delayOverride = typeof recoveryRecord.delayMs === "number" ? recoveryRecord.delayMs : undefined;
          const delayMs = recoveryRecord.kind === "abort" || output.aborted || output.sawObservableDelta ? null : recoveryRecord.kind === "retry" ? (delayOverride ?? retryDelay(retryPolicy, output.failure, attempt)) : retryDelay(retryPolicy, output.failure, attempt);
          if (delayMs === null) {
            // Failed partial tool calls must never enter the model surface or execute.
            const partialContent = output.content.filter(block => block.type !== "tool-call");
            const content = partialContent as unknown as RuntimeV2JsonValue;
            await this.options.session.append(core("assistant/message", { messageId: output.messageId, requestId, turnId, stepId, content, finishReason: output.aborted ? "aborted" : "failed", usage: output.usage }, partialContent.length > 0 ? { surface: { kind: "append", node: { kind: "assistant", messageId: output.messageId, content } } } : undefined));
            await this.options.session.append(core("step/end", { turnId, stepId, reason: output.aborted ? "aborted" : "failed" }));
            throw new AgentRuntimeError(output.aborted ? "TURN_ABORTED" : "AGENT_SETUP_FAILED", output.failure.message, output.failure);
          }
          const retryId = randomUUID();
          const failedRequestId = requestId;
          await this.options.session.append(core("llm/retry", { requestId: failedRequestId, retryId, attempt, nextAttempt: attempt + 1, delayMs, failure: output.failure, usage: output.usage }));
          await this.checkpoint("before-llm-dispatch");
          if (!await cancellableDelay(delayMs, controller.signal)) {
            await this.options.session.append(core("step/end", { turnId, stepId, reason: "aborted" }));
            throw new AgentRuntimeError("TURN_ABORTED", "LLM retry wait aborted.");
          }
          await this.options.session.append(core("llm/retry-started", { requestId: failedRequestId, retryId, attempt: attempt + 1 }));
          await this.checkpoint("before-llm-dispatch");
          attempt += 1;
          candidate = await this.candidate(assembler, {
            sessionId: this.options.session.header.sessionId,
            turnId,
            stepId,
            scope: this.options.scope,
            surface: this.options.session.journal.surface.entries.map((entry) => surfaceMessage(entry.node)),
            hostFacts: { agentRunId, agentMode: mode, hostKind: this.options.host.hostKind, invocationId: this.options.host.invocationId, workspaceRoot: this.options.session.header.cwd ?? this.options.host.workspaceRef ?? this.options.toolEnvironment(this.options.session).workspaceRoot },
            selectedSkillIds: Object.freeze(mode === "chat" ? [] : [...(configuration.selectedSkillIds ?? [])]),
          }, tools as unknown as RuntimeV2JsonValue[], { routeId: this.options.descriptor.routeId, model: configuration.model ?? this.options.descriptor.model });
          candidate = { ...candidate, requestOptions: { routeId: requestRouteId, model: requestModel } };
          requestId = randomUUID();
          converted = await this.contextInput(candidate, requestId, llmInput.options, { mode, selectedSkillIds: configuration.selectedSkillIds ?? [], budgetSummary });
          requestMessageList = Object.freeze([
            ...converted.input.messages,
            ...(budgetSummary && !this.options.contextSources ? [{ role: "user" as const, content: "Execution budget reached. No more tools are available. Summarize verified findings, unresolved questions and blockers for the parent now. Do not claim unperformed work is complete." }] : []),
          ]);
          activePrepared = await this.options.llm.prepareCapturedAsync(prepared.registration, {
            ...prepared.request,
            requestId,
            messages: requestMessageList,
          }, controller.signal, prepared.preparedAdapterCall);
          this.checkContextCapacity({ ...converted.input, messages: activePrepared.request.messages, tools: activePrepared.request.tools, options: activePrepared.request.options }, activePrepared.request.contextWindow ?? null, () => activePrepared.release());
          const retryContextWindow = activePrepared.request.contextWindow ?? null;
          if (this.options.contextSources) converted = { ...converted, context: await converted.engine.recordPrepared(converted.context, { modelKey: `${activePrepared.request.routeId}/${activePrepared.request.model}`, label: activePrepared.request.model, contextWindow: retryContextWindow, autoCompactAtTokens: compaction?.threshold?.(retryContextWindow) ?? null }) };
          const retryMetadata = { ...metadata, route: activePrepared.request.routeId, model: activePrepared.request.model, contextWindow: retryContextWindow };
          const retrySnapshot = this.options.contextSources ? snapshotContext(converted.context, { ...converted.input, requestId, messages: activePrepared.request.messages, tools: activePrepared.request.tools, routeId: activePrepared.request.routeId, model: activePrepared.request.model }, retryMetadata as unknown as RuntimeV2JsonValue, this.options.compositionDigest, this.options.hostCapabilityDigest, converted.input) : assembler!.finalize({ ...candidate, messages: requestMessageList.filter((message) => message.role !== "system") as unknown as readonly RuntimeV2JsonValue[] }, metadata, this.options.compositionDigest, this.options.hostCapabilityDigest);
          await converted.engine.bindRequest(converted.context);
          await this.options.session.append(core("request/header", { requestId, turnId, stepId, routeId: activePrepared.request.routeId, model: activePrepared.request.model, contextWindow: retryContextWindow, attempt, agentMode: mode, agentModeRevision: modeRevision }));
          await this.options.session.append(core("request/context", { requestId, turnId, stepId, snapshot: retrySnapshot }));
          await this.checkpoint("before-llm-dispatch");
          output = undefined;
        }
        // Empty content still settles the request before its Step can end.
        finalText = output.text || output.content.filter((block) => block.type === "text").map((block) => block.text).join("");
        await this.options.session.append(core("assistant/message", { messageId: output.messageId, requestId, turnId, stepId, content: output.content as unknown as RuntimeV2JsonValue, finishReason: output.stopReason ?? (output.aborted ? "aborted" : "completed"), usage: output.usage }, { surface: { kind: "append", node: { kind: "assistant", messageId: output.messageId, content: output.content as unknown as RuntimeV2JsonValue } } }));
        if (output.toolCalls.length > 0) await this.runTools(output.toolCalls, { agentRunId, turnId, stepId, requestId }, controller.signal, visibleToolNames, requestModel);
        await this.options.session.append(core("step/end", { turnId, stepId, reason: output.toolCalls.length > 0 ? "tool-use" : "completed", usage: output.usage }));
        await this.checkpoint("before-next-step");
        let updated = await this.publishContext(converted.engine, converted.context.request, { agentRunId, turnId, stepId });
        if (compaction !== undefined && !controller.signal.aborted) {
          // Include this Step's tool bodies: the previous Provider usage cannot
          // account for results produced after that request completed.
          const manifest = describeContextContent({ ...updated, content: { ...updated.content, conversation: this.options.session.journal.surface } }).manifest;
          const actual = compactionUsage(output.usage, activePrepared.request.contextWindow ?? null);
          const calls = new Set(output.toolCalls.map(call => call.callId));
          const toolTokens = manifest.entries.filter(entry => entry.kind === "tool-result" && calls.has(entry.trajectoryRef?.callId ?? "")).reduce((sum, entry) => sum + entry.estimatedTokens, 0);
          const usage = { contextWindow: activePrepared.request.contextWindow ?? null,
            inputTokens: Math.max(manifest.totalEstimatedTokens - (actual?.outputTokens ?? 0), (actual?.inputTokens ?? 0) + toolTokens), outputTokens: actual?.outputTokens ?? 0 };
          const before = this.options.session.lastSeq;
          const compacted = await this.autoCompact(compaction, usage, { agentRunId, turnId }, controller.signal);
          if (compacted || this.options.session.lastSeq !== before) {
            await this.checkpoint("before-next-step");
            updated = await this.publishContext(converted.engine, converted.context.request, { agentRunId, turnId, stepId });
          }
        }
        controller.signal.throwIfAborted();
        // 模型写最后回复时用户插入了消息或后台任务发来通知：回合不结束，下一步开头读到它（仍受 maxSteps 约束）。
        const steerPending = this.options.inputSource?.hasPending(agentRunId) || this.options.inbox.hasPendingNotifications();
        if (output.toolCalls.length === 0 && !budgetSummary && !steerPending) {
          await this.serial("agent/turn-stopping", { agentRunId, turnId, reason: "completed", stepCount });
          await this.options.session.append(core("turn/end", { turnId, reason: "completed" }));
          await this.checkpoint("after-turn-settled");
          this.emitLive({ kind: "run-state", agentRunId, turnId, stepId, message: "completed" });
          this.notify("agent/status", { agentRunId, turnId, status: "completed" });
          return Object.freeze({ agentRunId, turnId, reason: "completed", steps: stepCount, finalText });
        }
      }
      await this.serial("agent/turn-stopping", { agentRunId, turnId, reason: "step-limit", stepCount });
      await this.options.session.append(core("turn/end", { turnId, reason: "step-limit" }));
      await this.checkpoint("after-turn-settled");
      this.notify("agent/status", { agentRunId, turnId, status: "step-limit" });
      this.emitLive({ kind: "run-state", agentRunId, turnId, message: "step-limit" });
      return Object.freeze({ agentRunId, turnId, reason: "step-limit", steps: stepCount, finalText });
    } catch (error) {
      const cause = error instanceof AgentRuntimeError && isRecord(error.cause) ? error.cause : undefined;
      const failure = { ...normalizeLlmFailure(error, 1), ...(cause as LlmFailure | undefined), message: redactLlmText(error instanceof Error ? error.message : String(error)).slice(0, 2000) };
      let settlementFailure: unknown;
      if (this.options.session.durabilityState !== "blocked") {
        try {
          if (!input.keepPendingOnAbort) await this.options.inbox.discardAll(controller.signal.aborted ? "turn-aborted" : "turn-failed");
          const relations = this.options.session.journal.validation.relations;
          if (relations.openStepId !== null && relations.openRequestIds.length === 0 && relations.openToolCallIds.length === 0) await this.options.session.append(core("step/end", { turnId, stepId: relations.openStepId, reason: "interrupted" }));
          if (this.options.session.journal.validation.relations.openTurnId === turnId && this.options.session.journal.validation.relations.openStepId === null) await this.options.session.append(core("turn/end", { turnId, reason: controller.signal.aborted ? "aborted" : "failed", ...(controller.signal.aborted ? {} : { failure }) }));
          await this.checkpoint("after-turn-settled");
        } catch (caught) { settlementFailure = caught; }
      }
      if (!controller.signal.aborted) this.notify("agent/error", { agentRunId, turnId, error: failure.message });
      this.notify("agent/status", { agentRunId, turnId, status: controller.signal.aborted ? "aborted" : "failed" });
      this.emitLive({ kind: "run-state", agentRunId, turnId, message: controller.signal.aborted ? "aborted" : "failed", ...(controller.signal.aborted ? {} : { failure }) });
      if (settlementFailure !== undefined) throw new AggregateError([error, settlementFailure], "Agent turn failed and its settlement checkpoint also failed.", { cause: error });
      if (controller.signal.aborted && this.options.session.durabilityState !== "blocked") {
        return Object.freeze({ agentRunId, turnId, reason: "aborted", steps: stepCount, finalText });
      }
      throw error;
    } finally { this.#active = null; this.#resolveIdle?.(); this.#resolveIdle = null; this.#idle = null; }
  }

  private async candidate(assembler: RequestAssembler | undefined, input: Parameters<RequestAssembler["assembleCandidate"]>[0], tools: readonly RuntimeV2JsonValue[], requestOptions: RuntimeV2JsonValue): Promise<import("@actspace/prompt").LogicalRequestCandidate> {
    if (!this.options.contextSources) {
      if (!assembler) throw new Error("Agent Loop requires Context sources.");
      return assembler.assembleCandidate(input, tools, requestOptions);
    }
    input.scope.assertActive();
    return { sessionId: input.sessionId, turnId: input.turnId, stepId: input.stepId, messages: input.surface, tools, requestOptions,
      systemSections: [], modelFacts: [], facts: [{ host: input.hostFacts }], renderedSystemPrompt: "", contributorProvenance: [] };
  }

  private async contextInput(candidate: import("@actspace/prompt").LogicalRequestCandidate, requestId: string, options: import("@actspace/llm-service").LlmRequestOptions, runtime: { mode: RuntimeV2AgentMode; selectedSkillIds: readonly string[]; budgetSummary: boolean }) {
    const model = isRecord(candidate.requestOptions) && typeof candidate.requestOptions.model === "string" ? candidate.requestOptions.model : this.options.descriptor.model;
    const request = { sessionId: candidate.sessionId, logicalAgentScopeId: this.options.agentSubject?.agentId ?? this.options.scope.agentId, turnId: candidate.turnId, stepId: candidate.stepId, requestId,
      routeId: isRecord(candidate.requestOptions) && typeof candidate.requestOptions.routeId === "string" ? candidate.requestOptions.routeId : this.options.descriptor.routeId, model, options };
    const configuration: ContextEngineOptions = {
      resolve: input => this.options.contextSources ? {
        request: input,
        content: { system: { sections: [], modelFacts: [] }, conversation: this.options.session.journal.surface, supplements: [], tools: candidate.tools as unknown as readonly LlmToolDefinition[] },
        status: { throughJournalSeq: this.options.session.lastSeq, cycle: 0, paths: [], facts: candidate.facts, plugins: { "actspace.loop": { ...runtime, hostFacts: candidate.facts[0] ?? {} }, "actspace.context.compaction": { summaries: this.options.session.journal.surface.entries.flatMap(entry => { const seq = entry.sourceEventSeqs.reduce((a, b) => Math.max(a, b), -1); return this.options.session.journal.readEvents(seq, seq + 1); }).filter(event => event.type === "surface/replaced" && event.surface?.kind === "replace").map(event => ({ messageId: event.surface!.node.messageId, compactionId: (event.data as { compactionId?: string }).compactionId ?? event.surface!.node.messageId })) } } },
      } : contextFromCandidate(input, candidate, this.options.session.journal.surface, this.options.session.lastSeq),
      session: this.options.contextSources ? this.options.session : undefined,
      sources: this.options.contextSources,
      extensions: this.options.contextExtensions,
      resolveArtifact: this.options.toolEnvironment(this.options.session).resolveArtifact,
    };
    const engine = this.options.createContextEngine?.(configuration) ?? new ContextEngine(configuration);
    if (runtime.budgetSummary && this.options.contextSources) await engine.insert("actspace.context-conversation", `execution-budget:${candidate.stepId}`, "Execution budget reached. No more tools are available. Summarize verified findings, unresolved questions and blockers for the parent now. Do not claim unperformed work is complete.", "request", candidate.turnId);
    const replayThrough = this.options.session.durableSeq ?? this.options.session.lastSeq;
    const context = engine.getInstance(request) === undefined ? await engine.getContext(request) : await engine.reconcile(request, replayThrough);
    return { context, engine, input: await engine.toLlmInput(context) };
  }

  private toolDefinitions(mode: RuntimeV2AgentMode): readonly LlmToolDefinition[] {
    const available = this.options.tools.registry.listDefinitions();
    const modeTools = this.options.descriptor.kind === "subagent"
      ? new Set(available.map(definition => definition.name))
      : allowedAgentModeTools(mode, available.map(definition => definition.name), available.filter(definition => definition.pluginId.startsWith("actspace.evolved.")).map(definition => definition.name));
    return available
      .filter((definition) => modeTools.has(definition.name)
        && (this.options.toolScopeToken === undefined || this.options.descriptor.kind === "subagent" || this.options.scope.tools.get(definition.name)?.value === definition.pluginId)
        && (this.options.allowedToolNames?.has(definition.name) ?? true))
      .map((definition) => ({ name: definition.name, definitionVersion: definition.definitionVersion, definitionDigest: definition.definitionDigest, description: definition.description, inputSchema: definition.inputSchema as RuntimeV2JsonValue }));
  }
  private checkContextCapacity(input: import("@actspace/context-engine").LlmInput, capacity: number | null, release: () => void): void {
    if (capacity === null || !Number.isFinite(capacity) || capacity <= 0) return;
    const estimate = input.messages.reduce((sum, message) => sum + estimateContextTokens(message.content), 0) + input.tools.reduce((sum, tool) => sum + estimateContextTokens(tool), 0);
    const reserve = Math.max(0, input.options.maxTokens ?? 0);
    if (estimate >= capacity || estimate + reserve > capacity) {
      release();
      throw new Error(`Context exceeds model capacity (${estimate} estimated input tokens + ${reserve} requested output tokens / ${capacity}). Reduce input or compact the conversation before continuing.`);
    }
  }

  private async publishContext(engine: ContextEngine, request: import("@actspace/context-engine").ContextRequest, ids: { agentRunId: string; turnId: string; stepId: string }) {
    const before = this.options.session.lastSeq;
    const context = await engine.reconcile({ ...request, requestId: `context:${ids.turnId}:${ids.stepId}` }, this.options.session.durableSeq ?? this.options.session.lastSeq);
    // Sources can write supplement facts. Publish only after these are durable.
    if (this.options.session.lastSeq > before) await this.checkpoint("before-next-step");
    if (this.options.contextSources) this.emitLive({ kind: "run-state", ...ids, message: "context-updated" });
    return context;
  }

  /** One attempt per safe point; failed summaries keep the original Surface. */
  private async autoCompact(compaction: ContextCompactor, usage: import("@actspace/context-engine").CompactionUsage, ids: { agentRunId: string; turnId: string }, signal: AbortSignal): Promise<boolean> {
    let startedAt: number | null = null;
    let removedCount = 0;
    try {
      const compacted = await compaction.maybeCompact(this.options.session, usage, {
        signal,
        onStarted: ({ entryCount }) => {
          startedAt = Date.now();
          removedCount = entryCount;
          this.emitLive({ kind: "compaction-started", ...ids });
        },
      });
      if (compacted && startedAt !== null) this.emitLive({ kind: "compaction-finished", ...ids, removedCount, durationMs: Date.now() - startedAt });
      return compacted;
    } catch (error) {
      if (signal.aborted || this.options.session.durabilityState === "blocked") throw error;
      this.emitLive({ kind: "compaction-failed", ...ids, message: redactLlmText(error instanceof Error ? error.message : String(error)).slice(0, 500) });
      return false;
    }
  }
  private emitLive(event: WithoutSession<AgentLoopLiveEvent>): void {
    const lineage = this.options.session.header.lineage;
    try { this.options.onLiveEvent?.(Object.freeze({ ...event, sessionId: this.options.session.header.sessionId, ...(lineage?.origin === "delegation" ? { parentSessionId: lineage.parentSessionId, parentCallId: lineage.parentCallId } : {}), workspaceRoot: this.options.toolEnvironment(this.options.session).workspaceRoot })); }
    catch { /* Observers must not change execution or journal outcomes. */ }
  }
  private notify(type: AgentNotification, payload: unknown): void {
    this.#events.emit(type, this.recordPayload(payload));
  }
  private async waterfall<T, R = T>(type: AgentLoopIntervention, payload: T, next: () => R | Promise<R> = () => this.recordPayload(payload) as unknown as R): Promise<T | R> {
    return await this.#events.waterfall(type, this.recordPayload(payload), () => next()) as T | R;
  }
  private async serial(type: AgentLoopIntervention, payload: unknown): Promise<unknown> {
    return this.#events.serial(type, this.recordPayload(payload));
  }
  private async checkpoint(reason: "before-llm-dispatch" | "before-tool-body" | "before-next-step" | "after-turn-settled"): Promise<void> {
    if (this.options.context === undefined) {
      await this.options.session.flush(this.options.session.lastSeq);
      return;
    }
    const checkpoint = this.options.context.get?.("session.checkpoint") as { flush(input: { sessionId: string; throughSeq: number; reason: string }): Promise<void> } | undefined;
    if (!checkpoint) throw new Error("Required service session.checkpoint is missing.");
    await checkpoint.flush({ sessionId: this.options.session.header.sessionId, throughSeq: this.options.session.lastSeq, reason });
  }
  private recordPayload<T>(payload: T): Readonly<Record<string, unknown>> { return isRecord(payload) ? payload : {}; }

  private async runTools(calls: readonly CollectedToolCall[], ids: { agentRunId: string; turnId: string; stepId: string; requestId: string }, signal: AbortSignal, visibleToolNames: ReadonlySet<string>, mainModel?: string): Promise<readonly ToolExecutionResult[]> {
    const unavailable = calls.find((call) => !visibleToolNames.has(call.name));
    if (unavailable !== undefined) {
      // The assistant message already contains every call. Settle the whole
      // rejected batch without executing it so the next request remains valid.
      const results: ToolExecutionResult[] = [];
      for (const call of calls) {
        const summary = `Tool batch rejected: ${unavailable.name} is not visible in this Agent scope. No tools in this batch were executed.`;
        const result: ToolExecutionResult = { callId: call.callId, pluginId: "@actspace/core", name: call.name,
          registrationId: "scope-rejected", definitionVersion: 1, definitionDigest: "scope-rejected",
          status: "denied", summary, modelOutput: [{ type: "text", text: summary }], detail: [], artifacts: [],
          finalizerFailures: [], dispatched: false };
        await this.options.session.append(core("tool/call", { ...ids, callId: call.callId, pluginId: result.pluginId, name: call.name, args: parseArgs(call.arguments) }));
        const event = await this.options.session.append(core("tool/result", { callId: call.callId, pluginId: result.pluginId, name: call.name, status: result.status, summary, modelOutput: result.modelOutput, detail: [], artifacts: [], failure: null, renderer: null }, {
          surface: { kind: "append", node: { kind: "tool-result", messageId: `tool-${call.callId}`, callId: call.callId, content: result.modelOutput as unknown as RuntimeV2JsonValue, isError: true } },
        }));
        this.emitLive({ kind: "tool-finished", ...ids, callId: call.callId, name: call.name, result, resultEventId: `v2-${event.seq}` });
        this.notify("tools/result", result);
        results.push(result);
      }
      return results;
    }
    const resolvedCalls = calls.map((call) => ({ call, definition: this.options.tools.registry.capture(call.name).definition }));
    for (const { call, definition } of resolvedCalls) {
      const args = parseArgs(call.arguments);
      await this.options.session.append(core("tool/call", { ...ids, callId: call.callId, pluginId: definition.pluginId, name: definition.name, args }));
      this.emitLive({ kind: "tool-prepared", ...ids, callId: call.callId, name: definition.name, arguments: args });
    }
    const base = this.options.toolEnvironment(this.options.session);
    const environment: ToolPreparedEnvironment = { ...base, mainModel, allowedToolNames: visibleToolNames, agentScopeToken: this.options.toolScopeToken, context: this.options.context, eventCarrier: this.#events.carrier,
      onExecutionStarted: (call) => {
        this.emitLive({ kind: "tool-started", ...ids, callId: call.callId, name: call.name });
        try { base.onExecutionStarted?.(call); } catch { /* Isolate optional observers. */ }
      }, notifyAgent: async (content) => { await this.options.inbox.enqueue(content); }, journal: {
      recordDispatch: async (fact) => { await this.options.session.append(core("tool-workflow/run-start", fact)); },
      checkpointBeforeBody: async () => { await this.checkpoint("before-tool-body"); },
      recordPermission: async (type, data) => { await this.options.session.append(core(type, data as RuntimeV2JsonValue)); },
      commitResult: async (result) => {
        const data = { ...(result.approvalMode ? { approvalMode: result.approvalMode } : {}), ...(result.approvalReason ? { approvalReason: result.approvalReason } : {}), callId: result.callId, pluginId: result.pluginId, name: result.name, status: result.status, summary: result.summary, modelOutput: result.modelOutput, detail: result.detail, artifacts: result.artifacts, failure: result.failure ?? null, renderer: result.renderer ?? null } as unknown as RuntimeV2JsonValue;
        const surface = { surface: { kind: "append", node: { kind: "tool-result", messageId: `tool-${result.callId}`, callId: result.callId, content: result.modelOutput as unknown as RuntimeV2JsonValue, isError: result.status !== "completed" } } };
        const event = await this.options.session.append(core("tool/result", data, surface));
        await this.options.observeContextToolResult?.(this.options.session, event);
        this.emitLive({ kind: "tool-finished", ...ids, callId: result.callId, name: result.name, result, resultEventId: `v2-${event.seq}` });
        this.notify("tools/result", data);
      },
    } };
    const inputs: ToolCallInput[] = resolvedCalls.map(({ call, definition }) => ({ callId: call.callId, name: definition.name, arguments: parseArgs(call.arguments), sessionId: this.options.session.header.sessionId, agentId: this.subject.agentId, ...ids, signal }));
    return this.options.tools.executeBatch(inputs, environment);
  }
}

type CollectedToolCall = { readonly callId: string; readonly name: string; readonly arguments: string };
type StreamDelta = { readonly messageId: string; readonly chunkIndex: number; readonly live: StreamPayload };
async function collectStream(stream: AsyncIterable<LlmStreamEvent>, signal: AbortSignal, emit: (event: StreamDelta) => void | Promise<void>): Promise<{ messageId: string; text: string; content: readonly LlmContentBlock[]; toolCalls: readonly CollectedToolCall[]; usage: RuntimeV2JsonValue; stopReason: string | null; failure: LlmFailure | null; aborted: boolean; sawObservableDelta: boolean }> {
  const messageId = randomUUID();
  let chunkIndex = 0; let text = ""; let content: readonly LlmContentBlock[] = []; let usage: RuntimeV2JsonValue = {}; let stopReason: string | null = null; let failure: LlmFailure | null = null; let aborted = false; let sawObservableDelta = false; const calls = new Map<string, CollectedToolCall>();
  try {
    for await (const event of stream) {
      if (event.type === "text-delta") { sawObservableDelta ||= event.text.length > 0; text += event.text; await emit({ messageId, chunkIndex: chunkIndex++, live: { kind: "assistant-delta", message: event.text } }); }
      if (event.type === "reasoning-delta") { sawObservableDelta ||= event.text.length > 0; await emit({ messageId, chunkIndex: chunkIndex++, live: { kind: "reasoning-delta", message: event.text } }); }
      if (event.type === "tool-call-delta") { sawObservableDelta ||= event.argumentsDelta.length > 0; const prior = calls.get(event.callId); calls.set(event.callId, { callId: event.callId, name: event.name || prior?.name || "", arguments: `${prior?.arguments ?? ""}${event.argumentsDelta}` }); await emit({ messageId, chunkIndex: chunkIndex++, live: { kind: "tool-call-delta", callId: event.callId, name: event.name || prior?.name || "", argumentsDelta: event.argumentsDelta } }); }
      if (event.type === "done") { usage = event.usage as unknown as RuntimeV2JsonValue; stopReason = event.stopReason; content = event.content; for (const block of event.content) if (block.type === "tool-call") calls.set(block.callId, { callId: block.callId, name: block.name, arguments: block.arguments }); }
      if ((event.type === "error" || event.type === "aborted") && event.usage) usage = event.usage as unknown as RuntimeV2JsonValue;
      if (event.type === "error") failure = event.failure;
      if (event.type === "aborted") { failure = { kind: "abort", message: event.reason, retryable: false, attempt: 1 }; aborted = true; }
      if (signal.aborted) { failure = { kind: "abort", message: "Turn aborted.", retryable: false, attempt: 1 }; aborted = true; break; }
    }
  } catch (error) {
    failure = signal.aborted ? { kind: "abort", message: "Turn aborted.", retryable: false, attempt: 1 } : normalizeLlmFailure(error, 1);
    aborted = signal.aborted || failure.kind === "abort";
  }
  if (signal.aborted) { failure = { kind: "abort", message: "Turn aborted.", retryable: false, attempt: 1 }; aborted = true; }
  if (content.length === 0 && text.length > 0) content = Object.freeze([{ type: "text", text }]);
  return { messageId, text, content, toolCalls: Object.freeze([...calls.values()]), usage, stopReason, failure, aborted, sawObservableDelta };
}
function cancellableDelay(delayMs: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(true); }, delayMs);
    const onAbort = () => { clearTimeout(timer); resolve(false); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
function normalizeLlmFailure(error: unknown, attempt: number): LlmFailure {
  if (error instanceof LlmRuntimeError) return Object.freeze({ ...error.failure, attempt });
  const message = error instanceof Error ? error.message : String(error);
  return Object.freeze({ kind: "unknown", message, retryable: false, attempt });
}
function failedStreamOutput(failure: LlmFailure): Awaited<ReturnType<typeof collectStream>> {
  return { messageId: randomUUID(), text: "", content: Object.freeze([]), toolCalls: Object.freeze([]), usage: {}, stopReason: null, failure, aborted: failure.kind === "abort", sawObservableDelta: false };
}
function parseArgs(value: string): RuntimeV2JsonValue { try { const parsed = JSON.parse(value); return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function appendRuntimeContext(content: RuntimeV2JsonValue, mode: RuntimeV2AgentMode, revision: number): RuntimeV2JsonValue {
  const block = { type: "runtime-context", context: { agentMode: mode, agentModeRevision: revision } } as const;
  if (Array.isArray(content)) return [...content, block];
  if (typeof content === "string") return [{ type: "text", text: content }, block];
  return [{ type: "json", value: content }, block];
}
function currentAgentModeRevision(events: readonly { readonly type: string; readonly data: RuntimeV2JsonValue }[]): number {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (event.type === "agent/mode-set" && isRecord(event.data) && typeof event.data.revision === "number") return event.data.revision;
  }
  return 0;
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function compactionUsage(value: RuntimeV2JsonValue, contextWindow: number | null): import("@actspace/context-engine").CompactionUsage | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Readonly<Record<string, RuntimeV2JsonValue>>;
  const inputTokens = record.inputTokens; const outputTokens = record.outputTokens;
  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") return null;
  const cacheRead = typeof record.cacheReadTokens === "number" ? record.cacheReadTokens : 0;
  const cacheWrite = typeof record.cacheWriteTokens === "number" ? record.cacheWriteTokens : 0;
  if (![inputTokens, outputTokens, cacheRead, cacheWrite].every(value => Number.isFinite(value) && value >= 0)) return null;
  return { inputTokens: inputTokens + cacheRead + cacheWrite, outputTokens, contextWindow };
}
const USER_MESSAGE_IDS = Symbol("user-message-ids");
function hasUserMessage(session: SessionHandle, messageId: string): boolean {
  const ids = session.journal.project(USER_MESSAGE_IDS, () => new Set<string>(), (prior, event) => {
    if (event.type !== "user/message" || !isRecord(event.data) || typeof event.data.messageId !== "string") return prior;
    const next = new Set(prior); next.add(event.data.messageId); return next;
  });
  return ids.has(messageId) || session.journal.surface.entries.some(entry => entry.node.kind === "user" && entry.node.messageId === messageId);
}

function currentPermissionMode(events: readonly import("@actspace/session-journal").SessionEventEnvelopeV1[]): "default" | "full-access" | "auto-review" {
  let mode: "default" | "full-access" | "auto-review" = "default";
  for (const event of events) if (event.type === "permission/mode-set" && isRecord(event.data) && (event.data.mode === "default" || event.data.mode === "full-access" || event.data.mode === "auto-review")) mode = event.data.mode;
  return mode;
}
function core(type: string, data: RuntimeV2JsonValue, extra: Record<string, unknown> = {}) { return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null, ...extra } as never; }
