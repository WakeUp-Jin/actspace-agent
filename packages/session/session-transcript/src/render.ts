import type { SessionEventEnvelopeV1, SessionHeaderV1 } from "@actspace/session-journal";

/** One rendered piece of the transcript, anchored to the Journal seq it cites. */
export type TranscriptBlock = { readonly seq: number; readonly text: string };

type PendingCall = { readonly seq: number; readonly name: string; readonly summary: string };

/**
 * Incremental Markdown projection of one Session Journal. Reducers return a new
 * state object, so the same reducer works with `journal.project` (live session)
 * and with a plain fold over events read from disk.
 */
export type TranscriptState = {
  readonly blocks: readonly TranscriptBlock[];
  readonly pending: Readonly<Record<string, PendingCall>>;
  readonly title: string | null;
  readonly speaker: "user" | "assistant" | null;
  /** Delegated subagent Sessions referenced by `agent` tool results, in call order. */
  readonly children: readonly string[];
  readonly lastTime: string | null;
  readonly throughSeq: number;
};

/** Another Session that branched off this one (side chat or fork) at `boundarySeq`. */
export type TranscriptBranch = { readonly sessionId: string; readonly origin: "fork" | "side-chat"; readonly boundarySeq: number };

export const EMPTY_TRANSCRIPT: TranscriptState = Object.freeze({ blocks: Object.freeze([]), pending: Object.freeze({}), title: null, speaker: null, children: Object.freeze([]), lastTime: null, throughSeq: -1 });

const LINE_LIMIT = 200;

/**
 * Events at or below `inheritedThroughSeq` were copied from a parent (fork or
 * side chat). Only the title is taken from them; their content lives in the
 * parent's transcript.
 */
export function reduceTranscript(state: TranscriptState, event: SessionEventEnvelopeV1, inheritedThroughSeq = -1): TranscriptState {
  const data = record(event.data);
  const base = { ...state, lastTime: event.time, throughSeq: event.seq };
  if (event.type === "session/title-set" || event.type === "session/title") {
    if (typeof data.title === "string" && data.title.trim()) return { ...base, title: data.title.trim() };
    // A manual rename to an empty title clears it.
    return event.type === "session/title-set" && data.title === null ? { ...base, title: null } : base;
  }
  if (event.seq <= inheritedThroughSeq) return base;
  switch (event.type) {
    case "user/message":
    case "agent/inbox/spliced": {
      const node = event.surface?.kind === "append" ? event.surface.node : null;
      if (node?.kind !== "user") return base;
      const label = event.type === "user/message" ? "User" : data.source === "task_notification" ? "Background task notification" : data.source === "steer" ? "User (sent while the agent was working)" : "User";
      const body = contentText(node.content) || "(empty message)";
      return { ...push(base, event.seq, `## ${label} [#${event.seq}] · ${formatTime(event.time)}\n\n${body}`), speaker: "user" };
    }
    case "assistant/message": {
      const body = contentText(data.content);
      const header = state.speaker === "assistant" ? null : `## Assistant [#${event.seq}] · ${formatTime(event.time)}`;
      const text = [header, body].filter(Boolean).join("\n\n");
      return { ...(text ? push(base, event.seq, text) : base), speaker: "assistant" };
    }
    case "tool/call": {
      const callId = typeof data.callId === "string" ? data.callId : null;
      if (callId === null) return base;
      const name = typeof data.name === "string" ? data.name : "tool";
      return { ...base, pending: { ...state.pending, [callId]: { seq: event.seq, name, summary: summarizeArgs(record(data.args)) } } };
    }
    case "tool/result":
    case "tool/recovery-outcome": {
      const callId = typeof data.callId === "string" ? data.callId : null;
      const call = callId === null ? undefined : state.pending[callId];
      const pending = { ...state.pending };
      if (callId !== null) delete pending[callId];
      const name = call?.name ?? (typeof data.name === "string" ? data.name : "tool");
      const child = delegatedChild(data);
      const status = typeof data.status === "string" ? data.status : event.surface?.kind === "append" && event.surface.node.kind === "tool-result" && event.surface.node.isError ? "failed" : "completed";
      const output = resultText(data, event);
      const outcome = [status, child ? `subagent session ${child} (transcript: ../${child}/transcript.md)` : null].filter(Boolean).join(" · ");
      const text = `- [#${call?.seq ?? event.seq}] ${name}${call?.summary ? `: ${call.summary}` : ""}\n  → ${outcome}${output ? `: ${output}` : ""}`;
      const next = push({ ...base, pending }, call?.seq ?? event.seq, text);
      return child && !state.children.includes(child) ? { ...next, children: [...state.children, child] } : next;
    }
    case "surface/replaced": {
      const node = event.surface?.kind === "replace" ? event.surface.node : null;
      const summary = node ? contentText(node.content).trim() : "";
      const quoted = summary ? summary.split("\n").map(line => line ? `> ${line}` : ">").join("\n") : "> (no summary text)";
      return { ...push(base, event.seq, `---\n\n### Context compaction [#${event.seq}] · ${formatTime(event.time)}\n\nThe messages above were summarized for the model at this point. Summary:\n\n${quoted}\n\n---`), speaker: null };
    }
    case "turn/end": {
      let next: TranscriptState = { ...base, pending: {} };
      for (const call of Object.values(state.pending).sort((a, b) => a.seq - b.seq)) {
        next = push(next, call.seq, `- [#${call.seq}] ${call.name}${call.summary ? `: ${call.summary}` : ""}\n  → no result recorded`);
      }
      const reason = typeof data.reason === "string" ? data.reason : "completed";
      return reason === "completed" ? next : { ...push(next, event.seq, `_Turn ended: ${reason} [#${event.seq}]_`), speaker: null };
    }
    default:
      return base;
  }
}

