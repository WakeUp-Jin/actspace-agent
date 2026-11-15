import { FixedRendererStreamAdapter, createEmptyStreamingState, createLiveRunStore, type SessionRunState, type StreamEvent } from "@actspace/client/live";
import { ClientSessionStore, selectChatSession, type ClientSessionCell } from "@actspace/client/sessions";
import type { MessageBlock, RuntimeStreamEvent, SessionRecord } from "@actspace/shared";
import { isRecord } from "@actspace/shared/host-protocol";
import { mergePieces, type AgentLiveEvent, type ApprovalRequest, type LiveOutputPage, type LiveOutputPiece, type RuntimeDesktopSessionProjection, type RuntimeSessionObservation, type TaskSnapshot } from "@actspace/shared/runtime-v2";
import type { HostConnection } from "../connection/connection-store";
import { buildTranscript, type TranscriptItem } from "./transcript-model";

export type ObservationState = {
  readonly status: "loading" | "ready" | "error";
  readonly error: unknown;
  readonly epoch: string | null;
  readonly session: SessionRecord | null;
  readonly title: string | null;
  readonly items: readonly TranscriptItem[];
  readonly tasks: TaskSnapshot | null;
  readonly approvals: readonly ApprovalRequest[];
  readonly running: boolean;
  readonly runId: string | null;
  /** 本页第一次看到这个 Run 在跑的时间（毫秒）；中途加入时比真实开始晚。 */
  readonly runStartedAt: number | null;
  readonly hasMore: boolean;
  readonly loadingOlder: boolean;
  readonly agentMode: string | null;
  readonly agentModeRevision: number | null;
  readonly contextPercent: number | null;
  /** 最近一个 Run 的模型配置，作为输入框的默认显示。 */
  readonly runModel: string | null;
  readonly runEffort: string | null;
};

export const EMPTY_OBSERVATION: ObservationState = Object.freeze({
  status: "loading", error: null, epoch: null, session: null, title: null, items: [], tasks: null, approvals: [], running: false, runId: null, runStartedAt: null,
  hasMore: false, loadingOlder: false, agentMode: null, agentModeRevision: null, contextPercent: null, runModel: null, runEffort: null,
});

export type ObserverOptions = {
  /** 同一个 epoch 的重连沿用上一次的投影，窗口自动合并；epoch 变了就不传。 */
  readonly store?: ClientSessionStore;
  /** 重连期间先显示上一次的内容。 */
  readonly carry?: ObservationState;
  readonly onError?: (error: unknown) => void;
  readonly now?: () => number;
};

type ObserveResult = { subscriptionId: string; cursor: number; snapshot: { observation: RuntimeSessionObservation; tasks: TaskSnapshot; approvals: ApprovalRequest[]; output: { runId: string; revision: number } | null } };
const noop = () => undefined;
const TERMINAL: ReadonlySet<string> = new Set(["agent_run_finished", "agent_run_aborted", "agent_run_failed"]);

export function toEnvelope(observation: RuntimeSessionObservation): RuntimeDesktopSessionProjection {
  if (!observation.window) throw new Error("Host omitted session history window");
  return {
    kind: "session-projection", schemaVersion: 1, sessionId: observation.sessionId, throughJournalSeq: observation.projection.throughJournalSeq,
    snapshot: observation.snapshot, values: observation.projection.values, window: observation.window,
    activeMessageIds: observation.activeMessageIds, deferredToolCalls: observation.deferredToolCalls, watermarks: observation.watermarks,
  };
}

/**
 * 一个会话在一次连接上的观察：observe → 应用快照 → 回放进行中的输出 → 放行快照期间缓冲的事件。
 * 投影更新进 ClientSessionStore，live 事件经 FixedRendererStreamAdapter 折进 live run store，
 * tasks / approvals 事件直接更新状态。连接换了（重连）就丢掉这个对象，新建一个。
 */
