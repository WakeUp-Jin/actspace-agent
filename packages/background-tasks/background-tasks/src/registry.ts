import { MainAgentInbox } from "@actspace/agent";
import { serviceKey } from "@actspace/cordis-adapter";
import { coreEvent, type CoreEventDataMap, type RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { SessionHandle } from "@actspace/session-persistence";
import {
  renderLostNotification,
  renderOutputMatchNotification,
  renderTaskNotification,
  userStoppedSummary,
  type NotifiedTask,
} from "./notification.js";
import {
  BackgroundTaskError,
  type BackgroundTaskDelivery,
  type BackgroundTaskKind,
  type BackgroundTaskOutput,
  type BackgroundTaskOutputOptions,
  type BackgroundTaskRecord,
  type BackgroundTaskSource,
  type BackgroundTaskStatus,
  type BackgroundTaskTerminal,
} from "./types.js";

export type BackgroundTaskRegistryOptions = {
  readonly openSession: (sessionId: string) => Promise<SessionHandle>;
  /** Ask the scheduler to deliver pending notifications to an idle Session. */
  readonly wake: (sessionId: string) => void;
  readonly now?: () => number;
  readonly onError?: (error: unknown) => void;
};

/** pending → enqueued | stopped: a result reaches the model exactly once, as a notification or as the stop result. */
type Delivery = "pending" | "enqueued" | "stopped";

type Entry = {
  readonly source: BackgroundTaskSource;
  readonly startedAt: number;
  status: BackgroundTaskStatus;
  endedAt?: number;
  terminal?: BackgroundTaskTerminal;
  delivery: Delivery;
  /** The Bash log was deleted by the per-Session cap; `task_output` reports it instead of reading. */
  pruned?: boolean;
  settled: Promise<void>;
};

const OPEN_TASKS = Symbol("background-open-tasks");
const PRUNABLE_TASKS = Symbol("background-prunable-tasks");

/** Host-level registry of background work, viewed per Session. */
export class BackgroundTaskRegistry {
  readonly #entries = new Map<string, Entry>();
  readonly #now: () => number;
  #disposed = false;
  constructor(private readonly options: BackgroundTaskRegistryOptions) {
    this.#now = options.now ?? Date.now;
  }

  async register(source: BackgroundTaskSource): Promise<BackgroundTaskRecord> {
    if (this.#entries.has(source.taskId))
      throw new BackgroundTaskError("TASK_ID_CONFLICT", `Background task ${source.taskId} is already registered.`);
    const entry: Entry = {
      source,
      startedAt: this.#now(),
      status: "running",
      delivery: "pending",
      settled: Promise.resolve(),
    };
    this.#entries.set(source.taskId, entry);
    // A subagent's start names its transcript, so a restart can tell the model where it got to.
    await this.#append(source.sessionId, {
      op: "start",
      taskId: source.taskId,
      kind: source.kind,
      callId: source.callId,
      description: source.description,
      startedAt: new Date(entry.startedAt).toISOString(),
      ...(source.agent ? { transcriptPath: source.agent.transcriptPath } : {}),
    });
    entry.settled = source.done
      .then(
        (terminal) => this.#settle(entry, terminal),
        (error) =>
          this.#settle(entry, {
            status: "failed",
            summary: `Background ${source.kind} task failed: ${error instanceof Error ? error.message : String(error)}`,
            body: "",
          }),
      )
      .catch((error) => this.options.onError?.(error));
    return record(entry);
  }

  list(
    sessionId: string,
    options: { readonly activeOnly?: boolean; readonly limit?: number } = {},
  ): readonly BackgroundTaskRecord[] {
    const entries = this.#owned(sessionId).filter((entry) => !options.activeOnly || entry.status === "running");
    return entries
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, options.limit ?? entries.length)
      .map(record);
  }
  get(sessionId: string, taskId: string): BackgroundTaskRecord {
    return record(this.#require(sessionId, taskId));
  }
  hasRunning(sessionId?: string, kind?: BackgroundTaskKind): boolean {
    return this.runningCount(sessionId, kind) > 0;
  }
  runningCount(sessionId?: string, kind?: BackgroundTaskKind): number {
    return [...this.#entries.values()].filter(
      (entry) =>
        entry.status === "running" &&
        (sessionId === undefined || entry.source.sessionId === sessionId) &&
        (kind === undefined || entry.source.kind === kind),
    ).length;
  }

  async output(
    sessionId: string,
    taskId: string,
    options: BackgroundTaskOutputOptions = {},
  ): Promise<{ readonly task: BackgroundTaskRecord; readonly output: BackgroundTaskOutput }> {
    const entry = this.#require(sessionId, taskId);
    return { task: record(entry), output: await this.#output(entry, options) };
  }

  /**
   * Bash deleted this task's log to keep the Session under its cap. Writes `background/task` `prune` once, for a
   * task of this process or one the Journal knows from an earlier process; a log that never became a task is ignored.
   */
  async markPruned(sessionId: string, taskId: string): Promise<void> {
    const entry = this.#entries.get(taskId);
    if (entry && entry.source.sessionId !== sessionId) return;
    if (entry?.pruned) return;
    const session = await this.options.openSession(sessionId);
    const known = session.journal.project(
      PRUNABLE_TASKS,
      () => new Map<string, boolean>(),
      (state, event) => {
        if (event.type !== "background/task") return state;
        const data = event.data as Readonly<Record<string, RuntimeJsonValue>>;
        if (typeof data.taskId !== "string" || (data.op !== "start" && data.op !== "prune")) return state;
        return new Map(state).set(data.taskId, data.op === "prune");
      },
    );
    if (entry) entry.pruned = true;
    if (known.get(taskId) !== false) return;
    await session.append(
      coreEvent("background/task", {
        op: "prune",
        taskId,
        prunedAt: new Date(this.#now()).toISOString(),
        reason: "session-cap",
      }),
    );
  }

  /** The stop result is the delivery; a stopped task never sends a notification. */
  async stop(sessionId: string, taskId: string, reason: string): Promise<BackgroundTaskRecord> {
    const entry = this.#require(sessionId, taskId);
    if (entry.status === "running") {
      entry.delivery = "stopped";
      await entry.source.stop(reason);
      await entry.settled;
    }
    return record(entry);
  }

  /**
   * The user stopped the task from the UI. Like `stop`, the task sends no completion notice;
   * instead the model is told the user stopped it, at its next step, without being woken.
   */
  async stopByUser(sessionId: string, taskId: string): Promise<BackgroundTaskRecord> {
    const entry = this.#require(sessionId, taskId);
    if (entry.status !== "running") return record(entry);
    await this.stop(sessionId, taskId, "user");
    const { source } = entry;
    await this.#enqueue(
      sessionId,
      renderTaskNotification(notified(source), { status: "stopped", summary: userStoppedSummary(source), body: "" }),
      { taskId, kind: source.kind, title: source.description, status: "stopped" },
    );
    return record(entry);
  }

  /** Bash output subscriptions: a progress notification that neither settles nor dedupes. */
  async notifyOutputMatch(taskId: string, summary: string, line: string): Promise<void> {
    const entry = this.#entries.get(taskId);
    if (entry?.status !== "running" || this.#disposed) return;
    const { source } = entry;
    await this.#enqueue(source.sessionId, renderOutputMatchNotification(source, summary, line), {
      taskId: source.taskId,
      kind: source.kind,
      title: source.description,
      status: "output_match",
    });
    this.options.wake(source.sessionId);
  }

  /** Bash output subscriptions: the subscription ended while the task keeps running. Wakes the model, which may be waiting for a match. */
  async notifySubscriptionStopped(taskId: string, summary: string): Promise<void> {
    const entry = this.#entries.get(taskId);
    if (entry?.status !== "running" || this.#disposed) return;
    const { source } = entry;
    await this.#enqueue(
      source.sessionId,
      renderTaskNotification(source, { status: "subscription_stopped", summary, body: "" }),
      { taskId: source.taskId, kind: source.kind, title: source.description, status: "subscription_stopped" },
    );
    this.options.wake(source.sessionId);
  }

  /** After a restart, tasks started by an earlier process are lost; tell the model without waking it. */
  async reconcile(session: SessionHandle): Promise<void> {
    const open = session.journal.project(
      OPEN_TASKS,
      () =>
        new Map<
          string,
          { readonly kind: BackgroundTaskKind; readonly description: string; readonly transcriptPath?: string }
        >(),
      (state, event) => {
        if (event.type !== "background/task") return state;
        const data = event.data as Readonly<Record<string, RuntimeJsonValue>>;
        const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
        if (taskId === undefined) return state;
        const next = new Map(state);
        const description = typeof data.description === "string" ? data.description : "";
        if (data.op === "start" && data.kind === "bash") next.set(taskId, { kind: "bash", description });
        // Old `agent` starts (before subagents joined the registry) have no transcript and are not ours to settle.
        if (data.op === "start" && data.kind === "agent" && typeof data.transcriptPath === "string")
          next.set(taskId, { kind: "agent", description, transcriptPath: data.transcriptPath });
        if (data.op === "settle") next.delete(taskId);
        return next;
      },
    );
    for (const [taskId, task] of open) {
      if (this.#entries.has(taskId)) continue;
      await session.append(
        coreEvent("background/task", {
          op: "settle",
          taskId,
          status: "lost",
          endedAt: new Date(this.#now()).toISOString(),
          delivery: "lost",
        }),
      );
      await new MainAgentInbox(session).enqueue(renderLostNotification({ taskId, ...task }), {
        taskId,
        kind: noticeKind(task.kind),
        title: task.description,
        status: "lost",
      });
    }
  }

  /**
   * The Session rewound past these tasks' start (agent-edit-resend-rewind.md §3.5): drop them, so the list and
   * `task_output` no longer show them. A task still running is kept; the rewind stops it first.
   */
  forget(sessionId: string, taskIds: readonly string[]): void {
    for (const taskId of taskIds) {
      const entry = this.#entries.get(taskId);
      if (entry?.source.sessionId === sessionId && entry.status !== "running") this.#entries.delete(taskId);
    }
  }

  /**
   * Host shutdown: stop processes but leave the Journal open so the next start reports them as lost.
   * A task that ended just before is still writing its notice and settle record; the Host closes Sessions
   * after this returns, so those writes finish first.
   */
  async dispose(): Promise<void> {
    this.#disposed = true;
    const entries = [...this.#entries.values()];
    await Promise.allSettled(
      entries.filter((entry) => entry.status === "running").map((entry) => entry.source.stop("host-shutdown")),
    );
    await Promise.allSettled(entries.map((entry) => entry.settled));
    this.#entries.clear();
  }

  async #settle(entry: Entry, terminal: BackgroundTaskTerminal): Promise<void> {
    entry.status = terminal.status;
    entry.endedAt = this.#now();
    entry.terminal = terminal;
    if (this.#disposed) return;
    const { source } = entry;
    let delivery: BackgroundTaskDelivery;
    if (entry.delivery === "stopped") delivery = "stopped";
    else {
      await this.#enqueue(source.sessionId, renderTaskNotification(notified(source), terminal), {
        taskId: source.taskId,
        kind: source.kind,
        title: source.description,
        status: terminal.status,
      });
      entry.delivery = "enqueued";
      delivery = "notified";
    }
    await this.#append(source.sessionId, {
      op: "settle",
      taskId: source.taskId,
      status: terminal.status,
      ...(terminal.exitCode === undefined ? {} : { exitCode: terminal.exitCode }),
      endedAt: new Date(entry.endedAt).toISOString(),
      delivery,
    });
    if (delivery === "notified") this.options.wake(source.sessionId);
  }

  async #output(entry: Entry, options: BackgroundTaskOutputOptions = {}): Promise<BackgroundTaskOutput> {
    const outputPath = entry.source.bash?.outputPath;
    if (entry.pruned) return { text: "", ...(outputPath ? { outputPath } : {}), pruned: true };
    return entry.source.output(options);
  }

  async #enqueue(
    sessionId: string,
    text: string,
    notice: {
      readonly taskId: string;
      readonly kind: BackgroundTaskKind;
      readonly title: string;
      readonly status: string;
    },
  ) {
    return new MainAgentInbox(await this.options.openSession(sessionId)).enqueue(text, {
      ...notice,
      kind: noticeKind(notice.kind),
    });
  }
  async #append(sessionId: string, data: CoreEventDataMap["background/task"]): Promise<void> {
    await (await this.options.openSession(sessionId)).append(coreEvent("background/task", data));
  }
  #owned(sessionId: string): Entry[] {
    return [...this.#entries.values()].filter((entry) => entry.source.sessionId === sessionId);
  }
  #require(sessionId: string, taskId: string): Entry {
    const entry = this.#entries.get(taskId);
    if (!entry || entry.source.sessionId !== sessionId)
      throw new BackgroundTaskError("TASK_NOT_FOUND", `Unknown background task: ${taskId || "(missing taskId)"}`);
    return entry;
  }
}

