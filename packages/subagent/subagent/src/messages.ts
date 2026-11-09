import { SUBAGENT_RESULT_LIMIT_BYTES, type SubagentActivationStatus } from "@actspace/shared/runtime-v2";

/**
 * Every model-visible text of local subagents (design 02 §2, §5.2, §6.2, §7, §9), kept verbatim in one place.
 * Tool descriptions, parameter descriptions, results, notices and the task guidance all come from here.
 */

/** Running activations per main Session, counted across every kind. */
export const SUBAGENT_CONCURRENCY_LIMIT = 10;
/** A synchronous `agent` call returns after this long and the subagent moves to the background. */
export const SUBAGENT_SYNC_WAIT_MS = 30 * 60 * 1000;
/** An external subagent's call waits this long for the CLI to write its session log (design 04 §3.3). */
export const EXTERNAL_LOG_WAIT_MS = 10_000;
/** One activation runs at most this many steps. */
export const SUBAGENT_MAX_STEPS = 1000;

export const AGENT_TOOL_DESCRIPTION = [
  "Start a subagent: a separate agent with its own context that works on a task you hand it. It runs in the background by default; this call returns its id and transcript path at once, and you are notified when it finishes. The transcript file records every step it takes; read it when you need to check how it reached its result instead of trusting the summary alone.",
  "Subagents cannot ask the user for approval: actions that would need approval fail and the subagent reports the failure. When several writing subagents run in parallel, give each a disjoint set of files.",
  "Use send_message to add instructions or give a finished subagent more work, interrupt_agent to stop it, list_agents to see them, list_subagent_models to choose a model. At most 10 subagents run at once.",
].join("\n");

export const AGENT_PARAMETERS = Object.freeze({
  description: "A short (3-5 word) label for the task, shown in lists and the UI.",
  prompt: "The complete, self-contained task. The subagent does not see this conversation, so include everything it needs: goal, relevant files, constraints and what to report.",
  agent_preset: "general: all of your tools; it can edit files and run commands. explore: read-only (read_file, list_directory, grep, glob), for searching and reading.",
  background: "Run in the background and return at once (default). false waits for the result; after 30 minutes the call returns and the subagent keeps running in the background.",
  model: "Model key from list_subagent_models. Omit to use the default subagent model.",
  reasoning_effort: "Reasoning effort id for the chosen model, from list_subagent_models. Omit to use that model's default.",
});

export const AGENT_FORK_DESCRIPTION = "Start a subagent that inherits this conversation: it sees everything up to your last completed step in this turn (not the step that contains this call), with your tools and model, so its first request reuses this conversation's prompt cache. Use it for work that builds on the current context, such as trying an alternative, reviewing what was just done, or a side investigation, without spending this conversation's context on it. Choosing a different model loses the cache. It cannot start subagents of its own. Otherwise it behaves like agent: background by default, transcript path returned, notified when it finishes, continued with send_message.";

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
  return `Run a task with the local ${label} CLI as a subagent, in this workspace. It runs once and cannot receive follow-up messages. It uses ${label}'s own permissions (no approval prompts) and its own model settings. You get its final message and the path of its native session log (JSONL; long lines). Background by default; you are notified when it finishes; interrupt_agent stops it for good.`;
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
export function externalStartFailed(label: string, error: string): string { return `${label} could not start: ${error}`; }

export const SEND_MESSAGE_DESCRIPTION = "Send a message to another agent in your subagent tree. A running agent receives it at its next step; an inactive agent starts a new turn with it. Returns at once.";
export const SEND_MESSAGE_PARAMETERS = Object.freeze({ agent_id: "The id of another agent in your subagent tree, as shown by list_agents." });

export const WAIT_AGENT_DESCRIPTION = "Wait until new input arrives for you: a subagent's completion notice, an agent message or a user message. Returns at once when such input is already pending. Use it only when you have nothing else to do.";
export const LIST_AGENTS_DESCRIPTION = "List your subagent tree with ids, status and transcript paths. running means it is working; inactive means it is idle and can be given more work with send_message; closed means it cannot receive messages. You are notified when a subagent finishes; do not poll this list.";
export const INTERRUPT_AGENT_DESCRIPTION = "Stop a subagent's current work. Returns without waiting. A local subagent keeps its conversation and can be continued later with send_message; an external subagent stops for good.";
export const LIST_SUBAGENT_MODELS_DESCRIPTION = "List the models a subagent can use, with their reasoning efforts. Call it before choosing a model or reasoning effort for agent or agent_fork.";

/** Failure text of an `ask` in a subagent, which has no approval broker. */
export const SUBAGENT_APPROVAL_UNAVAILABLE = "This action needs the user's approval, which a subagent cannot request. Report what you need to your parent instead.";

export const SUBAGENT_LIMIT_REACHED = `${SUBAGENT_CONCURRENCY_LIMIT} subagents are already running. Wait for one to finish or interrupt one.`;

export function unknownModel(key: string): string { return `Unknown model ${key}. Call list_subagent_models to see the available models.`; }
export function unknownEffort(effort: string, key: string): string { return `Unknown reasoning effort ${effort} for ${key}. Call list_subagent_models to see the available efforts.`; }
export function blockedTool(name: string): string { return `Subagents cannot use ${name}.`; }
export function externalCannotReceive(agentId: string): string { return `${agentId} is an external subagent and cannot receive messages.`; }
export function unknownAgent(agentId: string): string { return `Unknown agent ${agentId}. Call list_agents to see your subagent tree.`; }
export const CANNOT_MESSAGE_SELF = "You cannot send a message to yourself.";

