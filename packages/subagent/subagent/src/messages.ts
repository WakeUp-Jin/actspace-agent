import { trimTrailing } from "@actspace/shared";
import { SUBAGENT_RESULT_LIMIT_BYTES, type SubagentActivationStatus } from "@actspace/shared/runtime-v2";

/**
 * Every model-visible text of local subagents (design 02 §2, §5.2, §6.2, §7, §9), kept verbatim in one place.
 * Tool descriptions, parameter descriptions, results, notices and the task guidance all come from here.
 */

/** Running subagents per main Session, counted across every kind (synchronous and background). */
export const SUBAGENT_CONCURRENCY_LIMIT = 10;
/** A synchronous `agent` call returns after this long and the subagent moves to the background. */
export const SUBAGENT_SYNC_WAIT_MS = 30 * 60 * 1000;
/** An external subagent's call waits this long for the CLI to write its session log (design 04 §3.3). */
export const EXTERNAL_LOG_WAIT_MS = 10_000;
/** One activation runs at most this many steps. */
export const SUBAGENT_MAX_STEPS = 1000;

export const AGENT_TOOL_DESCRIPTION = [
  "Start a subagent: a separate agent with its own context that works on a task you hand it and returns its final answer. Use it as a temporary context window: it does the work, reports, and is done; for more work, start a new one. By default the call waits for the result; several agent calls in one step run in parallel. The transcript file records every step it takes; read it when you need to check how it reached its result instead of trusting the summary alone.",
  "Subagents cannot ask the user for approval: actions that would need approval fail and the subagent reports the failure. When several writing subagents run in parallel, give each a disjoint set of files.",
  "With background: true the call returns at once and you are notified when it finishes; it is then a background task (task_list, task_stop). Use send_message to give a running subagent information it is missing, list_subagent_models to choose a model. At most 10 subagents run at once.",
].join("\n");

export const AGENT_PARAMETERS = Object.freeze({
  description: "A short (3-5 word) label for the task, shown in lists and the UI.",
  prompt:
    "The complete, self-contained task. The subagent does not see this conversation, so include everything it needs: goal, relevant files, constraints and what to report.",
  agent_preset:
    "general: all of your tools; it can edit files and run commands. explore: read-only (read_file, list_directory, grep, glob), for searching and reading.",
  background:
    "false (default) waits for the result; after 30 minutes the call returns and the subagent keeps running in the background. true returns at once and notifies you when it finishes.",
  model:
    "Model key from list_subagent_models. Omit to use the default subagent model. Match the model to the task: a cheaper, faster model for searching and reading; a stronger model for editing code or work that needs judgment.",
  reasoning_effort:
    "Reasoning effort id for the chosen model, from list_subagent_models. Omit to use that model's default.",
});

export const AGENT_FORK_DESCRIPTION =
  "Start a subagent that inherits this conversation: it sees everything up to your last completed step in this turn (not the step that contains this call), with your tools and model, so its first request reuses this conversation's prompt cache. Use it for work that builds on the current context, such as trying an alternative, reviewing what was just done, or a side investigation, without spending this conversation's context on it. Choosing a different model loses the cache. It cannot start subagents of its own. Otherwise it behaves like agent: waits for the result by default (background: true returns at once and notifies you), transcript path returned, done once it answers.";

/** `agent_fork` takes `agent`'s parameters without `agent_preset`; `prompt` and `model` read differently (design 02 §2.2). */
export const AGENT_FORK_PARAMETERS = Object.freeze({
  description: AGENT_PARAMETERS.description,
  prompt: "What the forked subagent should do. It already sees this conversation, so state only what is new.",
  background: AGENT_PARAMETERS.background,
  model: "Model key from list_subagent_models. Omit to use the parent's model (keeps the prompt cache).",
  reasoning_effort: AGENT_PARAMETERS.reasoning_effort,
});

/** `agent_codex` / `agent_claude_code` (design 04 §2): the same text with the CLI's name. */
export function externalAgentDescription(label: string): string {
  return `Run a task with the local ${label} CLI as a subagent, in this workspace. It runs once and cannot receive messages. It uses ${label}'s own permissions (no approval prompts) and its own model settings. You get its final message and the path of its native session log (JSONL; long lines). By default the call waits for the result; with background: true it returns at once, you are notified when it finishes, and task_stop stops it.`;
}