export function foldTranscript(events: Iterable<SessionEventEnvelopeV1>, inheritedThroughSeq = -1): TranscriptState {
  let state = EMPTY_TRANSCRIPT;
  for (const event of events) state = reduceTranscript(state, event, inheritedThroughSeq);
  return state;
}

/** Events copied from the parent at fork time; delegated children start fresh. */
export function inheritedThroughSeq(header: SessionHeaderV1): number {
  const lineage = header.lineage;
  return lineage && lineage.origin !== "delegation" ? lineage.parentBoundarySeq : -1;
}

export function renderTranscript(header: SessionHeaderV1, state: TranscriptState, branches: readonly TranscriptBranch[] = []): string {
  const lineage = header.lineage;
  const facts = [
    `- Session ID: ${header.sessionId}`,
    `- Created: ${formatTime(header.createdAt)}`,
    ...(state.lastTime ? [`- Last activity: ${formatTime(state.lastTime)}`] : []),
    ...(header.cwd ? [`- Working directory: ${header.cwd}`] : []),
    `- Origin: ${origin(header)}`,
    ...(lineage && lineage.origin !== "delegation" ? [`- Events up to [#${lineage.parentBoundarySeq}] were copied from session ${lineage.parentSessionId}; read ../${lineage.parentSessionId}/transcript.md for that part.`] : []),
  ];
  const marks: TranscriptBlock[] = branches.map(branch => ({
    seq: branch.boundarySeq,
    text: `> ${branch.origin === "side-chat" ? "Side chat" : "Fork"} opened here → session ${branch.sessionId} (transcript: ../${branch.sessionId}/transcript.md)`,
  }));
  // Stable merge: a branch mark goes after every block anchored at or before its boundary.
  const body = [...state.blocks.map((block, index) => ({ block, key: block.seq, order: index })), ...marks.map((block, index) => ({ block, key: block.seq + 0.5, order: index }))]
    .sort((a, b) => a.key - b.key || a.order - b.order)
    .map(item => item.block.text);
  return [
    `# ${state.title ?? "Untitled session"}`,
    "",
    ...facts,
    "",
    "Reasoning, streaming chunks and model request snapshots are omitted; tool results are cut to one line. `[#N]` is the Journal event number; cite a passage as session ID + `[#N]`.",
    "",
    body.length ? body.join("\n\n") : "_No messages yet._",
    "",
  ].join("\n");
}

function origin(header: SessionHeaderV1): string {
  const lineage = header.lineage;
  if (!lineage) return "main session";
  if (lineage.origin === "delegation") return `subagent delegated by session ${lineage.parentSessionId} (transcript: ../${lineage.parentSessionId}/transcript.md)`;
  return `${lineage.origin === "side-chat" ? "side chat" : "fork"} of session ${lineage.parentSessionId}`;
}

function push(state: TranscriptState, seq: number, text: string): TranscriptState {
  return { ...state, blocks: [...state.blocks, { seq, text }] };
}

function delegatedChild(data: Record<string, unknown>): string | null {
  if (!Array.isArray(data.detail)) return null;
  for (const item of data.detail) {
    const value = record(record(item).value);
    if (record(item).label === "delegation" && typeof value.childSessionId === "string") return value.childSessionId;
  }
  return null;
}

function resultText(data: Record<string, unknown>, event: SessionEventEnvelopeV1): string {
  const failure = record(data.failure);
  const raw = (typeof failure.message === "string" && failure.message)
    || contentText(data.modelOutput)
    || (event.surface?.kind === "append" ? contentText(event.surface.node.content) : "")
    || (typeof data.summary === "string" ? data.summary : "");
  const lines = raw.split("\n").map(line => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  const more = lines.length > 1 ? ` (+${lines.length - 1} more lines)` : "";
  return `${clip(lines[0]!)}${more}`;
}

const ARG_KEYS = ["command", "path", "file_path", "pattern", "query", "url", "task", "description", "prompt", "name"] as const;

function summarizeArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ARG_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) parts.push(key === "command" || key === "task" || key === "prompt" || key === "path" || key === "file_path" ? value : `${key}=${value}`);
    if (parts.length === 2) break;
  }
  const text = parts.length ? parts.join(" ") : Object.keys(args).length ? JSON.stringify(args) : "";
  return clip(text.replace(/\s+/g, " ").trim());
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(partText).filter(Boolean).join("\n\n");
  const item = record(value);
  if (typeof item.text === "string") return item.text;
  return "content" in item ? contentText(item.content) : "";
}

function partText(part: unknown): string {
  if (typeof part === "string") return part;
  const item = record(part);
  if (item.type === "reasoning" || item.type === "tool-call") return "";
  if (typeof item.text === "string") return item.text;
  const label = [item.label, item.name, item.fileName, item.filename].find((value): value is string => typeof value === "string" && value.length > 0);
  const mediaType = typeof item.mediaType === "string" ? item.mediaType : typeof record(item.artifact).mediaType === "string" ? String(record(item.artifact).mediaType) : typeof item.mimeType === "string" ? item.mimeType : "";
  const kind = item.type === "image" || mediaType.startsWith("image/") ? "image" : "attachment";
  if (label || item.type === "image" || item.type === "artifact" || item.type === "file") return `[${kind}${label ? `: ${label}` : ""}]`;
  return "";
}

function clip(text: string): string {
  return text.length > LINE_LIMIT ? `${text.slice(0, LINE_LIMIT)}…` : text;
}

/** Local wall-clock time with offset, e.g. `2026-10-28 21:58 +08:00`. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} ${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
