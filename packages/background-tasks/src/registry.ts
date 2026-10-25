import { MainAgentInbox } from "@actspace/core-agent";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { SessionHandle } from "@actspace/session-persistence";
import { renderLostNotification, renderOutputMatchNotification, renderTaskNotification } from "./notification.js";
import { BackgroundTaskError, type BackgroundTaskDelivery, type BackgroundTaskKind, type BackgroundTaskOutput, type BackgroundTaskRecord, type BackgroundTaskSource, type BackgroundTaskStatus, type BackgroundTaskTerminal, type BackgroundTaskWaitResult } from "./types.js";

export type BackgroundTaskRegistryOptions = {
  readonly openSession: (sessionId: string) => Promise<SessionHandle>;
  /** Ask the scheduler to deliver pending notifications to an idle Session. */
  readonly wake: (sessionId: string) => void;
  readonly now?: () => number;
  readonly onError?: (error: unknown) => void;
};

/** pending → enqueued(messageId) | suppressed: a result reaches the model exactly once. */
type Delivery = { readonly state: "pending" } | { readonly state: "enqueued"; readonly messageId: string } | { readonly state: "suppressed"; readonly by: "wait" | "stopped" };

type Entry = {
  readonly source: BackgroundTaskSource;
  readonly startedAt: number;
  status: BackgroundTaskStatus;
  endedAt?: number;
  terminal?: BackgroundTaskTerminal;
  delivery: Delivery;
  /** Called synchronously at settlement, before delivery is decided. */
  readonly listeners: Set<(entry: Entry) => void>;
  settled: Promise<void>;
};

const OPEN_TASKS = Symbol("background-open-tasks");

