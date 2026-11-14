import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import {
  firstErrorLine,
  OutputTail,
  resolveCommand,
  terminate,
  type ExternalRun,
  type ExternalRunResult,
  type ExternalSubagentBackend,
} from "@actspace/subagent";

export const CODEX_APPROVAL_POLICIES = Object.freeze(["untrusted", "on-request", "never"] as const);
export const CODEX_SANDBOX_MODES = Object.freeze(["read-only", "workspace-write", "danger-full-access"] as const);
export type CodexConfig = {
  readonly approvalPolicy: (typeof CODEX_APPROVAL_POLICIES)[number];
  readonly sandbox: (typeof CODEX_SANDBOX_MODES)[number];
};
export const DEFAULT_CODEX_CONFIG: CodexConfig = Object.freeze({ approvalPolicy: "never", sandbox: "workspace-write" });

export const CODEX_NOT_FOUND = "本机没有找到 codex 命令";
export const CODEX_NOT_LOGGED_IN = "Codex is not logged in. Run codex login in a terminal.";
/** `initialize` → `thread/start` → `turn/start` must answer within this time. */
const STARTUP_TIMEOUT_MS = 60_000;

/** Plugin settings, with unknown values falling back to the defaults (design 04 §4). */
export function codexConfig(input: Readonly<Record<string, unknown>> | undefined): CodexConfig {
  const approvalPolicy =
    CODEX_APPROVAL_POLICIES.find((value) => value === input?.approvalPolicy) ?? DEFAULT_CODEX_CONFIG.approvalPolicy;
  const sandbox = CODEX_SANDBOX_MODES.find((value) => value === input?.sandbox) ?? DEFAULT_CODEX_CONFIG.sandbox;
  return Object.freeze({ approvalPolicy, sandbox });
}

export type CodexBackendOptions = {
  readonly config?: CodexConfig;
  /** Absolute path of `codex`; defaults to the login-shell lookup. */
  readonly command?: () => Promise<string | undefined>;
  readonly env?: NodeJS.ProcessEnv;
  readonly stopGraceMs?: number;
};

/**
 * `agent_codex` (design 04 §3.1): `codex app-server` over stdio JSON-RPC, one non-ephemeral thread and one turn.
 * The record path is the thread's rollout file; server requests (approvals, elicitation) are always refused.
 */
