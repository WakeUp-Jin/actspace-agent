import { randomUUID } from "node:crypto";
import type { RuntimeV2AgentMode, RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";
import type { LlmContentBlock, LlmMessage, LlmToolDefinition } from "@actspace/llm-service";
import type { LlmService } from "@actspace/llm-service";
import type { LlmStreamEvent } from "@actspace/llm-service";
import { LlmRuntimeError, type LlmFailure } from "@actspace/llm-service";
import { DEFAULT_LLM_RETRY_POLICY, retryDelay, retryPolicySnapshot } from "@actspace/llm-service";
import type { RequestAssembler } from "@actspace/prompt";
import type { PreparedRequestMetadata } from "@actspace/prompt";
import type { AgentScope } from "@actspace/core-scope";
import { CheckpointPolicy } from "@actspace/session-journal";
import type { SessionHandle } from "@actspace/session-persistence";
import type { ToolCallInput, ToolPreparedEnvironment } from "@actspace/tools-runtime";
import type { ToolRuntime } from "@actspace/tools-runtime";
import type { ToolExecutionResult } from "@actspace/tools-runtime";
import { createAgentEventDispatcher, defaultAgentSubject, type AgentDescriptor, type AgentSubject, type AgentEventDispatcher } from "@actspace/core-agent";
import type { CompactionPlugin } from "@actspace/compaction";
import { AgentRuntimeError } from "@actspace/core-agent";
import type { MainAgentInbox } from "@actspace/core-agent";
import type { RunTurnResult } from "@actspace/core-agent";
import { type CordisContext, type AgentLoopIntervention, type AgentNotification } from "@actspace/cordis-adapter";

export type RunTurnInput = { readonly content: RuntimeV2JsonValue; readonly messageId?: string; readonly agentRunId?: string; readonly model?: string; readonly mode?: RuntimeV2AgentMode; readonly thinkingEnabled?: boolean; readonly reasoningEffort?: import("@actspace/shared").ModelReasoningEffort; readonly keepPendingOnAbort?: boolean; readonly selectedSkillIds?: readonly string[] };
type LiveIdentity = {
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
  | { readonly kind: "run-state"; readonly message: string; readonly requestId?: string }
  | { readonly kind: "tool-prepared"; readonly requestId: string; readonly callId: string; readonly name: string; readonly arguments: RuntimeV2JsonValue }
  | { readonly kind: "tool-started"; readonly requestId: string; readonly callId: string; readonly name: string }
  | { readonly kind: "tool-finished"; readonly requestId: string; readonly callId: string; readonly name: string; readonly result: ToolExecutionResult; readonly resultEventId: string }
);
type WithoutSession<T> = T extends unknown ? Omit<T, "sessionId"> : never;

export type AgentLoopOptions = {
  readonly descriptor: AgentDescriptor;
  readonly scope: AgentScope;
  readonly session: SessionHandle;
  readonly inbox: MainAgentInbox;
  readonly assembler: RequestAssembler;
  readonly llm: LlmService;
  readonly tools: ToolRuntime;
  readonly toolEnvironment: (session: SessionHandle) => Omit<ToolPreparedEnvironment, "journal">;
  readonly compositionDigest: string;
  readonly hostCapabilityDigest: string;
  readonly host: RuntimeV2HostDescriptor;
  readonly allowedToolNames?: ReadonlySet<string>;
  readonly compaction?: CompactionPlugin;
  readonly onLiveEvent?: (event: AgentLoopLiveEvent) => void;
  /** Real Cordis context used by the DSH-native assembly path. */
  readonly context?: CordisContext;
  /** Live subject fused with this Agent scope for all Agent events. */
  readonly agentSubject?: AgentSubject;
};

export class AgentLoop {
  readonly #checkpoint = new CheckpointPolicy();
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
      await this.notify("agent/session-start", { agentRunId, turnId, sessionId: this.options.session.header.sessionId });
      await this.notify("agent/status", { agentRunId, turnId, status: "started" });
      this.emitLive({ kind: "run-state", agentRunId, turnId, message: "started" });
      const messageId = input.messageId ?? randomUUID();
      const mode = input.mode ?? "agent";
      await this.options.session.append(core("turn/start", { turnId, agentRunId, mode }));
      if (!hasUserMessage(this.options.session, messageId)) await this.options.session.append(core("user/message", { messageId, agentRunId, turnId }, { surface: { kind: "append", node: { kind: "user", messageId, content: input.content } } }));
      while (stepCount < this.options.descriptor.maxSteps) {
        if (controller.signal.aborted) throw new AgentRuntimeError("TURN_ABORTED", "Turn was aborted.");
        await this.options.inbox.claim("next-step");
        const stepId = randomUUID(); stepCount += 1;
        const preStep = await this.waterfall("agent/pre-step", { agentRunId, turnId, stepId, stepIndex: stepCount, mode }, controller.signal);
        this.emitLive({ kind: "run-state", agentRunId, turnId, stepId, message: "step-started" });
        await this.options.session.append(core("step/start", { turnId, stepId, agentRunId, stepIndex: stepCount, ...(isRecord(preStep) ? { metadata: preStep as RuntimeV2JsonValue } : {}) }));
        const tools = this.toolDefinitions(mode);
        const visibleToolNames = new Set(tools.map((tool) => tool.name));
        let candidate = await this.options.assembler.assembleCandidate({
          sessionId: this.options.session.header.sessionId,
          turnId,
          stepId,
          scope: this.options.scope,
          surface: this.options.session.journal.surface.entries.map((entry) => surfaceMessage(entry.node)),
          hostFacts: { agentRunId, agentMode: mode, hostKind: this.options.host.hostKind, invocationId: this.options.host.invocationId, workspaceRoot: this.options.session.header.cwd ?? this.options.host.workspaceRef ?? this.options.toolEnvironment(this.options.session).workspaceRoot },
          selectedSkillIds: Object.freeze([...(input.selectedSkillIds ?? [])]),
        }, tools as unknown as RuntimeV2JsonValue[], { routeId: this.options.descriptor.routeId, model: input.model ?? this.options.descriptor.model });
        const assembled = await this.waterfall("system-prompt/assemble", candidate, controller.signal);
        if (isRecord(assembled)) candidate = assembled as typeof candidate;
        let requestId = randomUUID();
        const requestMessages = Object.freeze([
          ...(candidate.renderedSystemPrompt.length > 0 ? [{ role: "system" as const, content: candidate.renderedSystemPrompt }] : []),
          ...candidate.messages.map(toMessage),
        ]);
        const requestPlan = await this.waterfall("agent/request", { requestId, turnId, stepId, routeId: this.options.descriptor.routeId, model: input.model ?? this.options.descriptor.model, messages: requestMessages, tools }, controller.signal);
        const requestRecord: Readonly<Record<string, unknown>> = isRecord(requestPlan) ? requestPlan : {};
        const requestRouteId = typeof requestRecord.routeId === "string" ? requestRecord.routeId : this.options.descriptor.routeId;
        const requestModel = typeof requestRecord.model === "string" ? requestRecord.model : input.model ?? this.options.descriptor.model;
        let requestMessageList = Array.isArray(requestRecord.messages) ? requestRecord.messages as unknown as readonly LlmMessage[] : requestMessages;
        const prepared = this.options.llm.prepare({
          requestId,
          sessionId: this.options.session.header.sessionId,
          routeId: requestRouteId,
          model: requestModel,
          messages: requestMessageList,
          tools: Array.isArray(requestRecord.tools) ? requestRecord.tools as unknown as readonly LlmToolDefinition[] : tools,
          options: { ...(input.thinkingEnabled === undefined ? {} : { reasoning: input.thinkingEnabled }), ...(input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort }) },
          signal: controller.signal,
        });
        const retryPolicy = prepared.registration.retryPolicy ?? DEFAULT_LLM_RETRY_POLICY;
        const contextWindow = prepared.request.contextWindow ?? null;
        const metadata: PreparedRequestMetadata = { route: prepared.request.routeId, model: prepared.request.model, registrationId: prepared.registration.registrationId, adapterVersion: prepared.registration.adapter.adapterVersion, defaults: prepared.request.options as RuntimeV2JsonValue, retryPolicy: retryPolicySnapshot(retryPolicy) as unknown as RuntimeV2JsonValue, contextWindow };
        const snapshot = this.options.assembler.finalize(candidate, metadata, this.options.compositionDigest, this.options.hostCapabilityDigest);
        try {
          await this.options.session.append(core("request/header", { requestId, turnId, stepId, routeId: prepared.request.routeId, model: prepared.request.model, contextWindow, attempt: 1 }));
          await this.options.session.append(core("request/context", { requestId, turnId, stepId, snapshot }));
          await this.#checkpoint.enforce(this.options.session, "before-llm-dispatch");
        } catch (error) { prepared.release(); throw error; }
        let output: Awaited<ReturnType<typeof collectStream>> | undefined;
        let attempt = 1;
        let activePrepared = prepared;
        while (output === undefined) {
          try {
            this.emitLive({ kind: "run-state", agentRunId, turnId, stepId, requestId, message: "request-started" });
            const stream = await this.waterfall("llm/stream", { requestId, turnId, stepId, request: activePrepared.request, signal: controller.signal }, controller.signal, () => activePrepared.dispatch() as unknown as Promise<Awaited<ReturnType<typeof activePrepared.dispatch>>>);
            output = await collectStream(stream as AsyncIterable<LlmStreamEvent>, controller.signal, async (event) => {
              this.emitLive({ ...event.live, agentRunId, turnId, stepId, requestId, messageId: event.messageId });
              await this.options.session.append(core("assistant/chunk", { messageId: event.messageId, chunkIndex: event.chunkIndex, requestId, turnId, stepId, kind: event.live.kind, content: event.live.kind === "tool-call-delta" ? event.live.argumentsDelta : event.live.message, ...(event.live.kind === "tool-call-delta" ? { callId: event.live.callId, name: event.live.name } : {}) }));
              await this.serial("llm/stream", event.live, controller.signal);
            });
          } catch (error) {
            output = failedStreamOutput(normalizeLlmFailure(error, attempt));
          }
          if (output.failure === null) break;
          const recovery = await this.waterfall("agent/request-error", { requestId, turnId, stepId, attempt, failure: output.failure }, controller.signal, () => undefined as unknown as Readonly<Record<string, unknown>>);
          const recoveryRecord: Readonly<Record<string, unknown>> = isRecord(recovery) ? recovery : {};
          const delayOverride = typeof recoveryRecord.delayMs === "number" ? recoveryRecord.delayMs : undefined;
          const delayMs = recoveryRecord.kind === "abort" || output.aborted || output.sawObservableDelta ? null : recoveryRecord.kind === "retry" ? (delayOverride ?? retryDelay(retryPolicy, output.failure, attempt)) : retryDelay(retryPolicy, output.failure, attempt);
          if (delayMs === null) {
            await this.options.session.append(core("assistant/message", { messageId: output.messageId, requestId, turnId, stepId, content: [], finishReason: output.aborted ? "aborted" : "failed", usage: output.usage }));
            await this.options.session.append(core("step/end", { turnId, stepId, reason: output.aborted ? "aborted" : "failed" }));
            throw new AgentRuntimeError(output.aborted ? "TURN_ABORTED" : "AGENT_SETUP_FAILED", output.failure.message, output.failure);
          }
          const retryId = randomUUID();
          const failedRequestId = requestId;
          await this.options.session.append(core("llm/retry", { requestId: failedRequestId, retryId, attempt, nextAttempt: attempt + 1, delayMs, failure: output.failure, usage: output.usage }));
          await this.#checkpoint.enforce(this.options.session, "before-llm-dispatch");
          if (!await cancellableDelay(delayMs, controller.signal)) {
            await this.options.session.append(core("step/end", { turnId, stepId, reason: "aborted" }));
            throw new AgentRuntimeError("TURN_ABORTED", "LLM retry wait aborted.");
          }
          await this.options.session.append(core("llm/retry-started", { requestId: failedRequestId, retryId, attempt: attempt + 1 }));
          await this.#checkpoint.enforce(this.options.session, "before-llm-dispatch");
          attempt += 1;
          candidate = await this.options.assembler.assembleCandidate({
            sessionId: this.options.session.header.sessionId,
            turnId,
            stepId,
            scope: this.options.scope,
            surface: this.options.session.journal.surface.entries.map((entry) => surfaceMessage(entry.node)),
            hostFacts: { agentRunId, agentMode: mode, hostKind: this.options.host.hostKind, invocationId: this.options.host.invocationId, workspaceRoot: this.options.session.header.cwd ?? this.options.host.workspaceRef ?? this.options.toolEnvironment(this.options.session).workspaceRoot },
            selectedSkillIds: Object.freeze([...(input.selectedSkillIds ?? [])]),
          }, this.toolDefinitions(mode) as unknown as RuntimeV2JsonValue[], { routeId: this.options.descriptor.routeId, model: input.model ?? this.options.descriptor.model });
          const retryAssembled = await this.waterfall("system-prompt/assemble", candidate, controller.signal);
          if (isRecord(retryAssembled)) candidate = retryAssembled as typeof candidate;
          requestMessageList = Object.freeze([
            ...(candidate.renderedSystemPrompt.length > 0 ? [{ role: "system" as const, content: candidate.renderedSystemPrompt }] : []),
            ...candidate.messages.map(toMessage),
          ]);
          requestId = randomUUID();
          activePrepared = this.options.llm.prepareCaptured(prepared.registration, {
            ...prepared.request,
            requestId,
            messages: requestMessageList,
          }, controller.signal);
          const retrySnapshot = this.options.assembler.finalize(candidate, metadata, this.options.compositionDigest, this.options.hostCapabilityDigest);
          await this.options.session.append(core("request/header", { requestId, turnId, stepId, routeId: activePrepared.request.routeId, model: activePrepared.request.model, contextWindow, attempt }));
          await this.options.session.append(core("request/context", { requestId, turnId, stepId, snapshot: retrySnapshot }));
          await this.#checkpoint.enforce(this.options.session, "before-llm-dispatch");
          output = undefined;
        }
        if (output.content.length > 0 || output.failure !== null) {
          finalText = output.text || output.content.filter((block) => block.type === "text").map((block) => block.text).join("");
          await this.options.session.append(core("assistant/message", { messageId: output.messageId, requestId, turnId, stepId, content: output.content as unknown as RuntimeV2JsonValue, finishReason: output.stopReason ?? (output.aborted ? "aborted" : "completed"), usage: output.usage }, { surface: { kind: "append", node: { kind: "assistant", messageId: output.messageId, content: output.content as unknown as RuntimeV2JsonValue } } }));
        }
        if (output.toolCalls.length > 0) await this.runTools(output.toolCalls, { agentRunId, turnId, stepId, requestId }, controller.signal, visibleToolNames);
        await this.options.session.append(core("step/end", { turnId, stepId, reason: output.toolCalls.length > 0 ? "tool-use" : "completed", usage: output.usage }));
        await this.#checkpoint.enforce(this.options.session, "before-next-step");
        if (output.toolCalls.length === 0) {
          await this.serial("agent/turn-stopping", { agentRunId, turnId, reason: "completed", stepCount }, controller.signal);
          await this.options.session.append(core("turn/end", { turnId, reason: "completed" }));
          const usage = compactionUsage(output.usage);
          if (usage !== null) await this.options.compaction?.maybeCompact(this.options.session, usage);
          this.emitLive({ kind: "run-state", agentRunId, turnId, stepId, message: "completed" });
          await this.notify("agent/status", { agentRunId, turnId, status: "completed" });
          return Object.freeze({ agentRunId, turnId, reason: "completed", steps: stepCount, finalText });
        }
      }
      await this.serial("agent/turn-stopping", { agentRunId, turnId, reason: "step-limit", stepCount }, controller.signal);
      await this.options.session.append(core("turn/end", { turnId, reason: "step-limit" }));
      await this.notify("agent/status", { agentRunId, turnId, status: "step-limit" });
      this.emitLive({ kind: "run-state", agentRunId, turnId, message: "step-limit" });
      return Object.freeze({ agentRunId, turnId, reason: "step-limit", steps: stepCount, finalText });
    } catch (error) {
      if (!input.keepPendingOnAbort) await this.options.inbox.discardAll(controller.signal.aborted ? "turn-aborted" : "turn-failed");
      const relations = this.options.session.journal.validation.relations;
      if (relations.openStepId !== null && relations.openRequestIds.length === 0 && relations.openToolCallIds.length === 0) await this.options.session.append(core("step/end", { turnId, stepId: relations.openStepId, reason: "interrupted" }));
      if (this.options.session.journal.validation.relations.openTurnId === turnId && this.options.session.journal.validation.relations.openStepId === null) await this.options.session.append(core("turn/end", { turnId, reason: controller.signal.aborted ? "aborted" : "failed" }));
      await this.notify("agent/error", { agentRunId, turnId, error: error instanceof Error ? error.message : String(error) });
      await this.notify("agent/status", { agentRunId, turnId, status: controller.signal.aborted ? "aborted" : "failed" });
      this.emitLive({ kind: "run-state", agentRunId, turnId, message: controller.signal.aborted ? "aborted" : "failed" });
      throw error;
    } finally { this.#active = null; this.#resolveIdle?.(); this.#resolveIdle = null; this.#idle = null; }
  }

  private toolDefinitions(mode: RuntimeV2AgentMode): readonly LlmToolDefinition[] {
    if (mode === "chat") return Object.freeze([]);
    return this.options.tools.registry.listDefinitions()
      .filter((definition) => this.options.allowedToolNames?.has(definition.name) ?? true)
      .filter((definition) => mode === "agent" || isPlanTool(definition))
      .map((definition) => ({ name: definition.name, definitionVersion: definition.definitionVersion, definitionDigest: definition.definitionDigest, description: definition.description, inputSchema: definition.inputSchema as RuntimeV2JsonValue }));
  }
  private emitLive(event: WithoutSession<AgentLoopLiveEvent>): void {
    try { this.options.onLiveEvent?.(Object.freeze({ ...event, sessionId: this.options.session.header.sessionId, workspaceRoot: this.options.toolEnvironment(this.options.session).workspaceRoot })); }
    catch { /* Observers must not change execution or journal outcomes. */ }
  }
  private async notify(type: AgentNotification, payload: unknown): Promise<void> {
    await this.#events.emit(type, this.recordPayload(payload));
  }
  private async waterfall<T, R = T>(type: AgentLoopIntervention, payload: T, signal: AbortSignal, next: () => R | Promise<R> = () => this.recordPayload(payload) as unknown as R): Promise<T | R> {
    return await this.#events.waterfall(type, this.recordPayload(payload), () => next()) as T | R;
  }
  private async serial(type: AgentLoopIntervention, payload: unknown, signal: AbortSignal): Promise<unknown> {
    return this.#events.serial(type, this.recordPayload(payload));
  }
  private recordPayload<T>(payload: T): Readonly<Record<string, unknown>> { return isRecord(payload) ? payload : {}; }

  private async runTools(calls: readonly CollectedToolCall[], ids: { agentRunId: string; turnId: string; stepId: string; requestId: string }, signal: AbortSignal, visibleToolNames: ReadonlySet<string>): Promise<readonly ToolExecutionResult[]> {
    const unavailable = calls.find((call) => !visibleToolNames.has(call.name));
    if (unavailable !== undefined) throw new AgentRuntimeError("AGENT_SETUP_FAILED", `Tool ${unavailable.name} is not visible in this Agent scope.`);
    const resolvedCalls = calls.map((call) => ({ call, definition: this.options.tools.registry.capture(call.name).definition }));
    for (const { call, definition } of resolvedCalls) {
      const args = parseArgs(call.arguments);
      await this.options.session.append(core("tool/call", { ...ids, callId: call.callId, pluginId: definition.pluginId, name: definition.name, args }));
      this.emitLive({ kind: "tool-prepared", ...ids, callId: call.callId, name: definition.name, arguments: args });
    }
    const base = this.options.toolEnvironment(this.options.session);
    const environment: ToolPreparedEnvironment = { ...base, context: this.options.context, eventCarrier: this.#events.carrier,
      onExecutionStarted: (call) => {
        this.emitLive({ kind: "tool-started", ...ids, callId: call.callId, name: call.name });
        try { base.onExecutionStarted?.(call); } catch { /* Isolate optional observers. */ }
      }, notifyAgent: async (content) => { await this.options.inbox.enqueue(content, "next-step"); }, journal: {
      recordDispatch: async (fact) => { await this.options.session.append(core("tool-workflow/run-start", fact)); },
      checkpointBeforeBody: async () => { await this.#checkpoint.enforce(this.options.session, "before-tool-body"); },
      commitResult: async (result) => {
        const data = { callId: result.callId, pluginId: result.pluginId, name: result.name, status: result.status, summary: result.summary, modelOutput: result.modelOutput, detail: result.detail, artifacts: result.artifacts, failure: result.failure ?? null, renderer: result.renderer ?? null } as unknown as RuntimeV2JsonValue;
        const surface = { surface: { kind: "append", node: { kind: "tool-result", messageId: `tool-${result.callId}`, callId: result.callId, content: result.modelOutput as unknown as RuntimeV2JsonValue, isError: result.status !== "completed" } } };
        const event = await this.options.session.append(core("tool/result", data, surface));
        this.emitLive({ kind: "tool-finished", ...ids, callId: result.callId, name: result.name, result, resultEventId: `v2-${event.seq}` });
        await this.notify("tools/result", data);
      },
    } };
    const inputs: ToolCallInput[] = resolvedCalls.map(({ call, definition }) => ({ callId: call.callId, name: definition.name, arguments: parseArgs(call.arguments), sessionId: this.options.session.header.sessionId, ...ids, signal }));
    return this.options.tools.executeBatch(inputs, environment);
  }
}