export class SessionObserver {
  readonly store: ClientSessionStore;
  readonly epoch: string;
  readonly #live = createLiveRunStore();
  readonly #adapter = new FixedRendererStreamAdapter();
  readonly #listeners = new Set<() => void>();
  readonly #buffer: (() => void)[] = [];
  readonly #cleanup: (() => void)[] = [];
  readonly #now: () => number;
  #state: ObservationState;
  #status: ObservationState["status"] = "loading";
  #error: unknown = null;
  #subscriptionId: string | null = null;
  #disposed = false;
  #ready = false;
  #scheduled = false;
  #resyncing = false;
  #loadingOlder = false;
  #tasks: TaskSnapshot | null = null;
  #approvals: readonly ApprovalRequest[] = [];
  #approvalRevision = 0;
  #refreshRevision = 0;
  #runStartedAt: number | null = null;
  #cell: ClientSessionCell | null = null;
  #session: SessionRecord | null = null;
  #memo: { durable: readonly MessageBlock[]; live: object; items: readonly TranscriptItem[] } | null = null;

  constructor(readonly connection: HostConnection, readonly sessionId: string, private readonly options: ObserverOptions = {}) {
    this.store = options.store ?? new ClientSessionStore();
    this.epoch = connection.epoch;
    this.#now = options.now ?? Date.now;
    this.#state = options.carry ? { ...options.carry, status: "loading" } : EMPTY_OBSERVATION;
    this.#cleanup.push(this.store.subscribe(cell => { if (cell.sessionId === sessionId) this.#schedule(); }));
    this.#cleanup.push(this.#live.subscribe(() => this.#schedule()));
    this.#cleanup.push(this.#adapter.subscribe(event => this.#onStream(event)));
  }