/** Host-level registry of background work, viewed per Session. */
export class BackgroundTaskRegistry {
  readonly #entries = new Map<string, Entry>();
  readonly #now: () => number;
  #disposed = false;
  constructor(private readonly options: BackgroundTaskRegistryOptions) { this.#now = options.now ?? Date.now; }

  async register(source: BackgroundTaskSource): Promise<BackgroundTaskRecord> {
    if (this.#entries.has(source.taskId)) throw new BackgroundTaskError("TASK_ID_CONFLICT", `Background task ${source.taskId} is already registered.`);
    const entry: Entry = { source, startedAt: this.#now(), status: "running", delivery: { state: "pending" }, listeners: new Set(), settled: Promise.resolve() };
    this.#entries.set(source.taskId, entry);
    await this.#append(source.sessionId, { op: "start", taskId: source.taskId, kind: source.kind, callId: source.callId, description: source.description, startedAt: new Date(entry.startedAt).toISOString() });
    entry.settled = source.done.then(
      terminal => this.#settle(entry, terminal),
      error => this.#settle(entry, { status: "failed", summary: `Background ${source.kind} task failed: ${error instanceof Error ? error.message : String(error)}`, body: "" }),
    ).catch(error => this.options.onError?.(error));
    return record(entry);
  }

  list(sessionId: string, options: { readonly activeOnly?: boolean; readonly limit?: number } = {}): readonly BackgroundTaskRecord[] {
    const entries = this.#owned(sessionId).filter(entry => !options.activeOnly || entry.status === "running");
    return entries.sort((a, b) => b.startedAt - a.startedAt).slice(0, options.limit ?? entries.length).map(record);
  }
  get(sessionId: string, taskId: string): BackgroundTaskRecord { return record(this.#require(sessionId, taskId)); }
  hasRunning(sessionId?: string, kind?: BackgroundTaskKind): boolean { return this.runningCount(sessionId, kind) > 0; }
  runningCount(sessionId?: string, kind?: BackgroundTaskKind): number {
    return [...this.#entries.values()].filter(entry => entry.status === "running" && (sessionId === undefined || entry.source.sessionId === sessionId) && (kind === undefined || entry.source.kind === kind)).length;
  }

  async output(sessionId: string, taskId: string): Promise<{ readonly task: BackgroundTaskRecord; readonly output: BackgroundTaskOutput }> {
    const entry = this.#require(sessionId, taskId);
    return { task: record(entry), output: await entry.source.output() };
  }

  /** The stop result is the delivery; a stopped task never sends a notification. */
  async stop(sessionId: string, taskId: string, reason: string): Promise<BackgroundTaskRecord> {
    const entry = this.#require(sessionId, taskId);
    if (entry.status === "running") {
      entry.delivery = { state: "suppressed", by: "stopped" };
      await entry.source.stop(reason);
      await entry.settled;
    }
    return record(entry);
  }

  /** Wait for one task, or any task already running at call time. Reporting a result suppresses its notification. */
  async wait(sessionId: string, options: { readonly taskId?: string; readonly timeoutMs: number; readonly signal?: AbortSignal }): Promise<BackgroundTaskWaitResult> {
    const candidates = options.taskId !== undefined ? [this.#require(sessionId, options.taskId)] : this.#owned(sessionId).filter(entry => entry.status === "running");
    if (candidates.length === 0) return { status: "no_running_tasks" };
    const ended = candidates.find(entry => entry.status !== "running");
    if (ended) return this.#reportViaWait(ended);
    const outcome = await new Promise<Entry | "timed_out" | "interrupted">(resolve => {
      const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); for (const entry of candidates) entry.listeners.delete(listener); };
      const listener = (entry: Entry) => { cleanup(); claimForWait(entry); resolve(entry); };
      const abort = () => { cleanup(); resolve("interrupted"); };
      const timer = setTimeout(() => { cleanup(); resolve("timed_out"); }, options.timeoutMs);
      timer.unref?.();
      for (const entry of candidates) entry.listeners.add(listener);
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();
    });
    if (outcome === "timed_out" || outcome === "interrupted") return { status: outcome, running: candidates.filter(entry => entry.status === "running").map(record) };
    await outcome.settled;
    return { status: "completed", task: record(outcome), output: await outcome.source.output() };
  }

  /** Bash output subscriptions: a progress notification that neither settles nor dedupes. */
  async notifyOutputMatch(taskId: string, summary: string, line: string): Promise<void> {
    const entry = this.#entries.get(taskId);
    if (!entry || entry.status !== "running" || this.#disposed) return;
    const { source } = entry;
    await this.#enqueue(source.sessionId, renderOutputMatchNotification(source, summary, line), { taskId: source.taskId, kind: source.kind, title: source.description, status: "output_match" });
    this.options.wake(source.sessionId);
  }

  /** After a restart, tasks started by an earlier process are lost; tell the model without waking it. */
  async reconcile(session: SessionHandle): Promise<void> {
    const open = session.journal.project(OPEN_TASKS, () => new Map<string, { readonly kind: BackgroundTaskKind; readonly description: string }>(), (state, event) => {
      if (event.type !== "background/task") return state;
      const data = event.data as Readonly<Record<string, RuntimeV2JsonValue>>;
      const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
      if (taskId === undefined) return state;
      const next = new Map(state);
      if (data.op === "start" && (data.kind === "bash" || data.kind === "agent")) next.set(taskId, { kind: data.kind, description: typeof data.description === "string" ? data.description : "" });
      if (data.op === "settle") next.delete(taskId);
      return next;
    });
    for (const [taskId, task] of open) {
      if (this.#entries.has(taskId)) continue;
      await session.append(core({ op: "settle", taskId, status: "lost", endedAt: new Date(this.#now()).toISOString(), delivery: "lost" }));
      await new MainAgentInbox(session).enqueue(renderLostNotification({ taskId, ...task }), { taskId, kind: task.kind, title: task.description, status: "lost" });
    }
  }

  /** Host shutdown: stop processes but leave the Journal open so the next start reports them as lost. */
  async dispose(): Promise<void> {
    this.#disposed = true;
    const running = [...this.#entries.values()].filter(entry => entry.status === "running");
    await Promise.allSettled(running.map(entry => entry.source.stop("host-shutdown")));
    await Promise.allSettled(running.map(entry => entry.settled));
    this.#entries.clear();
  }

  async #settle(entry: Entry, terminal: BackgroundTaskTerminal): Promise<void> {
    entry.status = terminal.status;
    entry.endedAt = this.#now();
    entry.terminal = terminal;
    for (const listener of [...entry.listeners]) listener(entry);
    entry.listeners.clear();
    if (this.#disposed) return;
    const { source } = entry;
    let delivery: BackgroundTaskDelivery;
    if (entry.delivery.state === "suppressed") delivery = entry.delivery.by;
    else {
      const item = await this.#enqueue(source.sessionId, renderTaskNotification(source, terminal), { taskId: source.taskId, kind: source.kind, title: source.description, status: terminal.status });
      // task_wait may have reported the result while the notification was being written.
      const late = suppressedBy(entry);
      if (late !== undefined) { await this.#discard(source.sessionId, item.messageId); delivery = late; }
      else { entry.delivery = { state: "enqueued", messageId: item.messageId }; delivery = "notified"; }
    }
    await this.#append(source.sessionId, { op: "settle", taskId: source.taskId, status: terminal.status, ...(terminal.exitCode === undefined ? {} : { exitCode: terminal.exitCode }), endedAt: new Date(entry.endedAt).toISOString(), delivery });
    if (delivery === "notified") this.options.wake(source.sessionId);
  }

  async #reportViaWait(entry: Entry): Promise<BackgroundTaskWaitResult> {
    const previous = entry.delivery;
    claimForWait(entry);
    if (previous.state === "enqueued") await this.#discard(entry.source.sessionId, previous.messageId);
    await entry.settled;
    return { status: "completed", task: record(entry), output: await entry.source.output() };
  }

  async #enqueue(sessionId: string, text: string, notice: { readonly taskId: string; readonly kind: string; readonly title: string; readonly status: string }) {
    return new MainAgentInbox(await this.options.openSession(sessionId)).enqueue(text, notice);
  }
  async #discard(sessionId: string, messageId: string): Promise<void> {
    await new MainAgentInbox(await this.options.openSession(sessionId)).discard(messageId, "delivered-via-wait");
  }
  async #append(sessionId: string, data: RuntimeV2JsonValue): Promise<void> {
    await (await this.options.openSession(sessionId)).append(core(data));
  }
  #owned(sessionId: string): Entry[] { return [...this.#entries.values()].filter(entry => entry.source.sessionId === sessionId); }
  #require(sessionId: string, taskId: string): Entry {
    const entry = this.#entries.get(taskId);
    if (!entry || entry.source.sessionId !== sessionId) throw new BackgroundTaskError("TASK_NOT_FOUND", `Unknown background task: ${taskId || "(missing taskId)"}`);
    return entry;
  }
}

/** Re-read after an await: task_wait can change delivery concurrently. */
function suppressedBy(entry: Entry): "wait" | "stopped" | undefined { return entry.delivery.state === "suppressed" ? entry.delivery.by : undefined; }

function claimForWait(entry: Entry): void {
  if (entry.delivery.state !== "suppressed") entry.delivery = { state: "suppressed", by: "wait" };
}

function record(entry: Entry): BackgroundTaskRecord {
  const { source } = entry;
  return Object.freeze({ taskId: source.taskId, kind: source.kind, sessionId: source.sessionId, callId: source.callId, description: source.description, status: entry.status, startedAt: entry.startedAt,
    ...(entry.endedAt === undefined ? {} : { endedAt: entry.endedAt }),
    ...(entry.terminal?.exitCode === undefined ? {} : { exitCode: entry.terminal.exitCode }),
    ...(entry.terminal === undefined ? {} : { summary: entry.terminal.summary }) });
}

function core(data: RuntimeV2JsonValue) { return { type: "background/task", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null } as never; }

/** The surface Harness plugins use through `actspace.host.background-tasks`. */
export type BackgroundTaskHost = Pick<BackgroundTaskRegistry, "register" | "list" | "get" | "output" | "stop" | "wait" | "notifyOutputMatch" | "hasRunning" | "runningCount">;
export const BACKGROUND_TASK_HOST_SERVICE = "actspace.host.background-tasks" as const;

/** Late-bound Host service: the registry exists only after the Agent runtime starts. */
export function createBackgroundTaskHost(resolve: () => BackgroundTaskRegistry): BackgroundTaskHost {
  return Object.freeze({
    register: source => resolve().register(source),
    list: (sessionId, options) => resolve().list(sessionId, options),
    get: (sessionId, taskId) => resolve().get(sessionId, taskId),
    output: (sessionId, taskId) => resolve().output(sessionId, taskId),
    stop: (sessionId, taskId, reason) => resolve().stop(sessionId, taskId, reason),
    wait: (sessionId, options) => resolve().wait(sessionId, options),
    notifyOutputMatch: (taskId, summary, line) => resolve().notifyOutputMatch(taskId, summary, line),
    hasRunning: (sessionId, kind) => resolve().hasRunning(sessionId, kind),
    runningCount: (sessionId, kind) => resolve().runningCount(sessionId, kind),
  });
}