/** `external`: the CLI label of an external subagent (design 04 §2), which takes no messages. */
type StartedText = { readonly agentId: string; readonly description: string; readonly transcriptPath: string; readonly forked?: boolean; readonly external?: string; readonly logMissing?: boolean };

export function backgroundStarted(input: StartedText): string {
  const what = input.external ? `${input.external} subagent` : input.forked ? "forked subagent" : "subagent";
  return [`Started ${what} ${input.agentId} (${input.description}) in the background.`, transcriptLine(input), whileRunning(input.external)].join("\n");
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
    ? "You will be notified when it finishes; do not wait for it unless you have nothing else to do."
    : "You will be notified when it finishes. Use send_message to add instructions; do not wait for it unless you have nothing else to do.";
}

export const RESULT_TRUNCATED_SUFFIX = "[truncated; read the transcript for the full answer]";

/** How one activation ended, as the phrase after `Subagent <id> (<description>)`. */
function statusPhrase(status: SubagentActivationStatus, error?: string): string {
  switch (status) {
    case "completed": return "finished";
    case "interrupted": return "was stopped before it finished";
    case "failed": return `failed before it finished: ${sentence(error)}`;
    case "max_steps": return "reached the step limit before it finished";
    case "lost": return "was interrupted because the app exited";
  }
}

export function syncResult(input: { readonly agentId: string; readonly description: string; readonly transcriptPath: string; readonly logMissing?: boolean; readonly status: SubagentActivationStatus; readonly error?: string; readonly result: string; readonly truncated: boolean }): string {
  return [
    `Subagent ${input.agentId} (${input.description}) ${statusPhrase(input.status, input.error)}.`,
    transcriptLine(input),
    "",
    resultBody(input.result, input.truncated),
  ].join("\n").trimEnd();
}

/** The `<summary>` line of a completion notice (design 02 §6.2). */
export function settleSummary(input: { readonly agentId: string; readonly description: string; readonly status: SubagentActivationStatus; readonly error?: string; readonly external?: boolean }): string {
  const id = input.agentId;
  switch (input.status) {
    case "completed": return input.external ? `Subagent ${id} finished. It cannot receive follow-up messages.` : `Subagent ${id} finished and will do no further work unless you send it more.`;
    case "interrupted": return input.external ? `Subagent ${id} was stopped before it finished.` : `Subagent ${id} was stopped before it finished. Send it a message to continue.`;
    case "failed": return `Subagent ${id} failed before it finished: ${sentence(input.error)}.`;
    case "max_steps": return `Subagent ${id} reached the step limit before it finished.`;
    case "lost": return `Subagent ${id} (${input.description}) was interrupted because the app exited. Its transcript shows how far it got.${input.external ? "" : " Send it a message with send_message to continue it."}`;
  }
}

export function subagentNotification(input: { readonly agentId: string; readonly description: string; readonly status: SubagentActivationStatus; readonly summary: string; readonly transcriptPath: string; readonly closing?: { readonly text: string; readonly truncated: boolean } | "omitted" }): string {
  const closing = input.closing === undefined ? []
    : input.closing === "omitted" ? ["<note>It sent you a message just before finishing, so its closing message is omitted.</note>"]
      : ["<closing_message>", resultBody(input.closing.text, input.closing.truncated) || "(no closing message)", "</closing_message>"];
  return [
    "<subagent_notification>",
    `<agent_id>${escapeXml(input.agentId)}</agent_id>`,
    `<description>${escapeXml(input.description)}</description>`,
    `<status>${input.status}</status>`,
    `<summary>${escapeXml(input.summary)}</summary>`,
    `<transcript>${escapeXml(input.transcriptPath)}</transcript>`,
    ...closing,
    "</subagent_notification>",
  ].join("\n");
}

export type AgentRelation = "parent" | "child" | "sibling";

/** What the recipient of `send_message` reads; `relation` is the sender as seen from the recipient. */
export function agentMessage(from: string, relation: AgentRelation, message: string): string {
  return [`<agent_message from="${escapeXml(from)}" relation="${relation}">`, message, "</agent_message>"].join("\n");
}

export function messageDelivered(agentId: string, started: boolean): string {
  return started ? `Message delivered to ${agentId} (it was inactive and has started working on it).` : `Message delivered to ${agentId} (running; it will see it at its next step).`;
}

export const INPUT_ARRIVED = "Input arrived.";
export function waitTimedOut(ms: number): string { return `Timed out after ${Math.round(ms / 1000)}s with no new input.`; }

export function interruptRequested(agentId: string): string { return `Stopping subagent ${agentId}. You will be notified when it stops.`; }
export function notRunning(agentId: string): string { return `Subagent ${agentId} is not running.`; }

/** Appended to the first task message of a `local` or fork subagent (design 02 §7); `explore` drops the last line. */
export function taskGuidance(transcriptPath: string, preset: "general" | "explore" | "fork"): string {
  return [
    `Your final answer is delivered to your parent automatically. Your parent can read your transcript file (${transcriptPath}) to see every step you took, so your final answer only needs the conclusion and the key evidence (file paths, line numbers, command results); do not retell the process. If your last action is a message to your parent, your final answer is not delivered; put the result in that message.`,
    "You cannot ask the user anything or request approval. If you are blocked, say so in your final answer.",
    ...(preset === "explore" ? [] : ["Other agents may be editing files at the same time; change only the files your task covers."]),
  ].join("\n");
}

/** Cut at a UTF-8 byte budget without splitting a character. */
export function truncateUtf8(text: string, limitBytes = SUBAGENT_RESULT_LIMIT_BYTES): { readonly text: string; readonly truncated: boolean } {
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
  const line = (error ?? "").split("\n").map(value => value.trim()).find(Boolean) ?? "unknown error";
  return line.replace(/[.。]+$/u, "");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
