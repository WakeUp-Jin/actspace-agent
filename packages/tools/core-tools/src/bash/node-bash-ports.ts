import { spawn, type ChildProcessByStdio } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { Readable } from "node:stream";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolExecutionContext } from "@actspace/tools-runtime";
import { redactToolText } from "@actspace/tools-runtime";
import type { CoreToolHandler, CoreToolPorts } from "../plugin.js";

const INLINE_OUTPUT_CHARS = 8_000;
const OUTPUT_DISK_CAP_CHARS = 5 * 1024 * 1024;
const OUTPUT_READ_CAP_CHARS = 64_000;
const DEFAULT_BLOCK_MS = 30_000;
const MAX_BLOCK_MS = 600_000;
const MAX_RUNTIME_MS = 30 * 60_000;
const MAX_BACKGROUND_PER_SESSION = 8;
const KILL_GRACE_MS = 500;
const SANDBOX_PROBE_TIMEOUT_MS = 3_000;
const MAX_SUBSCRIPTION_PATTERN_LENGTH = 500;
const MIN_SUBSCRIPTION_DEBOUNCE_MS = 5_000;
const MAX_MONITOR_LINE_CHARS = 4_000;
const NOTIFICATION_TAIL_CHARS = 2_000;
let sandboxProbe: Promise<boolean> | undefined;

export type NodeBashToolPorts = Pick<CoreToolPorts, "bash" | "bash_output" | "bash_kill"> & {
  readonly dispose: () => Promise<void>;
};

export function createNodeBashToolPorts(options: { readonly workspaceRoot: string; readonly tmpRoot: string; readonly sandbox?: boolean }): NodeBashToolPorts {
  const registry = new BashTaskRegistry(join(options.tmpRoot, "bash-v2", randomUUID()));
  return Object.freeze({
    bash: (args, context) => executeBash(args, context, options, registry),
    bash_output: (args, context) => registry.output(stringArg(args, "taskId"), context.sessionId, integerArg(args, "tailLines")),
    bash_kill: (args, context) => registry.kill(stringArg(args, "taskId"), context.sessionId),
    dispose: () => registry.dispose(),
  });
}

async function executeBash(
  args: Readonly<Record<string, RuntimeV2JsonValue>>,
  context: ToolExecutionContext,
  options: { readonly workspaceRoot: string; readonly tmpRoot: string; readonly sandbox?: boolean },
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

  const outputRoot = registry.outputRoot;
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  const outputPath = join(outputRoot, `${randomUUID()}.log`);
  await writeFile(outputPath, "", { encoding: "utf8", mode: 0o600 });
  const wantsSandbox = options.sandbox !== false && !arrayStrings(args.requiredPermissions).includes("no_sandbox");
  const spawnSpec = wantsSandbox ? await sandboxSpawn(command, workspaceRoot, outputRoot) : { command: "/bin/zsh", args: ["-lc", command], env: process.env, sandboxed: false };
  const sandboxed = spawnSpec.sandboxed;
  const monitor = new OutputMonitor(subscription);
  const processHandle = new ProcessHandle(spawnSpec.command, spawnSpec.args, realCwd, spawnSpec.env, outputPath, monitor.handleChunk);
  const abort = () => processHandle.kill();
  context.signal.addEventListener("abort", abort, { once: true });
  const blockMs = clampInteger(args.blockMs, DEFAULT_BLOCK_MS, 0, MAX_BLOCK_MS);
  const boundary = backgroundBoundary(blockMs);
  try {
    const completedInTime = await Promise.race([
      processHandle.wait.then(() => true),
      boundary.promise,
    ]);
    if (completedInTime || processHandle.settled) { monitor.dispose(); return foreground(command, realCwd, await processHandle.wait, processHandle.outputPath, sandboxed, context); }
    const task = registry.register({ sessionId: context.sessionId, command, cwd: realCwd, outputPath, process: processHandle, sandboxed, monitor, subscription, notifyAgent: context.notifyAgent, reportProgress: context.reportProgress });
    return backgrounded(task, blockMs === 0 ? "explicit" : "block_timeout");
  } finally {
    boundary.cancel();
    context.signal.removeEventListener("abort", abort);
  }
}

type ProcessStatus = { readonly exitCode: number | null; readonly signal: NodeJS.Signals | null; readonly output: string; readonly totalChars: number; readonly truncated: boolean; readonly durationMs: number; readonly startError?: string; readonly outputError?: string };

