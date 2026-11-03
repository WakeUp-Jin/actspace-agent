/** Durable vocabulary of subagent events (`subagent/spawned`, `subagent/activation`), shared by the Journal codecs, projections and clients. */

/** `local` comes from `agent`, `fork` from `agent_fork`; `codex` / `claude-code` are external CLIs that cannot be continued. */
export const SUBAGENT_KINDS = ["local", "fork", "codex", "claude-code"] as const;
export type SubagentKind = (typeof SUBAGENT_KINDS)[number];

/** Only `local` subagents carry a preset. */
export const SUBAGENT_PRESETS = ["general", "explore"] as const;
export type SubagentPreset = (typeof SUBAGENT_PRESETS)[number];

/** Whether a subagent is working, idle and continuable, or finished for good (external). */
export const SUBAGENT_STATUSES = ["running", "inactive", "closed"] as const;
export type SubagentStatus = (typeof SUBAGENT_STATUSES)[number];

/** How one activation (one turn of work) ended. */
export const SUBAGENT_ACTIVATION_STATUSES = ["completed", "interrupted", "failed", "max_steps", "lost"] as const;
export type SubagentActivationStatus = (typeof SUBAGENT_ACTIVATION_STATUSES)[number];

/** `returned`: the synchronous tool call carried the result; `notified`: a completion notice reached the parent's inbox. */
export const SUBAGENT_DELIVERIES = ["returned", "notified", "lost"] as const;
export type SubagentDelivery = (typeof SUBAGENT_DELIVERIES)[number];

export const SUBAGENT_ACTIVATION_TRIGGERS = ["spawn", "message"] as const;
export type SubagentActivationTrigger = (typeof SUBAGENT_ACTIVATION_TRIGGERS)[number];

/** Final replies kept in the parent Journal and in notices are cut to this many UTF-8 bytes; the transcript has the full text. */
export const SUBAGENT_RESULT_LIMIT_BYTES = 8 * 1024;

/** Tool-result detail label whose value registers a trace file (subagent transcript, background Bash log) as an active context path. */
export const CONTEXT_TRACE_DETAIL_LABEL = "actspace.context.trace" as const;
export type ContextTraceDetailValue = { readonly kind: "trace"; readonly path: string; readonly description: string };

/** Inbox sources: `task_notification` is background Bash only; subagents use their own two. `steer` is read-only legacy. */
export const INBOX_SOURCES = ["task_notification", "subagent_notification", "agent_message", "steer"] as const;
export type InboxSourceId = (typeof INBOX_SOURCES)[number];
/** Sources that keep a finished turn going and can wake an idle Session. */
export const INBOX_WAKE_SOURCES: readonly InboxSourceId[] = Object.freeze(["task_notification", "subagent_notification", "agent_message"]);

export function isInboxSource(value: unknown): value is InboxSourceId {
  return typeof value === "string" && (INBOX_SOURCES as readonly string[]).includes(value);
}
