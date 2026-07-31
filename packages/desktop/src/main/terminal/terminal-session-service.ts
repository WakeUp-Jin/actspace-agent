import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import {
  TERMINAL_LIMITS,
  type TerminalErrorCode,
  type TerminalEvent,
  type TerminalOperationResult,
  type TerminalSessionResult,
  type TerminalSessionSnapshot,
} from "@actspace/shared";
import type { CreateTerminalBackend, TerminalBackend } from "./terminal-backend";
import { ShellEnvironmentService } from "./shell-environment-service";
import { terminateProcessTree, terminateProcessTreeSync } from "./terminal-process-cleanup";

const REPLAY_LIMIT_BYTES = 128 * 1024;
const PAUSE_AT_BYTES = 256 * 1024;
const RESUME_AT_BYTES = 64 * 1024;
const OUTPUT_BATCH_MS = 16;
const IPC_BATCH_LIMIT_BYTES = 32 * 1024;

type ManagedTerminal = {
  snapshot: TerminalSessionSnapshot;
  ownerId: number;
  backend: TerminalBackend;
  attached: boolean;
  closing: boolean;
  paused: boolean;
  unackedBytes: number;
  pendingData: string[];
  pendingBytes: number;
  batchTimer?: NodeJS.Timeout;
  replay: Array<{ data: string; bytes: number }>;
  replayBytes: number;
  replayTruncated: boolean;
  disposers: Array<() => void>;
};

export type TerminalSessionServiceOptions = {
  readSession: (sessionId: string) => Promise<{ workspaceRoot?: string } | null>;
  resolveWorkspaceRoot: (workspaceRoot?: string) => Promise<string>;
  createBackend: CreateTerminalBackend;
  shellEnvironment?: ShellEnvironmentService;
  sendEvent: (ownerId: number, event: TerminalEvent) => void;
  log?: (message: string, detail?: Record<string, unknown>) => void;
};

function failure(code: TerminalErrorCode, message: string): TerminalSessionResult {
  return { ok: false, error: { code, message } };
}

function operationFailure(code: TerminalErrorCode, message: string): TerminalOperationResult {
  return { ok: false, error: { code, message } };
}

function validateSize(cols: number, rows: number): boolean {
  return Number.isInteger(cols) && Number.isInteger(rows)
    && cols >= TERMINAL_LIMITS.minCols && cols <= TERMINAL_LIMITS.maxCols
    && rows >= TERMINAL_LIMITS.minRows && rows <= TERMINAL_LIMITS.maxRows;
}

function errorCode(error: unknown): TerminalErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = message.split(":", 1)[0] as TerminalErrorCode;
  return [
    "shell_not_found",
    "shell_environment_failed",
    "native_module_unavailable",
  ].includes(prefix) ? prefix : "pty_spawn_failed";
}

function publicCreateError(error: unknown): { code: TerminalErrorCode; message: string } {
  const code = errorCode(error);
  const messages: Record<TerminalErrorCode, string> = {
    session_not_found: "当前任务不存在。",
    workspace_not_found: "任务工作区不存在。",
    workspace_not_registered: "任务工作区未登记。",
    terminal_not_found: "终端不存在。",
    terminal_owned_by_another_window: "终端属于另一个窗口。",
    terminal_limit_reached: "终端数量已达到上限。",
    shell_not_found: "找不到可执行的默认 Shell。",
    shell_environment_failed: "无法读取用户 Shell 环境。",
    pty_spawn_failed: "无法启动本机终端进程。",
    invalid_terminal_size: "终端尺寸无效。",
    invalid_terminal_input: "终端输入无效。",
    terminal_closed: "终端已经关闭。",
    native_module_unavailable: "终端原生模块不可用，请重新安装或更新应用。",
  };
  return { code, message: messages[code] };
}

function splitUtf8(data: string, maxBytes: number): Array<{ data: string; bytes: number }> {
  const chunks: Array<{ data: string; bytes: number }> = [];
  let current = "";
  let bytes = 0;
  for (const character of data) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes && current) {
      chunks.push({ data: current, bytes });
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += characterBytes;
  }
  if (current) chunks.push({ data: current, bytes });
  return chunks;
}