/**
 * The inbox notice's kind is what the UI shows: a subagent's notice keeps `subagent`, the kind the conversation
 * already hides and the 子 Agent panel opens; Bash stays `bash`.
 */
function noticeKind(kind: BackgroundTaskKind): string {
  return kind === "agent" ? "subagent" : kind;
}

/** Bash notifications name the log; a subagent's name its transcript, so the model can read the whole record. */
function notified(source: BackgroundTaskSource): NotifiedTask {
  const { taskId, kind } = source;
  if (source.agent)
    return { taskId, kind, description: source.description, transcriptPath: source.agent.transcriptPath };
  return source.bash?.outputPath ? { taskId, kind, outputPath: source.bash.outputPath } : { taskId, kind };
}

function record(entry: Entry): BackgroundTaskRecord {
  const { source } = entry;
  return Object.freeze({
    taskId: source.taskId,
    kind: source.kind,
    sessionId: source.sessionId,
    callId: source.callId,
    description: source.description,
    status: entry.status,
    startedAt: entry.startedAt,
    ...(entry.endedAt === undefined ? {} : { endedAt: entry.endedAt }),
    ...(entry.terminal?.exitCode === undefined ? {} : { exitCode: entry.terminal.exitCode }),
    ...(entry.terminal === undefined ? {} : { summary: entry.terminal.summary }),
    ...(source.bash === undefined ? {} : { bash: source.bash }),
    ...(source.agent === undefined ? {} : { agent: source.agent }),
  });
}