export function createCodexBackend(options: CodexBackendOptions = {}): ExternalSubagentBackend {
  const config = options.config ?? DEFAULT_CODEX_CONFIG;
  const command = options.command ?? (() => resolveCommand("codex"));
  return Object.freeze<ExternalSubagentBackend>({
    kind: "codex" as const,
    label: "Codex",
    toolName: "agent_codex",
    available: async () => {
      const path = await command();
      return path ? { ok: true as const, command: path } : { ok: false as const, reason: CODEX_NOT_FOUND };
    },
    start: async (input) => {
      const path = await command();
      if (!path) throw new Error(CODEX_NOT_FOUND);
      const child = spawn(path, ["app-server"], {
        cwd: input.cwd,
        env: options.env ?? process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const client = new CodexClient(child, options.stopGraceMs);
      const abort = () => {
        void client.close();
      };
      input.signal.addEventListener("abort", abort, { once: true });
      try {
        await client.withTimeout(async () => {
          await client.request("initialize", {
            clientInfo: { name: "actspace", title: "ActSpace", version: "1" },
            capabilities: null,
          });
          client.notify("initialized");
          const account = record(await client.request("account/read", {}));
          if (account.account === null && account.requiresOpenaiAuth === true) throw new Error(CODEX_NOT_LOGGED_IN);
          const started = record(
            await client.request("thread/start", {
              cwd: input.cwd,
              approvalPolicy: config.approvalPolicy,
              sandbox: config.sandbox,
              ...(input.model ? { model: input.model } : {}),
              ephemeral: false,
            }),
          );
          const thread = record(started.thread);
          if (typeof thread.id !== "string" || typeof thread.path !== "string" || !thread.path)
            throw new Error("Codex did not return a session log path.");
          client.threadId = thread.id;
          client.transcriptPath = thread.path;
          const turn = record(
            record(
              await client.request("turn/start", {
                threadId: thread.id,
                input: [{ type: "text", text: input.prompt, text_elements: [] }],
              }),
            ).turn,
          );
          if (typeof turn.id === "string") client.turnId = turn.id;
        }, STARTUP_TIMEOUT_MS);
      } catch (error) {
        await client.close();
        throw input.signal.aborted ? new Error("Stopped before Codex started.") : error;
      } finally {
        input.signal.removeEventListener("abort", abort);
      }
      return Object.freeze<ExternalRun>({
        transcriptPath: client.transcriptPath!,
        result: client.result,
        interrupt: () => client.interrupt(),
      });
    },
  });
}

type Pending = { resolve(value: unknown): void; reject(error: Error): void };

/** One `codex app-server` process: line-delimited JSON-RPC, the turn's final message and how it ended. */
class CodexClient {
  threadId: string | undefined;
  turnId: string | undefined;
  transcriptPath: string | undefined;
  readonly result: Promise<ExternalRunResult>;
  #finish!: (value: ExternalRunResult) => void;
  #next = 1;
  readonly #pending = new Map<number, Pending>();
  readonly #stderr = new OutputTail();
  #finalText = "";
  #lastError: string | undefined;
  #outcome: ExternalRunResult | undefined;
  #interrupted = false;
  #exited = false;

  constructor(
    private readonly child: ChildProcess,
    private readonly stopGraceMs?: number,
  ) {
    this.result = new Promise((resolve) => {
      this.#finish = resolve;
    });
    child.stderr!.on("data", (chunk) => this.#stderr.push(chunk));
    child.stdin!.on("error", () => undefined);
    createInterface({ input: child.stdout! }).on("line", (line) => this.#line(line));
    child.once("error", (error) => this.#exit(error.message));
    child.once("close", (code, signal) =>
      this.#exit(code === 0 ? undefined : `codex app-server exited with ${signal ?? `code ${code}`}`),
    );
  }

  request(method: string, params: unknown): Promise<unknown> {
    if (this.#exited) return Promise.reject(new Error(this.#exitError("codex app-server is not running")));
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#send({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string): void {
    this.#send({ jsonrpc: "2.0", method });
  }

  async withTimeout(work: () => Promise<void>, ms: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`codex app-server did not start within ${ms / 1000}s`)), ms);
    });
    try {
      await Promise.race([work(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** `turn/interrupt` first; the process is killed when the turn has not ended within the grace period. */
  async interrupt(): Promise<void> {
    if (this.#exited) return;
    this.#interrupted = true;
    if (this.threadId && this.turnId && !this.#outcome) {
      const ended = this.result.then(() => true);
      const graceful = await Promise.race([
        this.request("turn/interrupt", { threadId: this.threadId, turnId: this.turnId }).then(
          () => ended,
          () => false,
        ),
        delay(this.stopGraceMs ?? 2_000).then(() => false),
      ]);
      if (graceful) return;
    }
    await this.close();
  }

  close(): Promise<void> {
    return terminate(this.child, this.stopGraceMs);
  }

  #line(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = record(JSON.parse(line));
    } catch {
      return;
    }
    const id = message.id,
      method = message.method;
    if (typeof method === "string" && (typeof id === "number" || typeof id === "string")) {
      // Approvals, user input, elicitation, dynamic tools: a subagent answers none of them.
      this.#send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `${method} is not supported by ActSpace subagents` },
      });
      return;
    }
    if (typeof id === "number") {
      const pending = this.#pending.get(id);
      if (!pending) return;
      this.#pending.delete(id);
      const error = record(message.error);
      if (message.error !== undefined)
        pending.reject(
          new Error(typeof error.message === "string" ? error.message : "codex app-server request failed"),
        );
      else pending.resolve(message.result);
      return;
    }
    const params = record(message.params);
    if (method === "item/completed") {
      const item = record(params.item);
      if (item.type === "agentMessage" && typeof item.text === "string") this.#finalText = item.text;
    } else if (method === "error") {
      const error = record(params.error);
      if (params.willRetry !== true && typeof error.message === "string") this.#lastError = error.message;
    } else if (method === "turn/completed") {
      const turn = record(params.turn);
      if (this.turnId && turn.id !== undefined && turn.id !== this.turnId) return;
      const status =
        turn.status === "completed" ? "completed" : turn.status === "interrupted" ? "interrupted" : "failed";
      const error = record(turn.error);
      this.#outcome =
        status === "failed"
          ? {
              status,
              text: this.#finalText,
              error: firstErrorLine(
                typeof error.message === "string" ? error.message : (this.#lastError ?? "Codex turn failed"),
              ),
            }
          : { status, text: this.#finalText };
      // One turn per run: the server has nothing left to do.
      void this.close();
    }
  }

  #exit(error: string | undefined): void {
    if (this.#exited) return;
    this.#exited = true;
    const message = this.#exitError(error ?? "codex app-server exited");
    for (const pending of this.#pending.values()) pending.reject(new Error(message));
    this.#pending.clear();
    if (this.#outcome) {
      this.#finish(this.#outcome);
      return;
    }
    if (this.#interrupted) {
      this.#finish({ status: "interrupted", text: this.#finalText });
      return;
    }
    this.#finish({ status: "failed", text: this.#finalText, error: firstErrorLine(this.#lastError ?? message) });
  }

  #exitError(fallback: string): string {
    return this.#stderr.lastLine() ?? fallback;
  }

  #send(message: unknown): void {
    if (this.#exited || !this.child.stdin?.writable) return;
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