export class TerminalSessionService {
  private readonly terminals = new Map<string, ManagedTerminal>();
  private readonly shellEnvironment: ShellEnvironmentService;

  constructor(private readonly options: TerminalSessionServiceOptions) {
    this.shellEnvironment = options.shellEnvironment ?? new ShellEnvironmentService();
  }

  list(sessionId: string, ownerId: number): TerminalSessionSnapshot[] {
    return [...this.terminals.values()]
      .filter((terminal) => terminal.snapshot.sessionId === sessionId && terminal.ownerId === ownerId)
      .map((terminal) => ({ ...terminal.snapshot }));
  }

  async create(sessionId: string, ownerId: number, cols: number, rows: number): Promise<TerminalSessionResult> {
    if (!validateSize(cols, rows)) return failure("invalid_terminal_size", "终端尺寸无效。");
    const activeTerminals = [...this.terminals.values()].filter((item) => item.snapshot.status === "running" || item.snapshot.status === "closing");
    const sessionCount = activeTerminals.filter((item) => item.snapshot.sessionId === sessionId).length;
    const ownerCount = activeTerminals.filter((item) => item.ownerId === ownerId).length;
    if (sessionCount >= TERMINAL_LIMITS.maxPerSession || ownerCount >= TERMINAL_LIMITS.maxPerWindow) {
      return failure("terminal_limit_reached", "已达到当前任务或窗口的终端数量上限。");
    }

    const session = await this.options.readSession(sessionId);
    if (!session) return failure("session_not_found", "当前任务不存在，无法创建终端。");

    let cwd: string;
    try {
      cwd = await this.options.resolveWorkspaceRoot(session.workspaceRoot);
      const info = await stat(cwd);
      if (!info.isDirectory()) return failure("workspace_not_found", "任务工作区不是目录。");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code: TerminalErrorCode = /not registered|未注册/i.test(message)
        ? "workspace_not_registered"
        : "workspace_not_found";
      return failure(code, code === "workspace_not_registered" ? "任务工作区未登记。" : "任务工作区不存在或不可访问。");
    }

    let shell;
    let backend: TerminalBackend;
    try {
      shell = await this.shellEnvironment.resolve();
      backend = this.options.createBackend({
        shell: shell.shell,
        args: shell.args,
        cwd,
        env: shell.env,
        cols,
        rows,
      });
    } catch (error) {
      const publicError = publicCreateError(error);
      return failure(publicError.code, publicError.message);
    }

    const ordinal = 1 + Math.max(0, ...[...this.terminals.values()]
      .filter((item) => item.snapshot.sessionId === sessionId)
      .map((item) => Number(item.snapshot.title.match(/(\d+)$/)?.[1] ?? 0)));
    const snapshot: TerminalSessionSnapshot = {
      id: randomUUID(),
      sessionId,
      title: `Terminal ${ordinal}`,
      shellName: shell.shellName || basename(shell.shell),
      status: "running",
      cols,
      rows,
      createdAt: new Date().toISOString(),
    };
    const terminal: ManagedTerminal = {
      snapshot,
      ownerId,
      backend,
      attached: false,
      closing: false,
      paused: false,
      unackedBytes: 0,
      pendingData: [],
      pendingBytes: 0,
      replay: [],
      replayBytes: 0,
      replayTruncated: false,
      disposers: [],
    };
    terminal.disposers.push(
      backend.onData((data) => this.onData(terminal, data)),
      backend.onExit(({ exitCode }) => this.onExit(terminal, exitCode)),
    );
    this.terminals.set(snapshot.id, terminal);
    this.options.log?.("terminal created", { terminalId: snapshot.id, sessionId, ownerId, pid: backend.pid });
    return { ok: true, terminal: { ...snapshot } };
  }