/** The surface Harness plugins use through `actspace.host.background-tasks`. */
export type BackgroundTaskHost = Pick<
  BackgroundTaskRegistry,
  | "register"
  | "list"
  | "get"
  | "output"
  | "stop"
  | "notifyOutputMatch"
  | "notifySubscriptionStopped"
  | "markPruned"
  | "hasRunning"
  | "runningCount"
>;
export const BACKGROUND_TASK_HOST_SERVICE = "actspace.host.background-tasks" as const;
export const BACKGROUND_TASK_HOST_PORT = serviceKey<BackgroundTaskHost>(BACKGROUND_TASK_HOST_SERVICE);

/** Late-bound Host service: the registry exists only after the Agent runtime starts. */
export function createBackgroundTaskHost(resolve: () => BackgroundTaskRegistry): BackgroundTaskHost {
  return Object.freeze({
    register: (source) => resolve().register(source),
    list: (sessionId, options) => resolve().list(sessionId, options),
    get: (sessionId, taskId) => resolve().get(sessionId, taskId),
    output: (sessionId, taskId, options) => resolve().output(sessionId, taskId, options),
    stop: (sessionId, taskId, reason) => resolve().stop(sessionId, taskId, reason),
    notifyOutputMatch: (taskId, summary, line) => resolve().notifyOutputMatch(taskId, summary, line),
    notifySubscriptionStopped: (taskId, summary) => resolve().notifySubscriptionStopped(taskId, summary),
    markPruned: (sessionId, taskId) => resolve().markPruned(sessionId, taskId),
    hasRunning: (sessionId, kind) => resolve().hasRunning(sessionId, kind),
    runningCount: (sessionId, kind) => resolve().runningCount(sessionId, kind),
  });
}
