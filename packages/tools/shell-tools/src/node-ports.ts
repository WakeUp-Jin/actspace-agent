import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { spawnHostProcess } from "@actspace/sandbox/node-ports";
import type { HostProcessSpec, SandboxExecution, SandboxRequest, SandboxResult, SandboxService } from "@actspace/sandbox/types";
import type { BackgroundTaskHost, BackgroundTaskTerminal } from "@actspace/background-tasks";
import type { ToolBodyResult, ToolExecutionContext } from "@actspace/tools-runtime";
import { redactToolText } from "@actspace/tools-runtime";
import type { ToolPorts } from "./plugin.js";

const INLINE_OUTPUT_CHARS = 8_000;
const OUTPUT_DISK_CAP_CHARS = 5 * 1024 * 1024;
const OUTPUT_PREVIEW_BYTES = 32 * 1024;
const DEFAULT_BLOCK_MS = 30_000;
const MAX_BLOCK_MS = 600_000;
const MAX_RUNTIME_MS = 30 * 60_000;
const MAX_BACKGROUND_PER_SESSION = 8;
const KILL_GRACE_MS = 500;
const MAX_SUBSCRIPTION_PATTERN_LENGTH = 500;
const MIN_SUBSCRIPTION_DEBOUNCE_MS = 5_000;
const MAX_MONITOR_LINE_CHARS = 4_000;
const NOTIFICATION_TAIL_CHARS = 2_000;
/** Measured on macOS (nono, Seatbelt): a blocked write reports EPERM. A command's own EACCES ("Permission denied") is not one. */
const SANDBOX_DENIAL_SIGNATURES = ["operation not permitted", "eperm"] as const;
/** npm prints EPERM early and a misleading "sudo chown" advice last, so look further back than the last lines. */
const SANDBOX_DENIAL_TAIL_BYTES = 8 * 1024;
const SANDBOX_DENIAL_HINT = "The sandbox may have blocked this command: it ran in the sandbox and the output reports \"operation not permitted\". If it really needs to write outside the workspace or use the keychain, retry the same command once with sandbox_permissions: \"require_escalated\" and a one-sentence justification; the user will be asked to approve. If it should not need that, change the approach instead.";

export type NodeBashToolPorts = Pick<ToolPorts, "bash"> & {
  readonly hasRunningBackgroundTask: (sessionId: string) => boolean;
  readonly dispose: () => Promise<void>;
  readonly forceTerminate: () => void;
};

type BashOptions = { readonly workspaceRoot: string; readonly tmpRoot: string; readonly sandbox?: SandboxService; readonly background?: BackgroundTaskHost };

/**
 * `background` is the Host task registry; it owns notifications, `task_*` queries and persisted status.
 * `sandbox` is the Harness sandbox service. Without it only commands admitted with `noSandbox` run.
 */
export function createNodeBashToolPorts(options: BashOptions): NodeBashToolPorts {
  const registry = new BashTaskRegistry(join(options.tmpRoot, "bash-v2", randomUUID()), options.background);
  return Object.freeze({
    bash: (args, context) => executeBash(args, context, options, registry),
    hasRunningBackgroundTask: (sessionId) => registry.running(sessionId) > 0,
    dispose: () => registry.dispose(),
    forceTerminate: () => registry.forceTerminate(),
  });
}

