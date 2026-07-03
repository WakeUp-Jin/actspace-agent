import { spawn, type SpawnOptions } from "node:child_process";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname } from "node:path";

const TIMEOUT_KILL_GRACE_MS = 500;

export interface RunProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputChars: number;
  env?: NodeJS.ProcessEnv;
  /**
   * 流式落盘 sink（bash 等大输出工具用）。设置后 stdout+stderr 合并为一条逻辑输出流：
   * 内存只保留前 `headBufferCap` 字符（headBuffer），其余流式写到 `outputFile`，
   * 写盘达到 `diskCap` 字符即停写并标记 truncated。内存占用恒定 ≈ headBufferCap，
   * 与输出总量无关，从根上避免「内存累加全量」吃光内存。
   *
   * 未设置 `outputFile` 时走旧的内存累加模式（受 `maxOutputChars` 约束），ripgrep 等沿用。
   */
  outputFile?: string;
  /** sink 模式：内存头部缓冲上限（字符），仅在 outputFile 设置时生效 */
  headBufferCap?: number;
  /** sink 模式：写盘硬上限（字符），仅在 outputFile 设置时生效 */
  diskCap?: number;
}

export interface RunProcessResult {
  command: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
  startError?: string;
  /**
   * sink 模式：合并输出（stdout+stderr）的前 headBufferCap 字符。
   * 非 sink 模式为空串。
   */
  headBuffer: string;
  /** sink 模式：合并输出的总字符数（不受 headBufferCap/diskCap 限制，反映真实规模）。 */
  totalBytes: number;
  /** sink 模式：仅当合并输出 > headBufferCap、确实创建了落盘文件时才有。 */
  outputFilePath?: string;
}

export async function runProcess(options: RunProcessOptions): Promise<RunProcessResult> {
  // sink 模式由 headBufferCap 触发：内存恒定、可选落盘。bash 始终走此模式。
  if (options.headBufferCap !== undefined) {
    return runProcessStreaming(options, options.outputFile);
  }
  return runProcessInMemory(options);
}

function createSpawnOptions(options: RunProcessOptions): SpawnOptions {
  return {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  };
}

function signalChild(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child when process-group signalling is unavailable.
    }
  }
  child.kill(signal);
}

/** 旧内存累加模式（ripgrep 等使用）：受 maxOutputChars 约束。 */
async function runProcessInMemory(options: RunProcessOptions): Promise<RunProcessResult> {
  const startedAt = Date.now();
  const resultBase = {
    command: options.command,
    args: [...options.args],
    cwd: options.cwd,
  };

  return new Promise<RunProcessResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let truncated = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const child = spawn(options.command, options.args, createSpawnOptions(options));

    const finish = (result: Omit<RunProcessResult, "durationMs">) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        ...result,
        durationMs: Date.now() - startedAt,
      });
    };

    timer = setTimeout(() => {
      timedOut = true;
      signalChild(child, "SIGTERM");
      killTimer = setTimeout(() => {
        signalChild(child, "SIGKILL");
        finish({
          ...resultBase,
          stdout,
          stderr,
          exitCode: null,
          signal: "SIGKILL",
          timedOut,
          truncated,
          headBuffer: "",
          totalBytes: 0,
        });
      }, TIMEOUT_KILL_GRACE_MS);
    }, options.timeoutMs);

    const append = (current: string, next: Buffer): string => {
      if (current.length >= options.maxOutputChars) {
        truncated = true;
        return current;
      }

      const text = next.toString("utf8");
      const available = options.maxOutputChars - current.length;
      if (text.length > available) {
        truncated = true;
      }
      return current + text.slice(0, available);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    child.on("error", (err) => {
      finish({
        ...resultBase,
        stdout,
        stderr,
        exitCode: null,
        signal: null,
        timedOut,
        truncated,
        startError: err.message,
        headBuffer: "",
        totalBytes: 0,
      });
    });

    child.on("close", (exitCode, signal) => {
      finish({
        ...resultBase,
        stdout,
        stderr,
        exitCode,
        signal,
        timedOut,
        truncated,
        headBuffer: "",
        totalBytes: 0,
      });
    });
  });
}

// ─── 句柄式 sink 进程（bash 前台/后台统一底座） ───

export interface ProcessSinkOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** 溢出落盘路径。缺省则溢出丢弃并标记 truncated。 */
  outputFile?: string;
  /** 内存头部缓冲上限（字符），默认 4000。 */
  headBufferCap?: number;
  /** 写盘硬上限（字符），默认 5MB。 */
  diskCap?: number;
  /** diskCap 命中时是否终止进程（后台任务的磁盘看门狗），默认 false（仅停写）。 */
  killOnDiskCap?: boolean;
  /** 每个输出 chunk 的回调（输出订阅/看门狗挂载点）。 */
  onChunk?: (text: string) => void;
}

export interface ProcessSinkStatus {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  startError?: string;
  durationMs: number;
  /** diskCap 命中（或无落盘文件时溢出被丢弃）。 */
  truncated: boolean;
  headBuffer: string;
  totalChars: number;
  outputFilePath?: string;
}

export interface ProcessSinkHandle {
  pid?: number;
  /** 进程是否已终态（close / start error / 强制击杀）。 */
  readonly settled: boolean;
  /** 终态 promise。不含超时逻辑——等多久、要不要杀由调用方决定。 */
  wait: Promise<ProcessSinkStatus>;
  /** 进程组 SIGTERM → 宽限 500ms → SIGKILL。幂等。 */
  kill(): void;
  /**
   * 强制创建落盘文件并把已有 headBuffer 刷入（转后台瞬间调用，保证
   * outputFilePath 立即可读）。无 outputFile 配置时返回 undefined。
   */
  ensureOutputFile(): string | undefined;
}