export function externalAgentParameters(label: string) {
  return Object.freeze({
    description: AGENT_PARAMETERS.description,
    prompt: "The complete, self-contained task. It does not see this conversation.",
    background: AGENT_PARAMETERS.background,
    model: `Model name passed to the ${label} CLI as is. Omit to use the CLI's own default.`,
  });
}

/** An external CLI that could not start at all; nothing was recorded. */
export function externalStartFailed(label: string, error: string): string {
  return `${label} could not start: ${error}`;
}

export const SEND_MESSAGE_DESCRIPTION = [
  "Send a message to a running subagent you started, or, from a subagent, to your parent. It is read at the recipient's next step; a parent that is idle wakes up to read it. Returns at once. A subagent that has finished cannot receive messages; start a new one instead.",
  "Use it to add a fact the subagent is missing or to correct a wrong goal. Do not use it to make a subagent stop, send its result now, or stop reading and start writing. There is no time limit, however the subagent looks; trust it to finish unless it needs guidance or more information.",
].join("\n");
export const SEND_MESSAGE_PARAMETERS = Object.freeze({
  agent_id: "The recipient: the agent id of a running subagent you started, or your parent's id.",
});

export const LIST_SUBAGENT_MODELS_DESCRIPTION =
  "List the models a subagent can use, with their reasoning efforts. Call it before choosing a model or reasoning effort for agent or agent_fork.";

/** Failure text of an `ask` in a subagent, which has no approval broker. */
export const SUBAGENT_APPROVAL_UNAVAILABLE =
  "This action needs the user's approval, which a subagent cannot request. Report what you need to your parent instead.";

export const SUBAGENT_LIMIT_REACHED = `${SUBAGENT_CONCURRENCY_LIMIT} subagents are already running. Wait for one to finish, or stop a background one with task_stop.`;

export function unknownModel(key: string): string {
  return `Unknown model ${key}. Call list_subagent_models to see the available models.`;
}
export function unknownEffort(effort: string, key: string): string {
  return `Unknown reasoning effort ${effort} for ${key}. Call list_subagent_models to see the available efforts.`;
}
export function blockedTool(name: string): string {
  return `Subagents cannot use ${name}.`;
}
export function externalCannotReceive(agentId: string): string {
  return `${agentId} is an external subagent and cannot receive messages.`;
}
export function unknownAgent(agentId: string): string {
  return `Unknown agent ${agentId}. Use the agent id the agent call returned, or task_list for background subagents.`;
}
export function agentFinished(agentId: string): string {
  return `Subagent ${agentId} has finished and cannot receive messages. Start a new subagent if there is more to do.`;
}
export const CANNOT_MESSAGE_SELF = "You cannot send a message to yourself.";
export const SIBLING_MESSAGE_BLOCKED = "A subagent can only send messages to its parent.";

/** `external`: the CLI label of an external subagent (design 04 §2), which takes no messages. */
type StartedText = {
  readonly agentId: string;
  readonly description: string;
  readonly transcriptPath: string;
  readonly forked?: boolean;
  readonly external?: string;
  readonly logMissing?: boolean;
};

export function backgroundStarted(input: StartedText): string {
  const what = input.external ? `${input.external} subagent` : input.forked ? "forked subagent" : "subagent";
  return [
    `Started ${what} ${input.agentId} (${input.description}) in the background.`,
    transcriptLine(input),
    whileRunning(input.external),
  ].join("\n");
}

export function movedToBackground(input: Omit<StartedText, "forked">): string {
  return [
    `Subagent ${input.agentId} (${input.description}) is still running and has moved to the background (30 minute wait limit).`,
    transcriptLine(input),
    whileRunning(input.external),
  ].join("\n");
}

/** Appended to an external subagent's record path when the CLI has not written the file within the wait (design 04 §3.3). */
export const LOG_FILE_MISSING = "(the log file does not exist yet)";

function transcriptLine(input: { readonly transcriptPath: string; readonly logMissing?: boolean }): string {
  return `transcript: ${input.transcriptPath}${input.logMissing ? ` ${LOG_FILE_MISSING}` : ""}`;
}

function whileRunning(external: string | undefined): string {
  return external
    ? "You will be notified when it finishes. task_stop stops it."
    : "You will be notified when it finishes. Use send_message only to give it information it is missing; task_stop stops it.";
}

export const RESULT_TRUNCATED_SUFFIX = "[truncated; read the transcript for the full answer]";

