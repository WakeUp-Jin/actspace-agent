import type { SubagentCaller } from "./types.js";

/** The two external subagent kinds (design 04); each comes from its own optional plugin. */
export type ExternalSubagentKind = "codex" | "claude-code";

/** How one external run ended. `text` is the CLI's final reply; `error` the first line of what went wrong. */
export type ExternalRunResult = { readonly status: "completed" | "failed" | "interrupted"; readonly text: string; readonly error?: string };

/** One started CLI process: a single Turn that cannot be continued. */
export type ExternalRun = {
  /** The CLI's own session record (JSONL); it may appear on disk a moment after the run starts. */
  readonly transcriptPath: string;
  /** Settles once the process has exited; never rejects. */
  readonly result: Promise<ExternalRunResult>;
  /** Stop the run for good; `result` then settles with `interrupted` unless it already finished. */
  interrupt(): Promise<void>;
};

export type ExternalStartInput = { readonly prompt: string; readonly cwd: string; readonly model?: string; readonly signal: AbortSignal };

/** A local CLI that runs one task as a subagent (Codex, Claude Code). The Host manager schedules it like any subagent. */
export interface ExternalSubagentBackend {
  readonly kind: ExternalSubagentKind;
  /** `Codex` / `Claude Code`, as the model and the UI read it. */
  readonly label: string;
  /** The tool that starts it: `agent_codex` / `agent_claude_code`. */
  readonly toolName: string;
  available(): Promise<{ readonly ok: true; readonly command: string } | { readonly ok: false; readonly reason: string }>;
  /** Start the process; rejects when it cannot start at all (no record path exists then). */
  start(input: ExternalStartInput): Promise<ExternalRun>;
}

export type SpawnExternalInput = SubagentCaller & {
  readonly description: string;
  readonly prompt: string;
  readonly background: boolean;
  readonly model?: string;
  readonly signal: AbortSignal;
};

/** The first non-empty line of a CLI error, for the `failed` summary (design 04 §3.3). */
export function firstErrorLine(value: unknown): string {
  const text = value instanceof Error ? value.message : typeof value === "string" ? value : String(value);
  return text.split("\n").map(line => line.trim()).find(Boolean) ?? "unknown error";
}
