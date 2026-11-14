import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, realpathSync } from "node:fs";
import { mkdir, open, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { sessionScratchDirectory } from "./scratch.js";
export { sessionScratchDirectory } from "./scratch.js";
import * as nodePath from "node:path";
import { delimiter, join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { isLexicallyInside, toolChildEnv } from "@actspace/shared";
import { CONTEXT_TRACE_DETAIL_LABEL, type RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { spawnHostProcess } from "@actspace/sandbox/node-ports";
import type {
  HostProcessSpec,
  SandboxExecution,
  SandboxRequest,
  SandboxResult,
  SandboxService,
} from "@actspace/sandbox/types";
import type { BackgroundTaskHost, BackgroundTaskTerminal } from "@actspace/background-tasks";
import type { ToolBodyResult, ToolExecutionContext } from "@actspace/tool-runtime";
import { redactToolText } from "@actspace/tool-runtime";
import type { BashPythonRuntime, ToolPorts } from "./plugin.js";
import { SessionBashLogs, sweepStaleScratchDirectories } from "./bash-log.js";

const INLINE_OUTPUT_CHARS = 8_000;
const OUTPUT_DISK_CAP_CHARS = 5 * 1024 * 1024;
const OUTPUT_PREVIEW_BYTES = 32 * 1024;
const DEFAULT_BLOCK_MS = 30_000;
const MAX_BLOCK_MS = 600_000;
const MAX_RUNTIME_MS = 30 * 60_000;
const MAX_BACKGROUND_PER_SESSION = 5;
/** Subagent Sessions cannot background a command; it is killed after this long. */
const SUBAGENT_BASH_TIMEOUT_MS = 10 * 60_000;
export const SUBAGENT_BASH_TIMEOUT_MESSAGE = "Bash timed out after 10 minutes in a subagent and was killed.";
const KILL_GRACE_MS = 500;
const MAX_SUBSCRIPTION_PATTERN_LENGTH = 500;
const MIN_SUBSCRIPTION_DEBOUNCE_MS = 5_000;
const MAX_MONITOR_LINE_CHARS = 4_000;
/** An ordinary pattern answers a batch in well under a millisecond per line; this only has to be far above that. */
const SUBSCRIPTION_MATCH_TIMEOUT_MS = 5_000;
const MAX_UNCHECKED_LINES = 10_000;
const NOTIFICATION_TAIL_CHARS = 2_000;
/** Measured on macOS (nono, Seatbelt): a blocked write reports EPERM. A command's own EACCES ("Permission denied") is not one. */
const SANDBOX_DENIAL_SIGNATURES = ["operation not permitted", "eperm"] as const;
/** npm prints EPERM early and a misleading "sudo chown" advice last, so look further back than the last lines. */
const SANDBOX_DENIAL_TAIL_BYTES = 8 * 1024;
const SANDBOX_DENIAL_HINT =
  'The sandbox may have blocked this command: it ran in the sandbox and the output reports "operation not permitted". If it really needs to write outside the workspace or use the keychain, retry the same command once with sandbox_permissions: "require_escalated" and a one-sentence justification; the user will be asked to approve. If it should not need that, change the approach instead.';

export type NodeBashToolPorts = Pick<ToolPorts, "bash" | "python"> & {
  readonly hasRunningBackgroundTask: (sessionId: string) => boolean;
  /** Canonical `bash-v2/<process>/`: the sandbox `TMPDIR`, and the root of every Session's `scripts/<sessionId>/`. */
  readonly scratchRoot: string;
  readonly dispose: () => Promise<void>;
  readonly forceTerminate: () => void;
};

type BashOptions = {
  readonly workspaceRoot: string;
  /** Holds `bash-v2/<process>/`, the sandbox `TMPDIR`; removed when the Harness unloads. */
  readonly tmpRoot: string;
  /** Holds `sessions-v2/<sessionId>/bash-log/`, the command logs. */
  readonly dataRoot: string;
  readonly sandbox?: SandboxService;
  readonly background?: BackgroundTaskHost;
  /** Tests only: the per-Session `bash-log/` cap. */
  readonly sessionLogCapBytes?: number;
  /** Tests only: how long a subagent's command may run. */
  readonly subagentTimeoutMs?: number;
  /** Tests only: how long one batch of output lines may take to match before the subscription is dropped. */
  readonly subscriptionMatchTimeoutMs?: number;
  /** The Python the app ships, when it does; absent in development without `pnpm python-runtime:prepare`. */
  readonly python?: BashPythonRuntime;
  /** Whose `scripts/<sessionId>/` a Session's commands use; a forked subagent uses its parent's. Defaults to its own. */
  readonly scratchOwner?: (sessionId: string) => string;
};

/**
 * `background` is the Host task registry; it owns notifications, `task_*` queries and persisted status.
 * `sandbox` is the Harness sandbox service. Without it only commands admitted with `noSandbox` run.
 * Creating the ports also sweeps scratch directories a crashed process left behind.
 */
export function createNodeBashToolPorts(options: BashOptions): NodeBashToolPorts {
  const bashRoot = join(options.tmpRoot, "bash-v2");
  // Created now and canonicalized, so the writable-roots registration and the sandbox name the same directory.
  const ownScratch = join(bashRoot, randomUUID());
  const scratchRoot = canonicalScratchRoot(ownScratch);
  const registry = new BashTaskRegistry(
    scratchRoot,
    new SessionBashLogs(options.dataRoot, options.sessionLogCapBytes),
    options.background,
  );
  void sweepStaleScratchDirectories(bashRoot, ownScratch).catch((error: unknown) =>
    console.warn("[shell-tools] scratch sweep failed", error),
  );
  return Object.freeze({
    bash: (args, context) => executeBash(args, context, options, registry),
    hasRunningBackgroundTask: (sessionId) => registry.running(sessionId) > 0,
    scratchRoot,
    ...(options.python === undefined ? {} : { python: options.python }),
    dispose: () => registry.dispose(),
    forceTerminate: () => registry.forceTerminate(),
  });
}

async function executeBash(
  args: Readonly<Record<string, RuntimeJsonValue>>,
  context: ToolExecutionContext,
  options: BashOptions,
  registry: BashTaskRegistry,
): Promise<ToolBodyResult> {
  const command = stringArg(args, "command");
  if (!command) return failed("INVALID_ARGUMENTS", "command is required", false);
  const subscription = parseOutputSubscription(args.notifyOnOutput);
  if (typeof subscription === "string") return failed("INVALID_ARGUMENTS", subscription, false);
  const workspaceRoot = resolve(context.workspaceRoot || options.workspaceRoot);
  const cwd = resolve(workspaceRoot, stringArg(args, "cwd") || ".");
  if (!within(workspaceRoot, cwd))
    return failed("WORKSPACE_BOUNDARY_DENIED", "Bash cwd is outside the workspace.", false);
  const realCwd = await realpath(cwd).catch(() => undefined);
  if (realCwd === undefined || !within(await realpath(workspaceRoot), realCwd))
    return failed("WORKSPACE_BOUNDARY_DENIED", "Bash cwd is unavailable or escapes the workspace.", false);
  const duplicate = registry.find(context.sessionId, realCwd, command);
  if (duplicate !== undefined) return backgrounded(duplicate, "already_running");
  if (registry.running(context.sessionId) >= MAX_BACKGROUND_PER_SESSION)
    return failed("BASH_TASK_LIMIT", `Background task limit reached (${MAX_BACKGROUND_PER_SESSION}).`, false);

  const noSandbox = admittedNoSandbox(args, context);
  if (!noSandbox && !options.sandbox)
    return failed(
      "SANDBOX_PREPARE_FAILED",
      "Bash needs the sandbox, but the sandbox plugin is not loaded. The command did not run; retry with sandbox_permissions: require_escalated and a justification to run it outside the sandbox after approval.",
      false,
    );

  // The scratch directory is recreated per command: another process's sweep may have taken an idle one.
  const scratchRoot = registry.scratchRoot;
  const sessionScratch = sessionScratchDirectory(
    scratchRoot,
    options.scratchOwner?.(context.sessionId) ?? context.sessionId,
  );
  await mkdir(sessionScratch, { recursive: true, mode: 0o700 });
  const env = commandEnvironment(sessionScratch, options.python);
  const log = await registry.logs.create(context.sessionId);
  // A log that never becomes a background task goes once the result exists; the artifact keeps long output.
  let keepLog = false;
  try {
    await registry.pruneLogs(context.sessionId, log.path);
    if (context.signal.aborted) return failed("TOOL_ABORTED", "Bash was cancelled before process creation.", true);
    const argv = [process.platform === "darwin" ? "/bin/zsh" : "/bin/bash", "-lc", command];
    const run = !options.sandbox
      ? directRun({ command: argv[0], args: argv.slice(1), cwd: realCwd, env })
      : options.sandbox.run(
          noSandbox
            ? { purpose: "tool", isolation: "none", argv, cwd: realCwd, env, scratchDir: scratchRoot }
            : await sandboxedRequest(argv, realCwd, workspaceRoot, scratchRoot, env),
        );
    const sandboxed = !noSandbox;
    const monitor = new OutputMonitor(subscription, options.subscriptionMatchTimeoutMs);
    const processHandle = new ProcessHandle(run, log.path, monitor.handleChunk);
    registry.own(processHandle);
    // The monitor owns a thread once output arrives; whichever way this call ends, the thread ends with the process.
    void processHandle.wait.then(() => monitor.dispose());
    const abort = () => processHandle.kill();
    context.signal.addEventListener("abort", abort, { once: true });
    const blockMs = clampInteger(args.blockMs, DEFAULT_BLOCK_MS, 0, MAX_BLOCK_MS);
    // Subagent Sessions have no background registry or wake: the command runs to the end, at most 10 minutes.
    const foregroundOnly = context.backgroundAllowed === false;
    const boundary = backgroundBoundary(
      foregroundOnly ? (options.subagentTimeoutMs ?? SUBAGENT_BASH_TIMEOUT_MS) : blockMs,
    );
    try {
      const completedInTime = await Promise.race([processHandle.wait.then(() => true), boundary.promise]);
      if (completedInTime || processHandle.settled) {
        monitor.dispose();
        return await foreground(command, realCwd, await processHandle.wait, processHandle.outputPath, context);
      }
      if (foregroundOnly) {
        processHandle.kill();
        await processHandle.wait;
        monitor.dispose();
        return failed("BASH_TIMEOUT", SUBAGENT_BASH_TIMEOUT_MESSAGE, false);
      }
      const task = await registry.register({
        taskId: log.id,
        sessionId: context.sessionId,
        callId: context.callId,
        command,
        intent: stringArg(args, "intent") || undefined,
        cwd: realCwd,
        outputPath: log.path,
        process: processHandle,
        sandboxed,
        monitor,
        subscription,
        reportProgress: context.reportProgress,
      });
      keepLog = true;
      return backgrounded(task, blockMs === 0 ? "explicit" : "block_timeout");
    } finally {
      boundary.cancel();
      context.signal.removeEventListener("abort", abort);
    }
  } finally {
    if (!keepLog) await rm(log.path, { force: true });
  }
}

type ProcessStatus = {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  /** Stopped by cancellation, a limit, or the Harness unloading. */
  readonly stopped: boolean;
  /** The command never started; for sandboxed runs these are the sandbox's reasons. */
  readonly notStarted?: readonly string[];
  readonly isolation: SandboxResult["facts"]["isolation"];
  /** `<backend id>`, `inherited` or `none`, as reported in summaries. */
  readonly sandbox: string;
  readonly output: string;
  readonly totalChars: number;
  readonly truncated: boolean;
  readonly durationMs: number;
  readonly outputError?: string;
};
type BashRun = Pick<SandboxExecution, "onOutput" | "terminate" | "forceTerminate" | "result">;

/** Output file, inline head and disk cap over one run, sandboxed or not. */
class ProcessHandle {
  readonly wait: Promise<ProcessStatus>;
  #settled = false;
  get settled(): boolean {
    return this.#settled;
  }

  constructor(
    private readonly run: BashRun,
    readonly outputPath: string,
    onChunk?: (text: string) => void,
  ) {
    const startedAt = Date.now();
    this.wait = new Promise((resolveStatus) => {
      let head = "";
      let totalChars = 0;
      let truncated = false;
      let outputError: string | undefined;
      let writtenChars = 0;
      const output = createWriteStream(this.outputPath, { flags: "a", encoding: "utf8" });
      run.onOutput(({ text }) => {
        onChunk?.(text);
        totalChars += text.length;
        if (head.length < INLINE_OUTPUT_CHARS) head += text.slice(0, INLINE_OUTPUT_CHARS - head.length);
        const room = OUTPUT_DISK_CAP_CHARS - writtenChars;
        if (room > 0) {
          const slice = text.slice(0, room);
          output.write(slice);
          writtenChars += slice.length;
        }
        if (text.length > room) {
          truncated = true;
          this.kill();
        }
      });
      output.once("error", (error) => {
        outputError = error.message;
        this.kill();
      });
      void run.result
        .catch(
          (error: unknown): SandboxResult => ({
            outcome: { status: "prepare_failed", reasons: [error instanceof Error ? error.message : String(error)] },
            facts: { isolation: "none", cleanup: "ok" },
          }),
        )
        .then(({ outcome, facts }) => {
          this.#settled = true;
          const notStarted = outcome.status === "prepare_failed" ? outcome.reasons : undefined;
          // task_output and the completion notice read the file, so a run that never started explains itself there.
          if (notStarted && !output.destroyed) output.write(`[command did not start]\n${notStarted.join("\n")}\n`);
          const exit =
            outcome.status === "prepare_failed"
              ? { exitCode: null, signal: null }
              : { exitCode: outcome.exitCode, signal: outcome.signal };
          const sandbox = facts.isolation === "sandboxed" ? (facts.backend?.id ?? "unselected") : facts.isolation;
          const finish = () =>
            resolveStatus({
              ...exit,
              stopped: outcome.status === "cancelled" || outcome.status === "timed_out",
              isolation: facts.isolation,
              sandbox,
              output: head,
              totalChars,
              truncated,
              durationMs: Date.now() - startedAt,
              ...(notStarted === undefined ? {} : { notStarted }),
              ...(outputError === undefined ? {} : { outputError }),
            });
          if (output.destroyed) finish();
          else output.end(finish);
        });
    });
  }

  kill(): void {
    if (!this.#settled) this.run.terminate();
  }
  forceTerminate(): void {
    if (!this.#settled) this.run.forceTerminate();
  }
}

/** Approved runs outside the sandbox when the sandbox plugin is absent: same process-group lifecycle, no policy. */
function directRun(spec: HostProcessSpec): BashRun {
  const child = spawnHostProcess(spec);
  let stopped = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const result = child.exited.then((exit): SandboxResult => {
    if (killTimer !== undefined) clearTimeout(killTimer);
    const facts = { isolation: "none" as const, cleanup: "ok" as const };
    if (exit.startError !== undefined)
      return { outcome: { status: "prepare_failed", reasons: [`spawn failed: ${exit.startError}`] }, facts };
    if (!stopped) return { outcome: { status: "exited", exitCode: exit.exitCode, signal: exit.signal }, facts };
    const residual = child.groupAlive();
    if (residual) child.signalGroup("SIGKILL");
    return { outcome: { status: "cancelled", exitCode: exit.exitCode, signal: exit.signal, residual }, facts };
  });
  return Object.freeze({
    onOutput: (listener: Parameters<BashRun["onOutput"]>[0]) => child.onOutput(listener),
    terminate: () => {
      if (stopped) return;
      stopped = true;
      child.signalGroup("SIGTERM");
      killTimer = setTimeout(() => child.signalGroup("SIGKILL"), KILL_GRACE_MS);
      killTimer.unref?.();
    },
    forceTerminate: () => {
      stopped = true;
      if (killTimer !== undefined) clearTimeout(killTimer);
      child.signalGroup("SIGKILL");
    },
    result,
  });
}

/** Canonical paths, so the policy and TMPDIR name the same directory. The log is written by this process, not the command. The tool template adds the .git denies. */
async function sandboxedRequest(
  argv: readonly string[],
  cwd: string,
  workspaceRoot: string,
  scratchRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<SandboxRequest> {
  const scratch = await realpath(scratchRoot);
  return {
    purpose: "tool",
    isolation: "sandboxed",
    argv,
    cwd,
    env: { ...env, TMPDIR: scratch },
    scratchDir: scratch,
    filesystem: { readWrite: [await realpath(workspaceRoot), scratch, await realpath(tmpdir())] },
  };
}

/**
 * The tool child environment (credentials stripped) plus the Session's scratch directory for scripts, plus the
 * bundled Python when the app ships one.
 */
export function commandEnvironment(
  sessionScratch: string,
  python: BashPythonRuntime | undefined,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...toolChildEnv(base), ACTSPACE_SCRATCH: sessionScratch };
  if (python === undefined) return env;
  // Windows spells the variable `Path`; keep whichever key the parent has so the shell sees one PATH.
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  const current = env[pathKey];
  env[pathKey] = current ? `${python.shimDirectory}${delimiter}${current}` : python.shimDirectory;
  env.ACTSPACE_PYTHON = python.shim;
  const extension = python.extensionSitePackages?.();
  if (extension !== undefined) env.ACTSPACE_PYTHON_EXT = extension;
  return env;
}

/** The scratch directory exists from the start so its canonical path can be registered as Host-writable. */
function canonicalScratchRoot(path: string): string {
  try {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** The admitted process resource is what the user approved; direct callers without one only get an explicit request. */
function admittedNoSandbox(args: Readonly<Record<string, RuntimeJsonValue>>, context: ToolExecutionContext): boolean {
  const resource = context.admittedResources?.find((item) => item.kind === "process");
  return resource?.kind === "process" ? resource.noSandbox === true : args.sandbox_permissions === "require_escalated";
}

type BashTask = {
  readonly taskId: string;
  readonly sessionId: string;
  readonly command: string;
  readonly cwd: string;
  readonly outputPath: string;
  readonly process: ProcessHandle;
  readonly sandboxed: boolean;
  readonly startedAt: number;
  readonly monitor: OutputMonitor;
  readonly subscription?: OutputSubscription;
  readonly callId: string;
  readonly intent?: string;
  readonly reportProgress: ToolExecutionContext["reportProgress"];
  status: "running" | "completed" | "failed" | "killed";
  timedOut: boolean;
  exitCode?: number | null;
  notStarted?: readonly string[];
  endedAt?: number;
  timer: ReturnType<typeof setTimeout>;
  completion: Promise<BackgroundTaskTerminal>;
};

/** Owns the processes; the Host registry owns delivery. Unloading the Harness still kills them. */
class BashTaskRegistry {
  readonly #tasks = new Map<string, BashTask>();
  readonly #processes = new Set<ProcessHandle>();
  constructor(
    readonly scratchRoot: string,
    readonly logs: SessionBashLogs,
    private readonly background?: BackgroundTaskHost,
  ) {}

  /** Runs after a log is created (`keep` is that log) and after a background task ends; never fails the command. */
  async pruneLogs(sessionId: string, keep?: string): Promise<void> {
    const running = new Set([
      ...[...this.#processes].filter((process) => !process.settled).map((process) => process.outputPath),
      ...(keep === undefined ? [] : [keep]),
    ]);
    await this.logs
      .prune(sessionId, running, async (taskId) => {
        await this.background?.markPruned(sessionId, taskId);
      })
      .catch((error: unknown) => console.warn("[shell-tools] bash-log prune failed", error));
  }

  own(process: ProcessHandle): void {
    this.#processes.add(process);
    void process.wait.then(() => this.#processes.delete(process));
  }

  forceTerminate(): void {
    for (const process of this.#processes) process.forceTerminate();
  }

  /** `taskId` is the log id given at start, so the log name and the task id match. */
  async register(
    input: Omit<BashTask, "startedAt" | "status" | "timedOut" | "timer" | "completion">,
  ): Promise<BashTask> {
    const task = { ...input, startedAt: Date.now(), status: "running" as const, timedOut: false } as BashTask;
    task.timer = setTimeout(() => {
      if (task.status === "running") {
        task.status = "killed";
        task.timedOut = true;
        task.process.kill();
      }
    }, MAX_RUNTIME_MS);
    task.timer.unref?.();
    this.#tasks.set(task.taskId, task);
    const reason = task.subscription?.reason ?? "requested output";
    task.monitor.attach({
      matched: (line) => {
        task.reportProgress({ message: `Background Bash output matched: ${reason}` });
        void this.background
          ?.notifyOutputMatch(
            task.taskId,
            `Background command output matched the subscription (${reason}).`,
            redactToolText(line),
          )
          .catch(() => undefined);
      },
      stopped: () => {
        task.reportProgress({ message: `Background Bash output subscription stopped: ${reason}` });
        void this.background
          ?.notifySubscriptionStopped(
            task.taskId,
            `Stopped watching this command's output for the subscription (${reason}): its pattern could not be matched in time. The command is still running and no more output matches will be reported. Read its output with task_output.`,
          )
          .catch(() => undefined);
      },
    });
    task.completion = task.process.wait.then(async (status) => {
      clearTimeout(task.timer);
      task.endedAt = Date.now();
      task.exitCode = status.exitCode;
      if (task.status === "running")
        task.status =
          status.stopped || status.signal !== null ? "killed" : status.exitCode === 0 ? "completed" : "failed";
      task.notStarted = status.notStarted;
      task.monitor.dispose();
      task.reportProgress({ message: `Background Bash task ${task.taskId} ${task.status}.` });
      const result = terminal(
        task,
        await readFile(task.outputPath, "utf8")
          .then((value) => value.slice(-NOTIFICATION_TAIL_CHARS))
          .catch(() => ""),
        await sandboxDenialHint(status, task.outputPath),
      );
      // The handle is settled by now, so this task's own log counts as finished.
      await this.pruneLogs(task.sessionId);
      return result;
    });
    await this.background?.register({
      taskId: task.taskId,
      kind: "bash",
      sessionId: task.sessionId,
      callId: task.callId,
      description: task.intent ?? task.command,
      bash: { command: task.command, cwd: task.cwd, sandboxed: task.sandboxed, outputPath: task.outputPath },
      done: task.completion,
      output: async (options) => ({ outputPath: task.outputPath, ...(await readLog(task.outputPath, options?.since)) }),
      stop: async () => {
        this.#kill(task);
        await task.completion;
      },
    });
    return task;
  }

  find(sessionId: string, cwd: string, command: string): BashTask | undefined {
    return [...this.#tasks.values()].find(
      (task) =>
        task.sessionId === sessionId && task.cwd === cwd && task.command === command && task.status === "running",
    );
  }
  running(sessionId: string): number {
    return [...this.#tasks.values()].filter((task) => task.sessionId === sessionId && task.status === "running").length;
  }

  async dispose(): Promise<void> {
    const owned = [...this.#processes];
    for (const process of owned) process.kill();
    for (const task of this.#tasks.values()) this.#kill(task);
    await Promise.allSettled([...this.#tasks.values()].map((task) => task.completion));
    await Promise.all(owned.map((process) => process.wait));
    for (const task of this.#tasks.values()) {
      clearTimeout(task.timer);
      task.monitor.dispose();
    }
    // Logs stay with their Sessions; only the sandbox scratch directory goes.
    await rm(this.scratchRoot, { force: true, recursive: true });
    this.#tasks.clear();
  }

  #kill(task: BashTask): void {
    if (task.status === "running") {
      task.status = "killed";
      task.process.kill();
    }
  }
}

function terminal(task: BashTask, tail: string, hint?: string): BackgroundTaskTerminal {
  const exit = task.exitCode === undefined || task.exitCode === null ? "" : ` with exit code ${task.exitCode}`;
  const body = redactToolText(tail);
  if (task.notStarted)
    return {
      status: "failed",
      summary: `Background command did not start: ${task.notStarted.join(" ")}`,
      body,
      exitCode: null,
    };
  if (task.timedOut)
    return {
      status: "failed",
      summary: `Background command timed out after ${MAX_RUNTIME_MS / 60_000} minutes and was killed.`,
      body,
      exitCode: task.exitCode ?? null,
    };
  if (task.status === "killed")
    return { status: "stopped", summary: "Background command was stopped.", body, exitCode: task.exitCode ?? null };
  return {
    status: task.status === "completed" ? "completed" : "failed",
    summary: `Background command ${task.status}${exit}.${hint === undefined ? "" : ` ${hint}`}`,
    body,
    exitCode: task.exitCode ?? null,
  };
}

/** A guess, as in Codex and DSH: a failed sandboxed run whose output names EPERM. Usage errors (2) and missing or non-executable commands (126, 127) are the command's own. */
export function sandboxDenial(status: Pick<ProcessStatus, "isolation" | "exitCode">, output: string): boolean {
  if (status.isolation !== "sandboxed" || status.exitCode === null || [0, 2, 126, 127].includes(status.exitCode))
    return false;
  const text = output.toLowerCase();
  return SANDBOX_DENIAL_SIGNATURES.some((signature) => text.includes(signature));
}

/** Reads the output file only for a failed sandboxed run. */
async function sandboxDenialHint(status: ProcessStatus, outputPath: string): Promise<string | undefined> {
  if (status.isolation !== "sandboxed" || !status.exitCode) return undefined;
  return sandboxDenial(status, await readEnd(outputPath, SANDBOX_DENIAL_TAIL_BYTES)) ? SANDBOX_DENIAL_HINT : undefined;
}

async function readEnd(path: string, bytes: number): Promise<string> {
  const file = await open(path, "r").catch(() => undefined);
  if (file === undefined) return "";
  try {
    const { size } = await file.stat();
    const buffer = Buffer.alloc(Math.min(size, bytes));
    await file.read(buffer, 0, buffer.length, size - buffer.length);
    return buffer.toString("utf8");
  } catch {
    return "";
  } finally {
    await file.close();
  }
}

/**
 * `task_output`: without `since` the last 32KB, with it up to 32KB from that byte offset. Both ends are moved to UTF-8
 * character boundaries (the start forward, the end back), and `nextOffset` is where the next read starts.
 */
export async function readLog(
  path: string,
  since?: number,
): Promise<{ readonly text: string; readonly logSize: number; readonly nextOffset: number }> {
  const bytes = await readFile(path).catch(() => Buffer.alloc(0));
  const logSize = bytes.length;
  if (since === undefined) {
    if (logSize <= OUTPUT_PREVIEW_BYTES)
      return { text: redactToolText(bytes.toString("utf8")), logSize, nextOffset: logSize };
    return {
      text: `[Earlier output omitted; read the output file for the full log]\n${redactToolText(
        bytes
          .subarray(-OUTPUT_PREVIEW_BYTES)
          .toString("utf8")
          .replace(/^[^\n]*\n/, ""),
      )}`,
      logSize,
      nextOffset: logSize,
    };
  }
  let start = Math.min(since, logSize);
  while (start < logSize && isContinuationByte(bytes[start])) start += 1;
  let end = Math.min(start + OUTPUT_PREVIEW_BYTES, logSize);
  if (end < logSize) while (end > start && isContinuationByte(bytes[end])) end -= 1;
  return { text: redactToolText(bytes.subarray(start, end).toString("utf8")), logSize, nextOffset: end };
}

function isContinuationByte(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

async function foreground(
  command: string,
  cwd: string,
  status: ProcessStatus,
  outputPath: string,
  context: ToolExecutionContext,
): Promise<ToolBodyResult> {
  if (status.notStarted !== undefined) {
    return status.isolation === "none"
      ? failed("BASH_START_FAILED", `Failed to start Bash command: ${status.notStarted.join(" ")}`, true)
      : failed(
          "SANDBOX_PREPARE_FAILED",
          `The sandbox could not run this command, so it did not run (sandbox=${status.sandbox}):\n- ${status.notStarted.join("\n- ")}`,
          false,
        );
  }
  if (status.outputError !== undefined)
    return failed("BASH_OUTPUT_FAILED", `Failed to persist Bash output: ${status.outputError}`, true);
  const summary = `Bash ${status.exitCode === 0 ? "completed" : "failed"} in ${status.durationMs}ms (exit ${status.exitCode ?? "signal"}, sandboxed=${status.isolation === "sandboxed"}, sandbox=${status.sandbox}).`;
  const detail = [environmentDetail(status.isolation === "sandboxed")];
  const image =
    status.exitCode === 0 && status.totalChars <= INLINE_OUTPUT_CHARS ? dataImage(status.output) : undefined;
  if (image !== undefined) {
    const artifact = await context.createArtifact({
      bytes: Buffer.from(image.data, "base64"),
      mediaType: image.mediaType,
    });
    return {
      status: "completed",
      summary,
      modelOutput: [
        { type: "text", text: summary },
        { type: "artifact", artifact, label: "Bash image" },
      ],
      artifacts: [artifact],
      detail,
      renderer: { id: "actspace.image-gallery", schemaVersion: 1, props: { artifactIds: [artifact.artifactId] } },
    };
  }
  const text = `${summary}\ncommand: ${command}\ncwd: ${cwd}\n\n${status.output || "(no output)"}${status.totalChars > status.output.length ? `\n[Output truncated; totalChars=${status.totalChars}]` : ""}`;
  let artifact;
  if (status.totalChars > INLINE_OUTPUT_CHARS || status.truncated) {
    try {
      artifact = await context.createArtifact({ bytes: await readFile(outputPath), mediaType: "text/plain" });
    } catch (error) {
      return failed(
        "BASH_ARTIFACT_FAILED",
        `${text}\n\nFull output could not be preserved: ${error instanceof Error ? error.message : String(error)}`,
        false,
      );
    }
  }
  // The hint is for the model; the summary, exit code and sandbox marker the user sees stay the same.
  const hint = await sandboxDenialHint(status, outputPath);
  const modelText = hint === undefined ? text : `${text}\n\n${hint}`;
  const modelOutput =
    artifact === undefined
      ? [{ type: "text" as const, text: modelText }]
      : [
          { type: "text" as const, text: modelText },
          { type: "artifact" as const, artifact, label: "Full Bash output" },
        ];
  return status.exitCode === 0
    ? {
        status: "completed",
        summary,
        modelOutput,
        ...(artifact === undefined ? {} : { artifacts: [artifact] }),
        detail,
      }
    : {
        status: "failed",
        summary: text,
        modelOutput,
        ...(artifact === undefined ? {} : { artifacts: [artifact] }),
        detail,
        failure: { code: "BASH_EXIT_NONZERO", message: text, retryable: false },
      };
}

function backgrounded(task: BashTask, reason: "explicit" | "block_timeout" | "already_running"): ToolBodyResult {
  const summary = `Bash task ${task.taskId} is running in the background (${reason}).`;
  const next =
    "You will be notified automatically when it finishes; continue with other work. Use task_output to inspect output or task_stop to stop it. Do not poll with sleep loops or repeated task_output.";
  return {
    ...completed(`${summary}\noutput_path: ${task.outputPath}\n${next}`, summary),
    detail: [
      { label: "background-task", value: { taskId: task.taskId, status: "running" } },
      environmentDetail(task.sandboxed),
      traceDetail(task),
    ],
  };
}

/** Registers the log as an active context path (`actspace.context.trace`, read by context-disclosure). */
function traceDetail(task: BashTask) {
  return {
    label: CONTEXT_TRACE_DETAIL_LABEL,
    value: {
      kind: "trace" as const,
      path: task.outputPath,
      description: `Background Bash log: ${(task.intent ?? task.command).slice(0, 80)}`,
    },
  };
}

/** Where the command ran, as a fact the UI reads; the `sandboxed=` in the summary is prose for the model. */
function environmentDetail(sandboxed: boolean) {
  return { label: "environment", value: { sandboxed } };
}

type OutputSubscription = { readonly pattern: string; readonly reason: string; readonly debounceMs: number };

type OutputListener = { readonly matched: (line: string) => void; readonly stopped: () => void };

class OutputMonitor {
  readonly #matcher: LineMatcher | undefined;
  readonly #pending: string[] = [];
  #listener: OutputListener | undefined;
  #lineBuffer = "";
  #lastNotifiedAt = 0;
  #disposed = false;
  #stopped = false;
  constructor(
    private readonly subscription?: OutputSubscription,
    matchTimeoutMs = SUBSCRIPTION_MATCH_TIMEOUT_MS,
  ) {
    if (subscription !== undefined)
      this.#matcher = new LineMatcher(
        subscription.pattern,
        matchTimeoutMs,
        (line) => this.#matched(line),
        () => {
          this.#stopped = true;
          this.#listener?.stopped();
        },
      );
  }
  handleChunk = (text: string): void => {
    if (this.#disposed || this.#stopped || this.#matcher === undefined) return;
    this.#lineBuffer += text;
    const lines = this.#lineBuffer.split("\n");
    this.#lineBuffer = lines.pop() ?? "";
    for (const line of lines) this.#matcher.push(line.slice(0, MAX_MONITOR_LINE_CHARS));
    if (this.#lineBuffer.length > MAX_MONITOR_LINE_CHARS) {
      this.#matcher.push(this.#lineBuffer.slice(0, MAX_MONITOR_LINE_CHARS));
      this.#lineBuffer = "";
    }
  };
  /** Matches found, or a stop that happened, before the command went to the background are delivered now. */
  attach(listener: OutputListener): void {
    if (this.#disposed) return;
    this.#listener = listener;
    for (const line of this.#pending.splice(0)) this.#emit(line);
    if (this.#stopped) listener.stopped();
  }
  /** Lines still waiting to be matched are dropped; the command's end is reported with its output tail anyway. */
  dispose(): void {
    this.#disposed = true;
    this.#listener = undefined;
    this.#pending.splice(0);
    this.#matcher?.close();
  }
  #matched(line: string): void {
    if (this.#listener === undefined) {
      if (this.#pending.length < 8) this.#pending.push(line);
    } else this.#emit(line);
  }
  #emit(line: string): void {
    const now = Date.now();
    if (now - this.#lastNotifiedAt < (this.subscription?.debounceMs ?? MIN_SUBSCRIPTION_DEBOUNCE_MS)) return;
    this.#lastNotifiedAt = now;
    this.#listener?.matched(line);
  }
}

/** The worker's whole program: test each line of a batch, answer with the indexes of the lines that matched. */
const LINE_MATCHER_WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const pattern = new RegExp(workerData);
parentPort.on("message", (lines) => {
  const matched = [];
  for (let index = 0; index < lines.length; index += 1) if (pattern.test(lines[index])) matched.push(index);
  parentPort.postMessage(matched);
});`;

/**
 * Tests output lines against the model's pattern on another thread.
 *
 * The pattern is the model's and a line can be 4,000 characters, so one test can take seconds or never end:
 * `(a+)+$` needs about three seconds for 28 characters and twice that for each character more. Run on this
 * thread, that stops every Session the process serves. Here a batch that is not answered within `timeoutMs`
 * ends the worker and, through `onStop`, the subscription. So does a worker that cannot start or dies.
 */
class LineMatcher {
  #worker: Worker | undefined;
  #online = false;
  #closed = false;
  #waiting: string[] = [];
  #sent: readonly string[] | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly pattern: string,
    private readonly timeoutMs: number,
    private readonly onMatch: (line: string) => void,
    private readonly onStop: () => void,
  ) {}

  push(line: string): void {
    if (this.#closed) return;
    // Output arriving faster than it is matched: the oldest unchecked lines go, the newest are the ones worth checking.
    if (this.#waiting.length >= MAX_UNCHECKED_LINES) this.#waiting = [];
    this.#waiting.push(line);
    try {
      this.#worker ??= this.#start();
    } catch {
      this.#fail();
      return;
    }
    this.#send();
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    clearTimeout(this.#timer);
    this.#waiting = [];
    this.#sent = undefined;
    void this.#worker?.terminate();
  }

  #start(): Worker {
    const worker = new Worker(LINE_MATCHER_WORKER, { eval: true, workerData: this.pattern });
    worker.unref();
    worker.once("online", () => {
      this.#online = true;
      this.#send();
    });
    worker.on("message", (matched: readonly number[]) => {
      const sent = this.#sent;
      if (sent === undefined) return;
      clearTimeout(this.#timer);
      this.#sent = undefined;
      for (const index of matched) {
        const line = sent[index];
        if (line !== undefined && !this.#closed) this.onMatch(line);
      }
      this.#send();
    });
    // A worker that failed or exited on its own cannot answer either.
    worker.once("error", () => this.#fail());
    worker.once("exit", () => this.#fail());
    return worker;
  }

  /** One batch at a time, so the timer measures the pattern and not a queue. */
  #send(): void {
    if (this.#closed || !this.#online || this.#sent !== undefined || this.#waiting.length === 0) return;
    this.#sent = this.#waiting;
    this.#waiting = [];
    this.#timer = setTimeout(() => this.#fail(), this.timeoutMs);
    this.#timer.unref?.();
    this.#worker?.postMessage(this.#sent);
  }

  #fail(): void {
    if (this.#closed) return;
    this.close();
    this.onStop();
  }
}

function parseOutputSubscription(value: RuntimeJsonValue | undefined): OutputSubscription | string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return "notifyOnOutput must be an object.";
  const record = value as Readonly<Record<string, RuntimeJsonValue>>;
  const pattern = typeof record.pattern === "string" ? record.pattern : "";
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  if (!pattern || pattern.length > MAX_SUBSCRIPTION_PATTERN_LENGTH)
    return `notifyOnOutput.pattern must contain 1-${MAX_SUBSCRIPTION_PATTERN_LENGTH} characters.`;
  try {
    new RegExp(pattern);
  } catch {
    return "notifyOnOutput.pattern must be a valid regular expression.";
  }
  if (!reason) return "notifyOnOutput.reason is required.";
  const debounceMs =
    typeof record.debounceMs === "number" && Number.isFinite(record.debounceMs)
      ? Math.max(MIN_SUBSCRIPTION_DEBOUNCE_MS, Math.trunc(record.debounceMs))
      : MIN_SUBSCRIPTION_DEBOUNCE_MS;
  return Object.freeze({ pattern, reason: reason.slice(0, 80), debounceMs });
}

function backgroundBoundary(blockMs: number): { readonly promise: Promise<false>; readonly cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let immediate: ReturnType<typeof setImmediate> | undefined;
  const promise = new Promise<false>((resolveBoundary) => {
    if (blockMs === 0) immediate = setImmediate(() => resolveBoundary(false));
    else {
      timer = setTimeout(() => resolveBoundary(false), blockMs);
      timer.unref?.();
    }
  });
  return {
    promise,
    cancel: () => {
      if (timer !== undefined) clearTimeout(timer);
      if (immediate !== undefined) clearImmediate(immediate);
    },
  };
}

function within(root: string, candidate: string): boolean {
  return isLexicallyInside(nodePath, root, candidate, { includeRoot: true });
}
function stringArg(args: Readonly<Record<string, RuntimeJsonValue>>, name: string): string {
  return typeof args[name] === "string" ? args[name] : "";
}
function clampInteger(value: RuntimeJsonValue | undefined, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.trunc(value)))
    : fallback;
}
function dataImage(output: string): { readonly mediaType: string; readonly data: string } | undefined {
  const match = output.trim().match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i);
  return match?.[1] && match[2] ? { mediaType: match[1].toLowerCase(), data: match[2].replace(/\s/g, "") } : undefined;
}
function completed(text: string, summary: string): ToolBodyResult {
  return { status: "completed", summary, modelOutput: [{ type: "text", text }] };
}
function failed(code: string, message: string, retryable: boolean): ToolBodyResult {
  return {
    status: "failed",
    summary: message,
    modelOutput: [{ type: "text", text: message }],
    failure: { code, message, retryable },
  };
}