function isPlanTool(definition: import("@actspace/tools-runtime").ToolDefinition): boolean {
  if (definition.name === "explore") return true;
  return definition.concurrency === "read-only"
    && definition.effects.every((effect) => effect.mode !== "write" && effect.mode !== "execute");
}

type CollectedToolCall = { readonly callId: string; readonly name: string; readonly arguments: string };
type StreamDelta = { readonly messageId: string; readonly chunkIndex: number; readonly live: StreamPayload };
async function collectStream(stream: AsyncIterable<LlmStreamEvent>, signal: AbortSignal, emit: (event: StreamDelta) => void | Promise<void>): Promise<{ messageId: string; text: string; content: readonly LlmContentBlock[]; toolCalls: readonly CollectedToolCall[]; usage: RuntimeV2JsonValue; stopReason: string | null; failure: LlmFailure | null; aborted: boolean; sawObservableDelta: boolean }> {
  const messageId = randomUUID();
  let chunkIndex = 0; let text = ""; let content: readonly LlmContentBlock[] = []; let usage: RuntimeV2JsonValue = {}; let stopReason: string | null = null; let failure: LlmFailure | null = null; let aborted = false; let sawObservableDelta = false; const calls = new Map<string, CollectedToolCall>();
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
function surfaceMessage(node: import("@actspace/session-journal").SessionSurfaceNodeV1): RuntimeV2JsonValue {
  if (node.kind === "user") return { role: "user", content: node.content };
  if (node.kind === "assistant") return { role: "assistant", content: node.content };
  return { role: "tool", callId: node.callId, content: node.content, isError: node.isError };
}
function toMessage(value: RuntimeV2JsonValue): LlmMessage {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Readonly<Record<string, RuntimeV2JsonValue>>;
    if (record.role === "user" || record.role === "assistant" || record.role === "tool") return { role: record.role, content: toLlmContent(record.content), ...(record.role === "tool" && typeof record.callId === "string" ? { callId: record.callId } : {}) };
  }
  return { role: "user", content: typeof value === "string" ? value : JSON.stringify(value) ?? "null" };
}
function toLlmContent(value: RuntimeV2JsonValue | undefined): string | readonly LlmContentBlock[] {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return JSON.stringify(value ?? null) ?? "null";
  return value.flatMap((item): LlmContentBlock[] => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return [{ type: "text", text: JSON.stringify(item) ?? "null" }];
    const block = item as Readonly<Record<string, RuntimeV2JsonValue>>;
    if (block.type === "text" && typeof block.text === "string") return [{ type: "text", text: block.text }];
    if (block.type === "reasoning" && typeof block.text === "string") return [{ type: "reasoning", text: block.text, ...(typeof block.signature === "string" ? { signature: block.signature } : {}) }];
    if (block.type === "tool-call" && typeof block.callId === "string" && typeof block.name === "string") return [{ type: "tool-call", callId: block.callId, name: block.name, arguments: typeof block.arguments === "string" ? block.arguments : JSON.stringify(block.arguments ?? {}) }];
    if (block.type === "json") return [{ type: "text", text: JSON.stringify(block.value ?? null) }];
    if (block.type === "artifact" && block.artifact !== null && typeof block.artifact === "object" && !Array.isArray(block.artifact)) { const artifact = block.artifact as Readonly<Record<string, RuntimeV2JsonValue>>; if (typeof artifact.artifactId === "string" && typeof artifact.mediaType === "string") return [{ type: "image", artifactId: artifact.artifactId, mimeType: artifact.mediaType, ...(typeof block.label === "string" ? { alt: block.label } : {}) }]; }
    return [{ type: "text", text: JSON.stringify(block) }];
  });
}
function parseArgs(value: string): RuntimeV2JsonValue { try { const parsed = JSON.parse(value); return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function compactionUsage(value: RuntimeV2JsonValue): { inputTokens: number; outputTokens: number } | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Readonly<Record<string, RuntimeV2JsonValue>>;
  const inputTokens = record.inputTokens; const outputTokens = record.outputTokens;
  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") return null;
  return { inputTokens, outputTokens };
}
function hasUserMessage(session: SessionHandle, messageId: string): boolean {
  if (session.journal.events.some((event) => event.type === "user/message" && isRecord(event.data) && event.data.messageId === messageId)) return true;
  return session.journal.surface.entries.some((entry) => entry.node.kind === "user" && entry.node.messageId === messageId);
}
function core(type: string, data: RuntimeV2JsonValue, extra: Record<string, unknown> = {}) { return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null, ...extra } as never; }