/** How one activation ended, as the phrase after `Subagent <id> (<description>)`. */
function statusPhrase(status: SubagentActivationStatus, error?: string): string {
  switch (status) {
    case "completed":
      return "finished";
    case "interrupted":
      return "was stopped before it finished";
    case "failed":
      return `failed before it finished: ${sentence(error)}`;
    case "max_steps":
      return "reached the step limit before it finished";
    case "lost":
      return "was interrupted because the app exited";
  }
}

/** `byUser`: the user stopped it from the 子 Agent panel. */
export function syncResult(input: {
  readonly agentId: string;
  readonly description: string;
  readonly transcriptPath: string;
  readonly logMissing?: boolean;
  readonly status: SubagentActivationStatus;
  readonly error?: string;
  readonly result: string;
  readonly truncated: boolean;
  readonly byUser?: boolean;
}): string {
  const phrase =
    input.byUser && input.status === "interrupted"
      ? "was stopped by the user before it finished"
      : statusPhrase(input.status, input.error);
  return [
    `Subagent ${input.agentId} (${input.description}) ${phrase}.`,
    transcriptLine(input),
    "",
    resultBody(input.result, input.truncated),
  ]
    .join("\n")
    .trimEnd();
}

/** The `<summary>` line of a completion notice and of a settle record (design 02 §6.2). A finished subagent takes no more work. */
export function settleSummary(input: {
  readonly agentId: string;
  readonly description: string;
  readonly status: SubagentActivationStatus;
  readonly error?: string;
}): string {
  const id = input.agentId;
  switch (input.status) {
    case "completed":
      return `Subagent ${id} finished.`;
    case "interrupted":
      return `Subagent ${id} was stopped before it finished.`;
    case "failed":
      return `Subagent ${id} failed before it finished: ${sentence(input.error)}.`;
    case "max_steps":
      return `Subagent ${id} reached the step limit before it finished.`;
    case "lost":
      return `Subagent ${id} (${input.description}) was interrupted because the app exited. Its transcript shows how far it got.`;
  }
}

/** Replaces the closing message when the subagent's last action was a message to its parent. */
export const CLOSING_OMITTED_NOTE = "It sent you a message just before finishing, so its closing message is omitted.";

/** A closing message as the notice carries it: the bounded final answer, with the truncation suffix. */
export function closingBody(text: string, truncated: boolean): string {
  return resultBody(text, truncated);
}

export type AgentRelation = "parent" | "child";

/** What the recipient of `send_message` reads; `relation` is the sender as seen from the recipient. */
export function agentMessage(from: string, relation: AgentRelation, message: string): string {
  return [`<agent_message from="${escapeXml(from)}" relation="${relation}">`, message, "</agent_message>"].join("\n");
}

export function messageDelivered(agentId: string, recipientRunning: boolean): string {
  return recipientRunning
    ? `Message delivered to ${agentId} (running; it will see it at its next step).`
    : `Message delivered to ${agentId} (it was idle and will read it now).`;
}

/** Appended to the first task message of a `local` or fork subagent (design 02 §7); `explore` drops the last line. */
export function taskGuidance(transcriptPath: string, preset: "general" | "explore" | "fork"): string {
  return [
    `Your final answer is delivered to your parent automatically. Your parent can read your transcript file (${transcriptPath}) to see every step you took, so your final answer only needs the conclusion and the key evidence (file paths, line numbers, command results); do not retell the process. If your last action is a message to your parent, your final answer is not delivered; put the result in that message.`,
    "You cannot ask the user anything or request approval. If you are blocked, say so in your final answer.",
    ...(preset === "explore"
      ? []
      : ["Other agents may be editing files at the same time; change only the files your task covers."]),
  ].join("\n");
}

/** Cut at a UTF-8 byte budget without splitting a character. */
export function truncateUtf8(
  text: string,
  limitBytes = SUBAGENT_RESULT_LIMIT_BYTES,
): { readonly text: string; readonly truncated: boolean } {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= limitBytes) return { text, truncated: false };
  let end = limitBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return { text: bytes.subarray(0, end).toString("utf8"), truncated: true };
}

function resultBody(text: string, truncated: boolean): string {
  return truncated ? `${text}\n${RESULT_TRUNCATED_SUFFIX}` : text;
}

/** One sentence of an error message, without its own final period (the template adds one). */
function sentence(error: string | undefined): string {
  const line =
    (error ?? "")
      .split("\n")
      .map((value) => value.trim())
      .find(Boolean) ?? "unknown error";
  return trimTrailing(line, ".。");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