async function executeBash(
  args: Readonly<Record<string, RuntimeV2JsonValue>>,
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
  if (!within(workspaceRoot, cwd)) return failed("WORKSPACE_BOUNDARY_DENIED", "Bash cwd is outside the workspace.", false);
  const realCwd = await realpath(cwd).catch(() => undefined);
  if (realCwd === undefined || !within(await realpath(workspaceRoot), realCwd)) return failed("WORKSPACE_BOUNDARY_DENIED", "Bash cwd is unavailable or escapes the workspace.", false);
  const duplicate = registry.find(context.sessionId, realCwd, command);
  if (duplicate !== undefined) return backgrounded(duplicate, "already_running");
  if (registry.running(context.sessionId) >= MAX_BACKGROUND_PER_SESSION) return failed("BASH_TASK_LIMIT", `Background task limit reached (${MAX_BACKGROUND_PER_SESSION}).`, false);

  const noSandbox = admittedNoSandbox(args, context);
  if (!noSandbox && !options.sandbox) return failed("SANDBOX_PREPARE_FAILED", "Bash needs the sandbox, but the sandbox plugin is not loaded. The command did not run; retry with sandbox_permissions: require_escalated and a justification to run it outside the sandbox after approval.", false);

  const outputRoot = registry.outputRoot;
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  const outputPath = join(outputRoot, `${randomUUID()}.log`);
  await writeFile(outputPath, "", { encoding: "utf8", mode: 0o600 });
  if (context.signal.aborted) return failed("TOOL_ABORTED", "Bash was cancelled before process creation.", true);
  const argv = [process.platform === "darwin" ? "/bin/zsh" : "/bin/bash", "-lc", command];
  const run = !options.sandbox
    ? directRun({ command: argv[0]!, args: argv.slice(1), cwd: realCwd, env: process.env })
    : options.sandbox.run(noSandbox
      ? { purpose: "tool", isolation: "none", argv, cwd: realCwd, env: process.env, scratchDir: outputRoot }
      : await sandboxedRequest(argv, realCwd, workspaceRoot, outputRoot));
  const sandboxed = !noSandbox;
  const monitor = new OutputMonitor(subscription);
  const processHandle = new ProcessHandle(run, outputPath, monitor.handleChunk);
  registry.own(processHandle);
  const abort = () => processHandle.kill();
  context.signal.addEventListener("abort", abort, { once: true });
  const blockMs = clampInteger(args.blockMs, DEFAULT_BLOCK_MS, 0, MAX_BLOCK_MS);
  const boundary = backgroundBoundary(blockMs);
  try {
    const completedInTime = await Promise.race([
      processHandle.wait.then(() => true),
      boundary.promise,
    ]);
    if (completedInTime || processHandle.settled) { monitor.dispose(); return foreground(command, realCwd, await processHandle.wait, processHandle.outputPath, context); }
    const task = await registry.register({ sessionId: context.sessionId, callId: context.callId, command, intent: stringArg(args, "intent") || undefined, cwd: realCwd, outputPath, process: processHandle, sandboxed, monitor, subscription, reportProgress: context.reportProgress });
    return backgrounded(task, blockMs === 0 ? "explicit" : "block_timeout");
  } finally {
    boundary.cancel();
    context.signal.removeEventListener("abort", abort);
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
  get settled(): boolean { return this.#settled; }

  constructor(private readonly run: BashRun, readonly outputPath: string, onChunk?: (text: string) => void) {
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
        if (text.length > room) { truncated = true; this.kill(); }
      });
      output.once("error", (error) => { outputError = error.message; this.kill(); });
      void run.result.catch((error: unknown): SandboxResult => ({ outcome: { status: "prepare_failed", reasons: [error instanceof Error ? error.message : String(error)] }, facts: { isolation: "none", cleanup: "ok" } })).then(({ outcome, facts }) => {
        this.#settled = true;
        const notStarted = outcome.status === "prepare_failed" ? outcome.reasons : undefined;
        // task_output and the completion notice read the file, so a run that never started explains itself there.
        if (notStarted && !output.destroyed) output.write(`[command did not start]\n${notStarted.join("\n")}\n`);
        const exit = outcome.status === "prepare_failed" ? { exitCode: null, signal: null } : { exitCode: outcome.exitCode, signal: outcome.signal };
        const sandbox = facts.isolation === "sandboxed" ? facts.backend?.id ?? "unselected" : facts.isolation;
        const finish = () => resolveStatus({ ...exit, stopped: outcome.status === "cancelled" || outcome.status === "timed_out", isolation: facts.isolation, sandbox, output: head, totalChars, truncated, durationMs: Date.now() - startedAt, ...(notStarted === undefined ? {} : { notStarted }), ...(outputError === undefined ? {} : { outputError }) });
        if (output.destroyed) finish();
        else output.end(finish);
      });
    });
  }

  kill(): void { if (!this.#settled) this.run.terminate(); }
  forceTerminate(): void { if (!this.#settled) this.run.forceTerminate(); }
}

/** Approved runs outside the sandbox when the sandbox plugin is absent: same process-group lifecycle, no policy. */
function directRun(spec: HostProcessSpec): BashRun {
  const child = spawnHostProcess(spec);
  let stopped = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const result = child.exited.then((exit): SandboxResult => {
    if (killTimer !== undefined) clearTimeout(killTimer);
    const facts = { isolation: "none" as const, cleanup: "ok" as const };
    if (exit.startError !== undefined) return { outcome: { status: "prepare_failed", reasons: [`spawn failed: ${exit.startError}`] }, facts };
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
    forceTerminate: () => { stopped = true; if (killTimer !== undefined) clearTimeout(killTimer); child.signalGroup("SIGKILL"); },
    result,
  });
}

/** Canonical paths, so the policy, TMPDIR and the output file all name the same directory. The tool template adds the .git denies. */
async function sandboxedRequest(argv: readonly string[], cwd: string, workspaceRoot: string, outputRoot: string): Promise<SandboxRequest> {
  const scratch = await realpath(outputRoot);
  return { purpose: "tool", isolation: "sandboxed", argv, cwd, env: { ...process.env, TMPDIR: scratch }, scratchDir: scratch, filesystem: { readWrite: [await realpath(workspaceRoot), scratch, await realpath(tmpdir())] } };
}

/** The admitted process resource is what the user approved; direct callers without one only get an explicit request. */
function admittedNoSandbox(args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext): boolean {
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
  constructor(readonly outputRoot: string, private readonly background?: BackgroundTaskHost) {}

  own(process: ProcessHandle): void {
    this.#processes.add(process);
    void process.wait.then(() => this.#processes.delete(process));
  }

  forceTerminate(): void { for (const process of this.#processes) process.forceTerminate(); }

  async register(input: Omit<BashTask, "taskId" | "startedAt" | "status" | "timedOut" | "timer" | "completion">): Promise<BashTask> {
    const task = { ...input, taskId: `bash_${randomUUID()}`, startedAt: Date.now(), status: "running" as const, timedOut: false } as BashTask;
    task.timer = setTimeout(() => { if (task.status === "running") { task.status = "killed"; task.timedOut = true; task.process.kill(); } }, MAX_RUNTIME_MS);
    task.timer.unref?.();
    this.#tasks.set(task.taskId, task);
    task.monitor.attach((line) => {
      const reason = task.subscription?.reason ?? "requested output";
      task.reportProgress({ message: `Background Bash output matched: ${reason}` });
      void this.background?.notifyOutputMatch(task.taskId, `Background command output matched the subscription (${reason}).`, redactToolText(line)).catch(() => undefined);
    });
    task.completion = task.process.wait.then(async (status) => {
      clearTimeout(task.timer);
      task.endedAt = Date.now();
      task.exitCode = status.exitCode;
      if (task.status === "running") task.status = status.stopped || status.signal !== null ? "killed" : status.exitCode === 0 ? "completed" : "failed";
      task.notStarted = status.notStarted;
      task.monitor.dispose();
      task.reportProgress({ message: `Background Bash task ${task.taskId} ${task.status}.` });
      return terminal(task, await readFile(task.outputPath, "utf8").then((value) => value.slice(-NOTIFICATION_TAIL_CHARS)).catch(() => ""), await sandboxDenialHint(status, task.outputPath));
    });
    await this.background?.register({
      taskId: task.taskId, kind: "bash", sessionId: task.sessionId, callId: task.callId, description: task.intent ?? task.command, bash: { command: task.command, cwd: task.cwd, sandboxed: task.sandboxed }, done: task.completion,
      output: async () => ({ text: await readTail(task.outputPath), outputPath: task.outputPath }),
      stop: async () => { this.#kill(task); await task.completion; },
    });
    return task;
  }

  find(sessionId: string, cwd: string, command: string): BashTask | undefined { return [...this.#tasks.values()].find((task) => task.sessionId === sessionId && task.cwd === cwd && task.command === command && task.status === "running"); }
  running(sessionId: string): number { return [...this.#tasks.values()].filter((task) => task.sessionId === sessionId && task.status === "running").length; }

  async dispose(): Promise<void> {
    const owned = [...this.#processes];
    for (const process of owned) process.kill();
    for (const task of this.#tasks.values()) this.#kill(task);
    await Promise.allSettled([...this.#tasks.values()].map((task) => task.completion));
    await Promise.all(owned.map((process) => process.wait));
    for (const task of this.#tasks.values()) { clearTimeout(task.timer); task.monitor.dispose(); }
    await rm(this.outputRoot, { force: true, recursive: true });
    this.#tasks.clear();
  }

  #kill(task: BashTask): void { if (task.status === "running") { task.status = "killed"; task.process.kill(); } }
}

function terminal(task: BashTask, tail: string, hint?: string): BackgroundTaskTerminal {
  const exit = task.exitCode === undefined || task.exitCode === null ? "" : ` with exit code ${task.exitCode}`;
  const body = redactToolText(tail);
  if (task.notStarted) return { status: "failed", summary: `Background command did not start: ${task.notStarted.join(" ")}`, body, exitCode: null };
  if (task.timedOut) return { status: "failed", summary: `Background command timed out after ${MAX_RUNTIME_MS / 60_000} minutes and was killed.`, body, exitCode: task.exitCode ?? null };
  if (task.status === "killed") return { status: "stopped", summary: "Background command was stopped.", body, exitCode: task.exitCode ?? null };
  return { status: task.status === "completed" ? "completed" : "failed", summary: `Background command ${task.status}${exit}.${hint === undefined ? "" : ` ${hint}`}`, body, exitCode: task.exitCode ?? null };
}

/** A guess, as in Codex and DSH: a failed sandboxed run whose output names EPERM. Usage errors (2) and missing or non-executable commands (126, 127) are the command's own. */
export function sandboxDenial(status: Pick<ProcessStatus, "isolation" | "exitCode">, output: string): boolean {
  if (status.isolation !== "sandboxed" || status.exitCode === null || [0, 2, 126, 127].includes(status.exitCode)) return false;
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
  } catch { return ""; } finally { await file.close(); }
}

async function readTail(path: string): Promise<string> {
  const bytes = await readFile(path).catch(() => Buffer.alloc(0));
  if (bytes.length <= OUTPUT_PREVIEW_BYTES) return redactToolText(bytes.toString("utf8"));
  return `[Earlier output omitted; read the output file for the full log]\n${redactToolText(bytes.subarray(-OUTPUT_PREVIEW_BYTES).toString("utf8").replace(/^[^\n]*\n/, ""))}`;
}

async function foreground(command: string, cwd: string, status: ProcessStatus, outputPath: string, context: ToolExecutionContext): Promise<ToolBodyResult> {
  if (status.notStarted !== undefined) {
    return status.isolation === "none"
      ? failed("BASH_START_FAILED", `Failed to start Bash command: ${status.notStarted.join(" ")}`, true)
      : failed("SANDBOX_PREPARE_FAILED", `The sandbox could not run this command, so it did not run (sandbox=${status.sandbox}):\n- ${status.notStarted.join("\n- ")}`, false);
  }
  if (status.outputError !== undefined) return failed("BASH_OUTPUT_FAILED", `Failed to persist Bash output: ${status.outputError}`, true);
  const summary = `Bash ${status.exitCode === 0 ? "completed" : "failed"} in ${status.durationMs}ms (exit ${status.exitCode ?? "signal"}, sandboxed=${status.isolation === "sandboxed"}, sandbox=${status.sandbox}).`;
  const detail = [environmentDetail(status.isolation === "sandboxed")];
  const image = status.exitCode === 0 && status.totalChars <= INLINE_OUTPUT_CHARS ? dataImage(status.output) : undefined;
  if (image !== undefined) {
    const artifact = await context.createArtifact({ bytes: Buffer.from(image.data, "base64"), mediaType: image.mediaType });
    return { status: "completed", summary, modelOutput: [{ type: "text", text: summary }, { type: "artifact", artifact, label: "Bash image" }], artifacts: [artifact], detail, renderer: { id: "actspace.image-gallery", schemaVersion: 1, props: { artifactIds: [artifact.artifactId] } } };
  }
  const text = `${summary}\ncommand: ${command}\ncwd: ${cwd}\n\n${status.output || "(no output)"}${status.totalChars > status.output.length ? `\n[Output truncated; totalChars=${status.totalChars}]` : ""}`;
  let artifact;
  if (status.totalChars > INLINE_OUTPUT_CHARS || status.truncated) {
    try { artifact = await context.createArtifact({ bytes: await readFile(outputPath), mediaType: "text/plain" }); }
    catch (error) { return failed("BASH_ARTIFACT_FAILED", `${text}\n\nFull output could not be preserved: ${error instanceof Error ? error.message : String(error)}`, false); }
  }
  // The hint is for the model; the summary, exit code and sandbox marker the user sees stay the same.
  const hint = await sandboxDenialHint(status, outputPath);
  const modelText = hint === undefined ? text : `${text}\n\n${hint}`;
  const modelOutput = artifact === undefined ? [{ type: "text" as const, text: modelText }] : [{ type: "text" as const, text: modelText }, { type: "artifact" as const, artifact, label: "Full Bash output" }];
  return status.exitCode === 0
    ? { status: "completed", summary, modelOutput, ...(artifact === undefined ? {} : { artifacts: [artifact] }), detail }
    : { status: "failed", summary: text, modelOutput, ...(artifact === undefined ? {} : { artifacts: [artifact] }), detail, failure: { code: "BASH_EXIT_NONZERO", message: text, retryable: false } };
}

function backgrounded(task: BashTask, reason: "explicit" | "block_timeout" | "already_running"): ToolBodyResult {
  const summary = `Bash task ${task.taskId} is running in the background (${reason}).`;
  const next = "You will be notified automatically when it finishes; continue with other work. Use task_output to inspect output or task_stop to stop it. Do not poll with sleep loops or repeated task_output.";
  return { ...completed(`${summary}\noutput_path: ${task.outputPath}\n${next}`, summary), detail: [{ label: "background-task", value: { taskId: task.taskId, status: "running" } }, environmentDetail(task.sandboxed)] };
}

/** Where the command ran, as a fact the UI reads; the `sandboxed=` in the summary is prose for the model. */
function environmentDetail(sandboxed: boolean) {
  return { label: "environment", value: { sandboxed } };
}

type OutputSubscription = { readonly pattern: string; readonly reason: string; readonly debounceMs: number };

class OutputMonitor {
  readonly #regex: RegExp | undefined;
  readonly #pending: string[] = [];
  #listener: ((line: string) => void) | undefined;
  #lineBuffer = "";
  #lastNotifiedAt = 0;
  #disposed = false;
  constructor(private readonly subscription?: OutputSubscription) { this.#regex = subscription === undefined ? undefined : new RegExp(subscription.pattern); }
  handleChunk = (text: string): void => {
    if (this.#disposed || this.#regex === undefined) return;
    this.#lineBuffer += text;
    const lines = this.#lineBuffer.split("\n"); this.#lineBuffer = lines.pop() ?? "";
    for (const line of lines) this.#scan(line);
    if (this.#lineBuffer.length > MAX_MONITOR_LINE_CHARS) { this.#scan(this.#lineBuffer.slice(0, MAX_MONITOR_LINE_CHARS)); this.#lineBuffer = ""; }
  };
  attach(listener: (line: string) => void): void { if (this.#disposed) return; this.#listener = listener; for (const line of this.#pending.splice(0)) this.#emit(line); }
  dispose(): void { this.#disposed = true; this.#listener = undefined; this.#pending.splice(0); }
  #scan(line: string): void { const value = line.slice(0, MAX_MONITOR_LINE_CHARS); this.#regex!.lastIndex = 0; if (!this.#regex!.test(value)) return; if (this.#listener === undefined) { if (this.#pending.length < 8) this.#pending.push(value); } else this.#emit(value); }
  #emit(line: string): void { const now = Date.now(); if (now - this.#lastNotifiedAt < (this.subscription?.debounceMs ?? MIN_SUBSCRIPTION_DEBOUNCE_MS)) return; this.#lastNotifiedAt = now; this.#listener?.(line); }
}

function parseOutputSubscription(value: RuntimeV2JsonValue | undefined): OutputSubscription | string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return "notifyOnOutput must be an object.";
  const record = value as Readonly<Record<string, RuntimeV2JsonValue>>;
  const pattern = typeof record.pattern === "string" ? record.pattern : "";
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  if (!pattern || pattern.length > MAX_SUBSCRIPTION_PATTERN_LENGTH) return `notifyOnOutput.pattern must contain 1-${MAX_SUBSCRIPTION_PATTERN_LENGTH} characters.`;
  try { new RegExp(pattern); } catch { return "notifyOnOutput.pattern must be a valid regular expression."; }
  if (!reason) return "notifyOnOutput.reason is required.";
  const debounceMs = typeof record.debounceMs === "number" && Number.isFinite(record.debounceMs) ? Math.max(MIN_SUBSCRIPTION_DEBOUNCE_MS, Math.trunc(record.debounceMs)) : MIN_SUBSCRIPTION_DEBOUNCE_MS;
  return Object.freeze({ pattern, reason: reason.slice(0, 80), debounceMs });
}

function backgroundBoundary(blockMs: number): { readonly promise: Promise<false>; readonly cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let immediate: ReturnType<typeof setImmediate> | undefined;
  const promise = new Promise<false>((resolveBoundary) => {
    if (blockMs === 0) immediate = setImmediate(() => resolveBoundary(false));
    else { timer = setTimeout(() => resolveBoundary(false), blockMs); timer.unref?.(); }
  });
  return { promise, cancel: () => { if (timer !== undefined) clearTimeout(timer); if (immediate !== undefined) clearImmediate(immediate); } };
}

function within(root: string, candidate: string): boolean { const nested = relative(resolve(root), resolve(candidate)); return nested === "" || (!nested.startsWith("..") && !isAbsolute(nested)); }
function stringArg(args: Readonly<Record<string, RuntimeV2JsonValue>>, name: string): string { return typeof args[name] === "string" ? args[name] : ""; }
function clampInteger(value: RuntimeV2JsonValue | undefined, fallback: number, min: number, max: number): number { return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback; }
function dataImage(output: string): { readonly mediaType: string; readonly data: string } | undefined { const match = output.trim().match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i); return match?.[1] && match[2] ? { mediaType: match[1].toLowerCase(), data: match[2].replace(/\s/g, "") } : undefined; }
function completed(text: string, summary: string): ToolBodyResult { return { status: "completed", summary, modelOutput: [{ type: "text", text }] }; }
function failed(code: string, message: string, retryable: boolean): ToolBodyResult { return { status: "failed", summary: message, modelOutput: [{ type: "text", text: message }], failure: { code, message, retryable } }; }