  attach(terminalId: string, ownerId: number, cols: number, rows: number): TerminalSessionResult {
    if (!validateSize(cols, rows)) return failure("invalid_terminal_size", "终端尺寸无效。");
    const owned = this.requireOwned(terminalId, ownerId);
    if ("error" in owned) return owned;
    const terminal = owned.terminal;
    terminal.attached = true;
    terminal.unackedBytes = 0;
    if (terminal.paused) {
      terminal.backend.resume();
      terminal.paused = false;
    }
    terminal.backend.resize(cols, rows);
    terminal.snapshot.cols = cols;
    terminal.snapshot.rows = rows;
    this.options.sendEvent(ownerId, { type: "attached", terminal: { ...terminal.snapshot } });
    if (terminal.replay.length > 0) {
      this.options.sendEvent(ownerId, {
        type: "init_log",
        terminalId,
        data: terminal.replay.map((item) => item.data).join(""),
        truncated: terminal.replayTruncated,
      });
    }
    return { ok: true, terminal: { ...terminal.snapshot } };
  }

  detach(terminalId: string, ownerId: number): TerminalOperationResult {
    const owned = this.requireOwnedOperation(terminalId, ownerId);
    if ("error" in owned) return owned;
    owned.terminal.attached = false;
    owned.terminal.unackedBytes = 0;
    if (owned.terminal.paused) {
      owned.terminal.backend.resume();
      owned.terminal.paused = false;
    }
    return { ok: true };
  }

  write(terminalId: string, ownerId: number, data: string): TerminalOperationResult {
    const owned = this.requireOwnedOperation(terminalId, ownerId);
    if ("error" in owned) return owned;
    const terminal = owned.terminal;
    const bytes = Buffer.byteLength(data, "utf8");
    if (!data || bytes > TERMINAL_LIMITS.maxInputBytes) {
      return operationFailure("invalid_terminal_input", "终端输入为空或超过 64 KiB 限制。");
    }
    if (terminal.snapshot.status !== "running") return operationFailure("terminal_closed", "终端已经退出。");
    terminal.backend.write(data);
    return { ok: true };
  }

  resize(terminalId: string, ownerId: number, cols: number, rows: number): TerminalOperationResult {
    if (!validateSize(cols, rows)) return operationFailure("invalid_terminal_size", "终端尺寸无效。");
    const owned = this.requireOwnedOperation(terminalId, ownerId);
    if ("error" in owned) return owned;
    if (owned.terminal.snapshot.status !== "running") return operationFailure("terminal_closed", "终端已经退出。");
    owned.terminal.backend.resize(cols, rows);
    owned.terminal.snapshot.cols = cols;
    owned.terminal.snapshot.rows = rows;
    return { ok: true };
  }

  ack(terminalId: string, ownerId: number, bytes: number): TerminalOperationResult {
    const owned = this.requireOwnedOperation(terminalId, ownerId);
    if ("error" in owned) return owned;
    const terminal = owned.terminal;
    terminal.unackedBytes = Math.max(0, terminal.unackedBytes - Math.max(0, Math.floor(bytes)));
    if (terminal.paused && terminal.unackedBytes <= RESUME_AT_BYTES) {
      terminal.backend.resume();
      terminal.paused = false;
    }
    return { ok: true };
  }

  async close(terminalId: string, ownerId: number): Promise<TerminalOperationResult> {
    const owned = this.requireOwnedOperation(terminalId, ownerId);
    if ("error" in owned) return owned;
    await this.closeManaged(owned.terminal);
    return { ok: true };
  }

  async closeSession(sessionId: string): Promise<void> {
    await Promise.all([...this.terminals.values()]
      .filter((terminal) => terminal.snapshot.sessionId === sessionId)
      .map((terminal) => this.closeManaged(terminal)));
  }

  async closeOwner(ownerId: number): Promise<void> {
    await Promise.all([...this.terminals.values()]
      .filter((terminal) => terminal.ownerId === ownerId)
      .map((terminal) => this.closeManaged(terminal)));
  }

  harvestAllSync(): number {
    const terminals = [...this.terminals.values()];
    for (const terminal of terminals) {
      terminateProcessTreeSync(terminal.backend.pid);
      try { terminal.backend.kill(); } catch { /* best effort */ }
      this.dispose(terminal);
    }
    return terminals.length;
  }