class ProcessHandle {
  readonly child: ChildProcessByStdio<null, Readable, Readable>;
  readonly wait: Promise<ProcessStatus>;
  #settled = false;
  #killTimer: ReturnType<typeof setTimeout> | undefined;
  get settled(): boolean { return this.#settled; }

  constructor(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv, readonly outputPath: string, onChunk?: (text: string) => void) {
    const startedAt = Date.now();
    this.child = spawn(command, [...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    this.wait = new Promise((resolveStatus) => {
      let head = "";
      let totalChars = 0;
      let truncated = false;
      let startError: string | undefined;
      let outputError: string | undefined;
      let writtenChars = 0;
      const output = createWriteStream(this.outputPath, { flags: "a", encoding: "utf8" });
      const chunk = (value: Buffer) => {
        const text = value.toString("utf8");
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
      };
      this.child.stdout.on("data", chunk);
      this.child.stderr.on("data", chunk);
      this.child.once("error", (error) => { startError = error.message; });
      output.once("error", (error) => { outputError = error.message; this.kill(); });
      this.child.once("close", (exitCode, signal) => {
        if (this.#settled) return;
        this.#settled = true;
        if (this.#killTimer !== undefined) clearTimeout(this.#killTimer);
        const finish = () => resolveStatus({ exitCode, signal, output: head, totalChars, truncated, durationMs: Date.now() - startedAt, ...(startError === undefined ? {} : { startError }), ...(outputError === undefined ? {} : { outputError }) });
        if (output.destroyed) finish();
        else output.end(finish);
      });
    });
  }

  kill(): void {
    if (this.#settled) return;
    signalProcess(this.child, "SIGTERM");
    if (this.#killTimer !== undefined) return;
    this.#killTimer = setTimeout(() => signalProcess(this.child, "SIGKILL"), KILL_GRACE_MS);
    this.#killTimer.unref?.();
  }
}

function signalProcess(child: ChildProcessByStdio<null, Readable, Readable>, signal: NodeJS.Signals): void {
  try {
    if (process.platform !== "win32" && child.pid !== undefined) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch { /* Process already exited. */ }
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
  readonly notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>;
  readonly reportProgress: ToolExecutionContext["reportProgress"];
  status: "running" | "completed" | "failed" | "killed";
  exitCode?: number | null;
  endedAt?: number;
  lastReadOffset: number;
  timer: ReturnType<typeof setTimeout>;
  completion: Promise<void>;
  readonly notifications: Set<Promise<void>>;
};

class BashTaskRegistry {
  readonly #tasks = new Map<string, BashTask>();
  constructor(readonly outputRoot: string) {}

  register(input: Omit<BashTask, "taskId" | "startedAt" | "status" | "lastReadOffset" | "timer" | "completion" | "notifications">): BashTask {
    const task = { ...input, taskId: `bash_${randomUUID()}`, startedAt: Date.now(), status: "running" as const, lastReadOffset: 0, notifications: new Set<Promise<void>>() } as BashTask;
    task.timer = setTimeout(() => { if (task.status === "running") { task.status = "killed"; task.process.kill(); } }, MAX_RUNTIME_MS);
    task.timer.unref?.();
    this.#tasks.set(task.taskId, task);
    task.monitor.attach((line) => {
      task.reportProgress({ message: `Background Bash output matched: ${task.subscription?.reason ?? "subscription"}` });
      this.#scheduleNotification(task, "output_match", line);
    });
    task.completion = task.process.wait.then(async (status) => {
      clearTimeout(task.timer);
      task.endedAt = Date.now();
      task.exitCode = status.exitCode;
      if (task.status === "running") task.status = status.signal !== null ? "killed" : status.exitCode === 0 ? "completed" : "failed";
      task.monitor.dispose();
      task.reportProgress({ message: `Background Bash task ${task.taskId} ${task.status}.` });
      this.#scheduleNotification(task, task.status, await readFile(task.outputPath, "utf8").then((value) => value.slice(-NOTIFICATION_TAIL_CHARS)).catch(() => ""));
      await Promise.all([...task.notifications]);
    }).catch(() => undefined);
    return task;
  }

  find(sessionId: string, cwd: string, command: string): BashTask | undefined { return [...this.#tasks.values()].find((task) => task.sessionId === sessionId && task.cwd === cwd && task.command === command && task.status === "running"); }
  running(sessionId: string): number { return [...this.#tasks.values()].filter((task) => task.sessionId === sessionId && task.status === "running").length; }

  async output(taskId: string, sessionId: string, tailLines?: number): Promise<ToolBodyResult> {
    const task = this.#owned(taskId, sessionId);
    if (task === undefined) return failed("BASH_TASK_NOT_FOUND", `Unknown background task: ${taskId || "(missing taskId)"}`, false);
    const full = await readFile(task.outputPath, "utf8").catch(() => "");
    let output: string;
    let mode: string;
    if (tailLines !== undefined) { output = full.split("\n").slice(-tailLines).join("\n"); mode = `tail ${tailLines} lines`; }
    else { output = full.slice(task.lastReadOffset); mode = `delta from offset ${task.lastReadOffset}`; task.lastReadOffset = full.length; }
    if (output.length > OUTPUT_READ_CAP_CHARS) output = `[Earlier output omitted]\n${output.slice(-OUTPUT_READ_CAP_CHARS)}`;
    return completed(`${describe(task)}\nread mode: ${mode}\n\n${output || "(no new output)"}`, describe(task));
  }

  async kill(taskId: string, sessionId: string): Promise<ToolBodyResult> {
    const task = this.#owned(taskId, sessionId);
    if (task === undefined) return failed("BASH_TASK_NOT_FOUND", `Unknown background task: ${taskId || "(missing taskId)"}`, false);
    if (task.status === "running") { task.status = "killed"; task.process.kill(); }
    await task.completion;
    const full = await readFile(task.outputPath, "utf8").catch(() => "");
    return completed(`${describe(task)}\n${full ? `\noutput tail:\n${full.slice(-2_000)}` : ""}`, describe(task));
  }

  async dispose(): Promise<void> {
    const running = [...this.#tasks.values()].filter((task) => task.status === "running");
    for (const task of running) { task.status = "killed"; task.process.kill(); }
    await Promise.all([...this.#tasks.values()].map((task) => task.completion));
    for (const task of this.#tasks.values()) { clearTimeout(task.timer); task.monitor.dispose(); }
    await rm(this.outputRoot, { force: true, recursive: true });
    this.#tasks.clear();
  }

  #scheduleNotification(task: BashTask, status: BashTask["status"] | "output_match", output: string): void {
    const notification = this.#notify(task, status, output);
    task.notifications.add(notification);
    void notification.finally(() => task.notifications.delete(notification));
  }

  async #notify(task: BashTask, status: BashTask["status"] | "output_match", output: string): Promise<void> {
    if (task.notifyAgent === undefined) return;
    const summary = status === "output_match"
      ? `Background command output matched the subscription (${task.subscription?.reason ?? "requested output"}).`
      : `Background command ${status}${task.exitCode === undefined ? "" : ` with exit code ${task.exitCode}`}.`;
    const text = [
      "<task_notification>",
      `<task_id>${escapeXml(task.taskId)}</task_id>`,
      `<status>${escapeXml(status)}</status>`,
      `<summary>${escapeXml(summary)}</summary>`,
      ...(output ? ["<output_tail>", escapeXml(redactToolText(output.slice(-NOTIFICATION_TAIL_CHARS))), "</output_tail>"] : []),
      "</task_notification>",
    ].join("\n");
    await task.notifyAgent(text).catch(() => undefined);
  }

  #owned(taskId: string, sessionId: string): BashTask | undefined {
    const task = this.#tasks.get(taskId);
    return task?.sessionId === sessionId ? task : undefined;
  }
}

async function foreground(command: string, cwd: string, status: ProcessStatus, outputPath: string, sandboxed: boolean, context: ToolExecutionContext): Promise<ToolBodyResult> {
  if (status.startError !== undefined) return failed("BASH_START_FAILED", `Failed to start Bash command: ${status.startError}`, true);
  if (status.outputError !== undefined) return failed("BASH_OUTPUT_FAILED", `Failed to persist Bash output: ${status.outputError}`, true);
  const summary = `Bash ${status.exitCode === 0 ? "completed" : "failed"} in ${status.durationMs}ms (exit ${status.exitCode ?? "signal"}, sandboxed=${sandboxed}).`;
  const image = status.exitCode === 0 && status.totalChars <= INLINE_OUTPUT_CHARS ? dataImage(status.output) : undefined;
  if (image !== undefined) {
    const artifact = await context.createArtifact({ bytes: Buffer.from(image.data, "base64"), mediaType: image.mediaType });
    return { status: "completed", summary, modelOutput: [{ type: "text", text: summary }, { type: "artifact", artifact, label: "Bash image" }], artifacts: [artifact], renderer: { id: "actspace.image-gallery", schemaVersion: 1, props: { artifactIds: [artifact.artifactId] } } };
  }
  const text = `${summary}\ncommand: ${command}\ncwd: ${cwd}\n\n${status.output || "(no output)"}${status.totalChars > status.output.length ? `\n[Output truncated; totalChars=${status.totalChars}]` : ""}`;
  let artifact;
  if (status.totalChars > INLINE_OUTPUT_CHARS || status.truncated) {
    try { artifact = await context.createArtifact({ bytes: await readFile(outputPath), mediaType: "text/plain" }); }
    catch (error) { return failed("BASH_ARTIFACT_FAILED", `${text}\n\nFull output could not be preserved: ${error instanceof Error ? error.message : String(error)}`, false); }
  }
  const modelOutput = artifact === undefined ? [{ type: "text" as const, text }] : [{ type: "text" as const, text }, { type: "artifact" as const, artifact, label: "Full Bash output" }];
  return status.exitCode === 0
    ? { status: "completed", summary, modelOutput, ...(artifact === undefined ? {} : { artifacts: [artifact] }) }
    : { status: "failed", summary: text, modelOutput, ...(artifact === undefined ? {} : { artifacts: [artifact] }), failure: { code: "BASH_EXIT_NONZERO", message: text, retryable: false } };
}

function backgrounded(task: BashTask, reason: "explicit" | "block_timeout" | "already_running"): ToolBodyResult {
  const summary = `Bash task ${task.taskId} is running in the background (${reason}).`;
  return { ...completed(`${summary}\nUse bash_output for a bounded delta or bash_kill to stop it. Do not poll with sleep loops.`, summary), detail: [{ label: "background-task", value: { taskId: task.taskId, status: "running" } }] };
}

async function sandboxSpawn(command: string, workspaceRoot: string, outputRoot: string): Promise<{ readonly command: string; readonly args: readonly string[]; readonly env: NodeJS.ProcessEnv; readonly sandboxed: boolean }> {
  if (!await probeSandbox()) return { command: "/bin/zsh", args: ["-lc", command], env: process.env, sandboxed: false };
  const [workspace, temp, home] = await Promise.all([realpath(workspaceRoot), realpath(tmpdir()), realpath(homedir())]);
  const profilePath = join(outputRoot, "sandbox.sb");
  const profile = [
    "(version 1)",
    "(deny default)",
    "(allow process*)", "(allow signal)", "(allow network*)", "(allow sysctl-read)", "(allow mach-lookup)", "(allow ipc-posix*)", "(allow file-ioctl)",
    "(allow file-read*)",
    '(deny file-read* (subpath (param "SSH")) (subpath (param "AWS")) (subpath (param "GNUPG")))',
    '(allow file-write* (subpath (param "WORKSPACE")) (subpath (param "OUTPUT")) (subpath (param "TEMP")) (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr"))',
    '(deny file-write* (subpath (param "GIT_HOOKS")) (literal (param "GIT_CONFIG")))',
  ].join("\n");
  await writeFile(profilePath, profile, "utf8");
  const params = { WORKSPACE: workspace, OUTPUT: outputRoot, TEMP: temp, SSH: join(home, ".ssh"), AWS: join(home, ".aws"), GNUPG: join(home, ".gnupg"), GIT_HOOKS: join(workspace, ".git", "hooks"), GIT_CONFIG: join(workspace, ".git", "config") };
  const injected = Object.entries(params).flatMap(([key, value]) => ["-D", `${key}=${value}`]);
  return { command: "/usr/bin/sandbox-exec", args: ["-f", profilePath, ...injected, "/bin/zsh", "-lc", command], env: { ...process.env, TMPDIR: outputRoot }, sandboxed: true };
}

function probeSandbox(): Promise<boolean> {
  if (process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec")) return Promise.resolve(false);
  sandboxProbe ??= new Promise((resolveProbe) => {
    const child = spawn("/usr/bin/sandbox-exec", ["-p", "(version 1)(allow default)", "/usr/bin/true"], { stdio: "ignore" });
    let settled = false;
    const finish = (value: boolean) => { if (settled) return; settled = true; clearTimeout(timer); resolveProbe(value); };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(false); }, SANDBOX_PROBE_TIMEOUT_MS);
    timer.unref?.();
    child.once("error", () => finish(false));
    child.once("close", (code) => finish(code === 0));
  });
  return sandboxProbe;
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
function integerArg(args: Readonly<Record<string, RuntimeV2JsonValue>>, name: string): number | undefined { const value = args[name]; return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined; }
function clampInteger(value: RuntimeV2JsonValue | undefined, fallback: number, min: number, max: number): number { return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback; }
function arrayStrings(value: RuntimeV2JsonValue | undefined): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function dataImage(output: string): { readonly mediaType: string; readonly data: string } | undefined { const match = output.trim().match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i); return match?.[1] && match[2] ? { mediaType: match[1].toLowerCase(), data: match[2].replace(/\s/g, "") } : undefined; }
function escapeXml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function describe(task: BashTask): string { return `Task ${task.taskId} status=${task.status} runtime=${Math.round(((task.endedAt ?? Date.now()) - task.startedAt) / 1_000)}s${task.exitCode === undefined ? "" : ` exitCode=${task.exitCode}`}`; }
function completed(text: string, summary: string): ToolBodyResult { return { status: "completed", summary, modelOutput: [{ type: "text", text }] }; }
function failed(code: string, message: string, retryable: boolean): ToolBodyResult { return { status: "failed", summary: message, modelOutput: [{ type: "text", text: message }], failure: { code, message, retryable } }; }