  readonly subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  readonly getState = (): ObservationState => this.#state;
  get liveRunId(): string | null { return this.#live.get(this.sessionId)?.agentRunId ?? null; }

  async start(): Promise<void> {
    const { client, events } = this.connection;
    try {
      const result = await client.call("sessions.observe", { sessionId: this.sessionId }) as ObserveResult;
      if (this.#disposed) { void client.call("sessions.unobserve", { subscriptionId: result.subscriptionId }).catch(noop); events.forget(result.subscriptionId); return; }
      this.#subscriptionId = result.subscriptionId;
      this.#cleanup.push(events.on(result.subscriptionId, value => this.#onHostEvent(value)));
      await this.#applySnapshot(result.snapshot);
      if (this.#disposed) return;
      this.#status = "ready"; this.#error = null; this.#ready = true;
      for (const run of this.#buffer.splice(0)) run();
    } catch (error) {
      if (this.#disposed) return;
      this.#status = "error"; this.#error = error;
      this.options.onError?.(error);
    }
    this.#publish();
  }

  /** 离开页面或连接换了：退订并停止更新，状态保留给界面继续显示。 */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const stop of this.#cleanup.splice(0)) stop();
    this.#adapter.dispose();
    const id = this.#subscriptionId;
    if (id) { void this.connection.client.call("sessions.unobserve", { subscriptionId: id }).catch(noop); this.connection.events.forget(id); }
  }

  /** 重新读最新一页并合并（run 结束、投影出现空洞时）。 */
  async refresh(): Promise<void> {
    const revision = this.#approvalRevision;
    const refreshRevision = ++this.#refreshRevision;
    const [observation, approvals] = await Promise.all([
      this.connection.client.call("sessions.page", { sessionId: this.sessionId }) as Promise<RuntimeSessionObservation>,
      this.connection.client.call("approvals.list", { sessionId: this.sessionId }) as Promise<ApprovalRequest[]>,
    ]);
    if (!this.#disposed && refreshRevision === this.#refreshRevision) {
      this.store.applyEnvelope(toEnvelope(observation));
      if (revision === this.#approvalRevision) this.#approvals = approvals.filter(item => item.sessionId === this.sessionId);
      this.#schedule();
    }
  }

  async loadOlder(): Promise<void> {
    const beforeSeq = this.store.peek(this.sessionId)?.window?.beforeSeq;
    if (this.#loadingOlder || this.#disposed || beforeSeq === null || beforeSeq === undefined) return;
    this.#loadingOlder = true; this.#publish();
    try {
      const observation = await this.connection.client.call("sessions.page", { sessionId: this.sessionId, beforeSeq }) as RuntimeSessionObservation;
      if (!this.#disposed) this.store.applyEnvelope(toEnvelope(observation));
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.#loadingOlder = false; this.#publish();
    }
  }

  /** tasks.command 的回包带最新快照，直接采用。 */
  applyTasks(snapshot: TaskSnapshot): void {
    if (this.#tasks && snapshot.revision < this.#tasks.revision) return;
    this.#tasks = snapshot;
    const run = this.#live.get(this.sessionId);
    const record = run && snapshot.runs.find(item => item.runId === run.agentRunId);
    if (run && record && record.state !== "running") void this.#finishRun(run);
    this.#schedule();
  }

  async #applySnapshot(snapshot: ObserveResult["snapshot"]): Promise<void> {
    const { observation, tasks, approvals, output } = snapshot;
    this.store.applyEnvelope(toEnvelope(observation));
    this.#tasks = tasks; this.#approvals = approvals.filter(item => item.sessionId === this.sessionId);
    const running = tasks.runs.find(run => run.state === "running");
    if (!running) return;
    // 中途加入的 run：先缓存它的正文增量，拿到 Host 的实时底稿后从底稿接着显示（规范 agent-spec-live-assistant-stream §5）。
    this.#startRun(running.runId, true);
    const pieces: LiveOutputPiece[] = [];
    try {
      for (let after = 0; output?.runId === running.runId && after < output.revision;) {
        const page = await this.connection.client.call("sessions.output", { sessionId: this.sessionId, runId: output.runId, afterRevision: after }) as LiveOutputPage;
        if (this.#disposed) return;
        if (page.chunks.length === 0 || page.next <= after) break;
        pieces.push(...page.chunks.filter(chunk => chunk.revision <= output.revision));
        after = page.next;
      }
    } catch (error) {
      // Run 在回放期间换了：底稿为空，后续靠 live 事件和投影。
      if (!(isRecord(error) && error.kind === "CONFLICT")) throw error;
      pieces.length = 0;
    }
    // 已落盘的消息由投影显示。
    const persisted = new Set(observation.snapshot.messages.map(message => message.messageId));
    const segments = mergePieces(pieces.filter(piece => !persisted.has(piece.messageId)));
    this.#live.applyStreamEvent({ type: "live_output_baseline", sessionId: this.sessionId, agentRunId: running.runId, revision: output?.revision ?? 0, segments }, () => undefined);
  }

  #onHostEvent(value: unknown): void {
    if (!this.#ready) { this.#buffer.push(() => this.#dispatch(value)); return; }
    this.#dispatch(value);
  }

  #dispatch(value: unknown): void {
    if (this.#disposed || !isRecord(value)) return;
    switch (value.kind) {
      case "live": {
        const event = value.event;
        if (isRecord(event) && (event.sessionId === this.sessionId || event.parentSessionId === this.sessionId)) this.#adapter.accept(event as unknown as AgentLiveEvent);
        return;
      }
      case "projection": {
        const update = value.update;
        if (!isRecord(update) || update.sessionId !== this.sessionId) return;
        if (isRecord(update.event) && update.event.type === "session/rewound") { void this.#rewound(); return; }
        if (!this.store.applyJournalUpdate(update as never)) void this.#resync();
        return;
      }
      case "tasks":
        if (isRecord(value.snapshot) && value.snapshot.sessionId === this.sessionId) this.applyTasks(value.snapshot as unknown as TaskSnapshot);
        return;
      case "approvals":
        if (Array.isArray(value.requests)) { this.#approvalRevision++; this.#approvals = (value.requests as ApprovalRequest[]).filter(item => item.sessionId === this.sessionId); this.#schedule(); }
        return;
    }
  }

  /**
   * 会话从某一轮重来（agent-edit-resend-rewind.md §5.4）：日志 seq 变小，任务快照的修订号也从头算。
   * 整体替换投影，丢掉旧任务快照后重新取，卸下已结束的 live run。旧内容在新内容到达前继续显示。
   */
  async #rewound(): Promise<void> {
    if (!this.store.isResetting(this.sessionId)) this.store.reset(this.sessionId);
    this.#tasks = null;
    const run = this.#live.get(this.sessionId);
    if (run && this.#live.isTerminal(run.agentRunId) && this.#live.end(this.sessionId, run)) this.#runStartedAt = null;
    this.#schedule();
    try {
      const [, result] = await Promise.all([this.refresh(), this.connection.client.call("tasks.command", { sessionId: this.sessionId, op: "snapshot" }) as Promise<{ snapshot?: TaskSnapshot }>]);
      if (!this.#disposed && result?.snapshot) this.applyTasks(result.snapshot);
    } catch (error) { this.options.onError?.(error); }
  }

  async #resync(): Promise<void> {
    if (this.#resyncing) return;
    this.#resyncing = true;
    try { await this.refresh(); } catch (error) { this.options.onError?.(error); } finally { this.#resyncing = false; }
  }

  #startRun(runId: string, recovered = false): void {
    if (this.#live.isTerminal(runId)) return;
    this.#live.start({ sessionId: this.sessionId, agentRunId: runId, ...(recovered ? { recovered } : {}), state: createEmptyStreamingState(), userBlock: null, aborting: false });
    this.#runStartedAt ??= this.#now();
  }

  #onStream(event: RuntimeStreamEvent): void {
    if (event.sessionId !== this.sessionId) return;
    const stream = event as StreamEvent, id = stream.agentRunId, terminal = TERMINAL.has(stream.type);
    if (stream.type === "agent_run_started" && this.#live.isTerminal(id)) return;
    if (terminal) this.#live.markTerminal(id);
    let run = this.#live.get(this.sessionId);
    if (!run || (stream.type === "agent_run_started" && run.agentRunId !== id)) {
      if (terminal || this.#live.isTerminal(id)) return;
      this.#startRun(id);
      run = this.#live.get(this.sessionId);
    }
    if (!run || run.agentRunId !== id) return;
    this.#live.applyStreamEvent(stream, () => undefined);
    if (terminal) void this.#finishRun(run);
  }

  /** run 结束：先读一次最新投影让 durable 接手，再卸下 live，避免中间闪空。 */
  async #finishRun(run: SessionRunState): Promise<void> {
    try { await this.refresh(); } catch (error) { this.options.onError?.(error); }
    if (this.#disposed) return;
    if (this.#live.end(this.sessionId, run)) { this.#runStartedAt = null; this.#publish(); }
  }

  #schedule(): void {
    if (this.#scheduled || this.#disposed) return;
    this.#scheduled = true;
    queueMicrotask(() => { this.#scheduled = false; this.#publish(); });
  }

  #publish(): void {
    this.#state = this.#build();
    for (const listener of [...this.#listeners]) listener();
  }

  #build(): ObservationState {
    const cell = this.store.peek(this.sessionId);
    if (cell && cell !== this.#cell) {
      this.#cell = cell;
      if (cell.snapshot && cell.window) {
        try { this.#session = selectChatSession(cell); } catch (error) { this.options.onError?.(error); }
      }
    }
    const carry = this.options.carry;
    const session = this.#session ?? (carry?.session ?? null);
    const view = this.#live.view(this.sessionId);
    const durable = this.#session?.messageBlocks ?? [];
    let items: readonly TranscriptItem[];
    if (!this.#session && carry && !view.isStreaming) items = carry.items;
    else if (this.#memo && this.#memo.durable === durable && this.#memo.live === view) items = this.#memo.items;
    else { items = buildTranscript(durable, { blocks: view.blocks, runId: view.runId }); this.#memo = { durable, live: view, items }; }
    const taskRun = this.#tasks?.runs.find(run => run.state === "running");
    const running = view.isStreaming || taskRun !== undefined;
    const last = this.#tasks?.runs[this.#tasks.runs.length - 1];
    const config = isRecord(last?.configuration) ? last.configuration : {};
    const snapshot = cell?.snapshot ?? null;
    const percent = this.#session?.contextSnapshot?.percentUsed;
    return {
      status: this.#status, error: this.#error, epoch: this.epoch, session, title: snapshot?.metadata.title ?? null, items,
      tasks: this.#tasks ?? carry?.tasks ?? null, approvals: this.#approvals, running, runId: view.runId ?? taskRun?.runId ?? null,
      runStartedAt: running ? this.#runStartedAt ?? (this.#runStartedAt = this.#now()) : null,
      hasMore: cell?.window ? cell.window.beforeSeq !== null : carry?.hasMore ?? false, loadingOlder: this.#loadingOlder,
      agentMode: snapshot?.agentMode ?? carry?.agentMode ?? null, agentModeRevision: snapshot?.agentModeRevision ?? carry?.agentModeRevision ?? null,
      contextPercent: typeof percent === "number" && percent > 0 ? Math.round(percent) : null,
      runModel: typeof config.model === "string" ? config.model : null, runEffort: typeof config.reasoningEffort === "string" ? config.reasoningEffort : null,
    };
  }
}