/**
 * 启动 sink 模式子进程并返回句柄：stdout+stderr 合并为一条逻辑输出流，
 * 内存只留前 headBufferCap 字符，溢出流式写盘，写盘达 diskCap 即停写。
 * 不内置超时；`runProcess` 的 streaming 分支与 bash 后台任务都基于它。
 */
export function startProcessSink(options: ProcessSinkOptions): ProcessSinkHandle {
  const startedAt = Date.now();
  const headBufferCap = Math.max(0, options.headBufferCap ?? 4000);
  const diskCap = Math.max(0, options.diskCap ?? 5 * 1024 * 1024);
  const outputFile = options.outputFile;

  let headBuffer = "";
  let totalChars = 0;
  let fileBytesWritten = 0;
  let fileStream: WriteStream | undefined;
  let fileCreated = false;
  let settled = false;
  let truncated = false; // diskCap 命中
  let killTimer: ReturnType<typeof setTimeout> | undefined;

  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  let resolveWait: (status: ProcessSinkStatus) => void;
  const wait = new Promise<ProcessSinkStatus>((resolve) => {
    resolveWait = resolve;
  });

  const ensureFile = (): WriteStream | undefined => {
    if (fileCreated) return fileStream;
    fileCreated = true;
    // 无 outputFile（如测试/mock 无 tmpRoot）：不落盘，溢出丢弃并标记 truncated
    if (!outputFile) {
      truncated = true;
      return undefined;
    }
    try {
      mkdirSync(dirname(outputFile), { recursive: true });
      fileStream = createWriteStream(outputFile, { encoding: "utf8" });
      // file 创建瞬间先把已收集的 headBuffer 落盘，保证文件是完整原文
      fileStream.write(headBuffer);
      fileBytesWritten += headBuffer.length;
    } catch {
      // 落盘失败：降级为「只保留 headBuffer + 标记 truncated」，不阻塞命令
      fileStream = undefined;
      truncated = true;
    }
    return fileStream;
  };

  const kill = (): void => {
    if (settled) return;
    signalChild(child, "SIGTERM");
    if (killTimer) return;
    killTimer = setTimeout(() => {
      signalChild(child, "SIGKILL");
      settle(null, "SIGKILL");
    }, TIMEOUT_KILL_GRACE_MS);
  };

  const writeToFile = (text: string): void => {
    if (!text) return;
    const stream = ensureFile();
    if (!stream) return;
    if (truncated) return;
    const room = diskCap - fileBytesWritten;
    if (room <= 0) {
      truncated = true;
      if (options.killOnDiskCap) kill();
      return;
    }
    const slice = text.length > room ? text.slice(0, room) : text;
    stream.write(slice);
    fileBytesWritten += slice.length;
    if (slice.length < text.length) {
      truncated = true;
      if (options.killOnDiskCap) kill();
    }
  };

  const handleChunk = (chunk: Buffer): void => {
    if (settled) return;
    const text = chunk.toString("utf8");
    totalChars += text.length;

    let overflowStart = 0;
    if (headBuffer.length < headBufferCap) {
      const take = Math.min(headBufferCap - headBuffer.length, text.length);
      headBuffer += text.slice(0, take);
      overflowStart = take;
    }

    const overflow = text.slice(overflowStart);
    if (overflow.length > 0) {
      writeToFile(overflow);
    }
    options.onChunk?.(text);
  };

  const settle = (exitCode: number | null, signal: NodeJS.Signals | null, startError?: string) => {
    if (settled) return;
    settled = true;
    if (killTimer) clearTimeout(killTimer);
    const outputFilePath = fileCreated && fileStream ? outputFile : undefined;
    const done = () => {
      resolveWait({
        exitCode,
        signal,
        startError,
        durationMs: Date.now() - startedAt,
        truncated,
        headBuffer,
        totalChars,
        outputFilePath,
      });
    };
    if (fileStream) {
      fileStream.end(done);
    } else {
      done();
    }
  };

  child.stdout.on("data", handleChunk);
  child.stderr.on("data", handleChunk);
  child.on("error", (err) => settle(null, null, err.message));
  child.on("close", (exitCode, signal) => settle(exitCode, signal));

  return {
    pid: child.pid,
    get settled() {
      return settled;
    },
    wait,
    kill,
    ensureOutputFile: () => {
      const stream = ensureFile();
      return stream ? outputFile : undefined;
    },
  };
}

/**
 * 流式落盘模式：基于 startProcessSink，附加「超时杀进程」语义。
 * ripgrep 等内部调用沿用；bash 前台等待请直接用 startProcessSink（超时转后台）。
 */
async function runProcessStreaming(
  options: RunProcessOptions,
  outputFile: string | undefined,
): Promise<RunProcessResult> {
  let timedOut = false;

  const handle = startProcessSink({
    command: options.command,
    args: options.args,
    cwd: options.cwd,
    env: options.env,
    outputFile,
    headBufferCap: options.headBufferCap,
    diskCap: options.diskCap,
  });

  const timer = setTimeout(() => {
    timedOut = true;
    handle.kill();
  }, options.timeoutMs);

  const status = await handle.wait;
  clearTimeout(timer);

  return {
    command: options.command,
    args: [...options.args],
    cwd: options.cwd,
    // sink 模式：合并输出折叠进 stdout/headBuffer，stderr 不再单独返回
    stdout: status.headBuffer,
    stderr: "",
    exitCode: status.exitCode,
    signal: status.signal,
    durationMs: status.durationMs,
    timedOut,
    truncated: status.truncated,
    startError: status.startError,
    headBuffer: status.headBuffer,
    totalBytes: status.totalChars,
    outputFilePath: status.outputFilePath,
  };
}