  private onData(terminal: ManagedTerminal, data: string): void {
    if (terminal.closing) return;
    const replayChunks = splitUtf8(data, IPC_BATCH_LIMIT_BYTES);
    for (const chunk of replayChunks) {
      terminal.replay.push(chunk);
      terminal.replayBytes += chunk.bytes;
    }
    while (terminal.replayBytes > REPLAY_LIMIT_BYTES && terminal.replay.length > 0) {
      terminal.replayBytes -= terminal.replay.shift()!.bytes;
      terminal.replayTruncated = true;
    }
    if (!terminal.attached) return;
    terminal.pendingData.push(data);
    terminal.pendingBytes += Buffer.byteLength(data, "utf8");
    terminal.batchTimer ??= setTimeout(() => this.flush(terminal), OUTPUT_BATCH_MS);
  }

  private flush(terminal: ManagedTerminal): void {
    if (terminal.batchTimer) clearTimeout(terminal.batchTimer);
    terminal.batchTimer = undefined;
    if (!terminal.attached || terminal.pendingBytes === 0) {
      terminal.pendingData = [];
      terminal.pendingBytes = 0;
      return;
    }
    const data = terminal.pendingData.join("");
    terminal.pendingData = [];
    terminal.pendingBytes = 0;
    for (const chunk of splitUtf8(data, IPC_BATCH_LIMIT_BYTES)) {
      terminal.unackedBytes += chunk.bytes;
      this.options.sendEvent(terminal.ownerId, {
        type: "data",
        terminalId: terminal.snapshot.id,
        data: chunk.data,
        bytes: chunk.bytes,
      });
    }
    if (!terminal.paused && terminal.unackedBytes >= PAUSE_AT_BYTES) {
      terminal.backend.pause();
      terminal.paused = true;
    }
  }

  private onExit(terminal: ManagedTerminal, exitCode: number): void {
    this.flush(terminal);
    terminal.snapshot.status = "exited";
    terminal.snapshot.exitCode = exitCode;
    if (terminal.attached) {
      this.options.sendEvent(terminal.ownerId, { type: "exit", terminalId: terminal.snapshot.id, exitCode });
    }
  }

  private async closeManaged(terminal: ManagedTerminal): Promise<void> {
    if (terminal.closing) return;
    terminal.closing = true;
    terminal.snapshot.status = "closing";
    await terminateProcessTree(terminal.backend.pid);
    try { terminal.backend.kill(); } catch { /* process already exited */ }
    terminal.snapshot.status = "closed";
    this.dispose(terminal);
  }

  private dispose(terminal: ManagedTerminal): void {
    if (terminal.batchTimer) clearTimeout(terminal.batchTimer);
    for (const dispose of terminal.disposers) dispose();
    terminal.disposers = [];
    this.terminals.delete(terminal.snapshot.id);
    this.options.log?.("terminal closed", { terminalId: terminal.snapshot.id, sessionId: terminal.snapshot.sessionId });
  }

  private requireOwned(terminalId: string, ownerId: number):
    | { terminal: ManagedTerminal }
    | { ok: false; error: { code: TerminalErrorCode; message: string } } {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return { ok: false, error: { code: "terminal_not_found", message: "终端不存在或已经关闭。" } };
    if (terminal.ownerId !== ownerId) {
      return { ok: false, error: { code: "terminal_owned_by_another_window", message: "终端属于另一个窗口。" } };
    }
    return { terminal };
  }

  private requireOwnedOperation(terminalId: string, ownerId: number):
    | { terminal: ManagedTerminal }
    | { ok: false; error: { code: TerminalErrorCode; message: string } } {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return { ok: false, error: { code: "terminal_not_found", message: "终端不存在或已经关闭。" } };
    if (terminal.ownerId !== ownerId) {
      return { ok: false, error: { code: "terminal_owned_by_another_window", message: "终端属于另一个窗口。" } };
    }
    return { terminal };
  }
}
