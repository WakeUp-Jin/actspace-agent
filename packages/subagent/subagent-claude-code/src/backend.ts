import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { firstErrorLine, OutputTail, resolveCommand, terminate, type ExternalRun, type ExternalRunResult, type ExternalSubagentBackend } from "@actspace/subagent";

export const CLAUDE_CODE_PERMISSION_MODES = Object.freeze(["dontAsk", "acceptEdits", "auto", "manual", "plan", "bypassPermissions"] as const);
export type ClaudeCodeConfig = { readonly permissionMode: (typeof CLAUDE_CODE_PERMISSION_MODES)[number] };
/** `dontAsk`: anything the user has not allowed is refused, never prompted (design 04 §4). */
export const DEFAULT_CLAUDE_CODE_CONFIG: ClaudeCodeConfig = Object.freeze({ permissionMode: "dontAsk" });

export const CLAUDE_NOT_FOUND = "本机没有找到 claude 命令";

export function claudeCodeConfig(input: Readonly<Record<string, unknown>> | undefined): ClaudeCodeConfig {
  return Object.freeze({ permissionMode: CLAUDE_CODE_PERMISSION_MODES.find(value => value === input?.permissionMode) ?? DEFAULT_CLAUDE_CODE_CONFIG.permissionMode });
}

/**
 * Claude Code's project directory name for a working directory: the real path with every
 * non-alphanumeric character replaced by `-` (`/private/tmp/a.b` → `-private-tmp-a-b`; checked
 * against a real run of Claude Code 2.1.317).
 */
export function encodeClaudeProjectPath(cwd: string): string {
  let path = resolve(cwd);
  try { path = realpathSync(path); } catch { /* not created yet: Claude Code sees the same string */ }
  return path.replace(/[^a-zA-Z0-9]/g, "-");
}

/** `~/.claude/projects/<encoded cwd>/<session id>.jsonl`; `CLAUDE_CONFIG_DIR` moves `~/.claude`. */
export function claudeTranscriptPath(cwd: string, sessionId: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects", encodeClaudeProjectPath(cwd), `${sessionId}.jsonl`);
}

export type ClaudeCodeBackendOptions = {
  readonly config?: ClaudeCodeConfig;
  /** Absolute path of `claude`; defaults to the login-shell lookup. */
  readonly command?: () => Promise<string | undefined>;
  readonly env?: NodeJS.ProcessEnv;
  readonly stopGraceMs?: number;
};

/**
 * `agent_claude_code` (design 04 §3.2): `claude -p` with stream-json output and a session id chosen here,
 * so the record path is known before the process starts. The prompt goes in on stdin.
 */
export function createClaudeCodeBackend(options: ClaudeCodeBackendOptions = {}): ExternalSubagentBackend {
  const config = options.config ?? DEFAULT_CLAUDE_CODE_CONFIG;
  const command = options.command ?? (() => resolveCommand("claude"));
  const env = options.env ?? process.env;
  return Object.freeze<ExternalSubagentBackend>({
    kind: "claude-code" as const,
    label: "Claude Code",
    toolName: "agent_claude_code",
    available: async () => {
      const path = await command();
      return path ? { ok: true as const, command: path } : { ok: false as const, reason: CLAUDE_NOT_FOUND };
    },
    start: async input => {
      const path = await command();
      if (!path) throw new Error(CLAUDE_NOT_FOUND);
      input.signal.throwIfAborted();
      const sessionId = randomUUID();
      const args = ["-p", "--output-format", "stream-json", "--verbose", "--session-id", sessionId, "--permission-mode", config.permissionMode, ...(input.model ? ["--model", input.model] : [])];
      const child = spawn(path, args, { cwd: input.cwd, env, stdio: ["pipe", "pipe", "pipe"] });
      const stderr = new OutputTail();
      child.stderr.on("data", chunk => stderr.push(chunk));
      child.stdin.on("error", () => undefined);
      await new Promise<void>((started, failed) => {
        child.once("spawn", () => started());
        child.once("error", failed);
      });
      let outcome: ExternalRunResult | undefined;
      let lastAssistantText = "";
      let interrupted = false;
      createInterface({ input: child.stdout }).on("line", line => {
        let message: Record<string, unknown>;
        try { message = record(JSON.parse(line)); } catch { return; }
        if (message.type === "assistant") {
          const text = assistantText(message.message);
          if (text) lastAssistantText = text;
        } else if (message.type === "result") {
          const text = typeof message.result === "string" ? message.result : lastAssistantText;
          outcome = message.is_error === true
            ? { status: "failed", text, error: firstErrorLine(text || (typeof message.subtype === "string" ? message.subtype : "Claude Code failed")) }
            : { status: "completed", text };
        }
      });
      const result = new Promise<ExternalRunResult>(settle => {
        child.once("close", (code, signal) => {
          if (outcome) settle(outcome);
          else if (interrupted) settle({ status: "interrupted", text: lastAssistantText });
          else settle({ status: "failed", text: lastAssistantText, error: firstErrorLine(stderr.lastLine() ?? `claude exited with ${signal ?? `code ${code}`}`) });
        });
      });
      child.stdin.end(input.prompt);
      return Object.freeze<ExternalRun>({
        transcriptPath: claudeTranscriptPath(input.cwd, sessionId, env),
        result,
        interrupt: async () => { interrupted = true; await terminate(child, options.stopGraceMs); },
      });
    },
  });
}

function assistantText(message: unknown): string {
  const content = record(message).content;
  if (!Array.isArray(content)) return "";
  return content.map(block => record(block)).filter(block => block.type === "text" && typeof block.text === "string").map(block => block.text as string).join("");
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
