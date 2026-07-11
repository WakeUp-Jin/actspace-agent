import { startProcessSink, type ProcessSinkStatus } from "../../subprocess/run-process";
import type { ToolResult } from "../../../internal-tools";
import { DEFAULT_COMPRESSION_CONFIG } from "../../../context/types";
import { buildToolOutputPath, createToolOutputId } from "../../tool-output-paths";
import { DEFAULT_BASH_BLOCK_MS, MAX_BASH_BLOCK_MS, MIN_BASH_BLOCK_MS } from "./permissions";
import { bashTaskRegistry } from "./task-registry";
import {
  TaskOutputMonitor,
  MIN_SUBSCRIPTION_DEBOUNCE_MS,
  MAX_SUBSCRIPTION_PATTERN_LENGTH,
  type OutputSubscriptionSpec,
} from "./output-monitor";
import {
  buildSandboxSpawn,
  findSandboxViolationEvidence,
  formatSandboxViolationHint,
  probeSandbox,
} from "./sandbox";

export interface BashResult {
  command: string;
  cwd: string;
  /** 合并输出（stdout+stderr）的头部，≤ inlineThreshold。回填给模型的就是它。 */
  output: string;
  /** 合并输出的总字符数（反映真实规模，可能远大于 output.length）。 */
  totalChars: number;
  exitCode: number | null;
  durationMs: number;
  permissionStatus: "allowed";
  riskReason?: string;
  /** 命中磁盘硬上限（diskCap），末尾部分被丢弃。 */
  truncated: boolean;
  /** 输出超过 inlineThreshold，模型只看到头部（完整原文在 stdoutFilePath）。 */
  outputTruncated: boolean;
  /** 大输出落盘文件的绝对路径（仅 outputTruncated 且 tmpRoot 可用时）。 */
  stdoutFilePath?: string;
  /** 本次是否在沙盒内执行（前端标签 + 模型归因用）。 */
  sandboxed: boolean;
  /** 沙盒内失败且输出命中拦截特征时的归因标注 + 升级引导。 */
  sandboxViolationHint?: string;
}

/** blockMs 到点（或 blockMs=0）转后台时的返回结构。进程继续运行，不存在超时失败。 */
export interface BashBackgroundedResult {
  command: string;
  cwd: string;
  status: "backgrounded";
  taskId: string;
  /** 立即可读的落盘输出路径（无 tmpRoot 时缺省）。 */
  outputFilePath?: string;
  reason: "explicit" | "block_timeout";
  /** 本次是否在沙盒内执行。 */
  sandboxed: boolean;
  hint: string;
}

/** bash executor 的落盘与阈值配置，由 createBashTool 经闭包注入。 */
export interface BashExecutorConfig {
  /** 大输出落盘根目录（通常 <userData>/tmp）。缺省则不落盘，仅头部截断。 */
  tmpRoot?: string;
  /** 当前会话 id，用于落盘文件分目录 + 后台任务归属。 */
  sessionId?: string;
  /** 落盘/头部阈值（字符），默认 4000。 */
  inlineThreshold?: number;
  /** 流式写盘硬上限（字符），默认 5MB。 */
  diskCap?: number;
  /**
   * 沙盒优先执行开关（生产链路 createBashTool 传 true，直接调 executor 的
   * 测试默认 false）。true 时仍需运行时探测通过才真正沙盒。
   */
  sandbox?: boolean;
  /** 敏感禁读清单覆盖（沙盒集成测试注入临时替身用）。 */
  sandboxSensitivePaths?: string[];
}

function sanitizeBlockMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_BASH_BLOCK_MS;
  if (value === 0) return 0;
  return Math.min(MAX_BASH_BLOCK_MS, Math.max(MIN_BASH_BLOCK_MS, Math.trunc(value)));
}

/** 解析并校验 notifyOnOutput 参数；非法时返回错误消息字符串。 */
function parseNotifyOnOutput(value: unknown): OutputSubscriptionSpec | string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") return "notifyOnOutput must be an object { pattern, reason, debounceMs? }";
  const spec = value as { pattern?: unknown; reason?: unknown; debounceMs?: unknown };
  if (typeof spec.pattern !== "string" || !spec.pattern) {
    return "notifyOnOutput.pattern is required and must be a non-empty string";
  }
  if (spec.pattern.length > MAX_SUBSCRIPTION_PATTERN_LENGTH) {
    return `notifyOnOutput.pattern is too long (max ${MAX_SUBSCRIPTION_PATTERN_LENGTH} chars)`;
  }
  try {
    new RegExp(spec.pattern);
  } catch (error) {
    return `notifyOnOutput.pattern is not a valid regex: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (typeof spec.reason !== "string" || !spec.reason.trim()) {
    return "notifyOnOutput.reason is required (a short phrase describing what you are waiting for)";
  }
  const debounceMs =
    typeof spec.debounceMs === "number" && Number.isFinite(spec.debounceMs)
      ? Math.max(MIN_SUBSCRIPTION_DEBOUNCE_MS, Math.trunc(spec.debounceMs))
      : MIN_SUBSCRIPTION_DEBOUNCE_MS;
  return { pattern: spec.pattern, reason: spec.reason.trim(), debounceMs };
}

function imageContentFromDataUrl(output: string): { type: "image"; data: string; mimeType: string } | undefined {
  const trimmed = output.trim();
  const match = trimmed.match(/^data:(image\/(?:png|jpeg|jpg|gif|webp|bmp));base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match?.[1] || !match[2]) return undefined;
  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  return {
    type: "image",
    data: match[2].replace(/\s/g, ""),
    mimeType,
  };
}

function buildForegroundResult(
  command: string,
  cwd: string,
  status: ProcessSinkStatus,
  sandboxed: boolean,
): ToolResult {
  const outputTruncated = status.totalChars > status.headBuffer.length;
  const imageContent = !outputTruncated && status.exitCode === 0
    ? imageContentFromDataUrl(status.headBuffer)
    : undefined;
  const result: BashResult = {
    command,
    cwd,
    output: status.headBuffer,
    totalChars: status.totalChars,
    exitCode: status.exitCode,
    durationMs: status.durationMs,
    permissionStatus: "allowed",
    truncated: status.truncated,
    outputTruncated,
    stdoutFilePath: status.outputFilePath,
    sandboxed,
  };

  // 大输出落盘时给出 file ref，供 bridge 填 rawOutputRef、前端「查看完整输出」。
  const outputRef = status.outputFilePath
    ? ({ kind: "file", value: status.outputFilePath } as const)
    : undefined;

  if (status.exitCode !== 0) {
    // 沙盒内失败：扫描输出中的拦截特征做归因标注，防止模型在错误方向重试
    if (sandboxed) {
      const evidence = findSandboxViolationEvidence(status.headBuffer);
      if (evidence) {
        result.sandboxViolationHint = formatSandboxViolationHint(evidence);
      }
    }
    return { success: false, data: result, error: `Bash command exited with code ${status.exitCode}`, outputRef };
  }

  if (!imageContent) {
    return { success: true, data: result, outputRef };
  }

  return {
    success: true,
    data: result,
    content: [
      { type: "text", text: `Bash produced an image data URL (${imageContent.mimeType}).` },
      imageContent,
    ],
    outputRef,
  };
}

export const bashExecutor = async (
  args: Record<string, unknown>,
  workspaceRoot: string,
  config: BashExecutorConfig = {},
): Promise<ToolResult> => {
  const command = typeof args.command === "string" ? args.command : "";
  const cwd = typeof args.cwd === "string" ? args.cwd : workspaceRoot;
  const blockMs = sanitizeBlockMs(args.blockMs);
  const intent = typeof args.intent === "string" && args.intent.trim() ? args.intent.trim() : undefined;

  if (!command) {
    return { success: false, error: "command is required" };
  }

  const subscription = parseNotifyOnOutput(args.notifyOnOutput);
  if (typeof subscription === "string") {
    return { success: false, error: subscription };
  }

  const inlineThreshold = config.inlineThreshold ?? DEFAULT_COMPRESSION_CONFIG.bashInlineThreshold;
  const diskCap = config.diskCap ?? DEFAULT_COMPRESSION_CONFIG.bashDiskCap;
  const outputFile = config.tmpRoot
    ? buildToolOutputPath({
        tmpRoot: config.tmpRoot,
        sessionId: config.sessionId,
        uniqueId: createToolOutputId(),
      })
    : undefined;

  // 沙盒优先：生产链路（config.sandbox=true）+ 运行时探测通过 + 未获批真实环境。
  // requiredPermissions 到达 executor 说明升级审批已在权限层通过（scheduler
  // 只有 ask 批准后才透传 sanitizedArgs），直接走真实环境。
  const requiredPermissions = Array.isArray(args.requiredPermissions)
    ? args.requiredPermissions.filter((item): item is string => typeof item === "string")
    : [];
  const wantsRealEnv = requiredPermissions.includes("no_sandbox");
  let spawnSpec: { command: string; args: string[]; env?: NodeJS.ProcessEnv } = {
    command: "bash",
    args: ["-lc", command],
  };
  let sandboxed = false;
  if (config.sandbox === true && !wantsRealEnv && (await probeSandbox())) {
    try {
      const sandboxSpawn = await buildSandboxSpawn({
        command,
        workspaceRoot,
        tmpRoot: config.tmpRoot,
        sessionId: config.sessionId,
        sensitiveReadDenyPaths: config.sandboxSensitivePaths,
      });
      spawnSpec = sandboxSpawn;
      sandboxed = true;
    } catch {
      // profile 写盘失败等基础设施故障：降级真实环境，sandboxed 如实为 false
    }
  }

  // 输出监控（订阅匹配 + 卡死看门狗）从进程启动就挂 onChunk，转后台时才 attach 投递
  const monitor = new TaskOutputMonitor({ subscription: subscription ?? undefined });

  const handle = startProcessSink({
    command: spawnSpec.command,
    args: spawnSpec.args,
    env: spawnSpec.env,
    cwd,
    outputFile,
    headBufferCap: inlineThreshold,
    diskCap,
    // 后台常驻进程输出无上界，diskCap 命中即终止（磁盘看门狗）
    killOnDiskCap: true,
    onChunk: monitor.handleChunk,
  });

  // 前台等待：blockMs 内退出按前台返回；到点（或 blockMs=0）转后台。
  const settledInTime = await Promise.race([
    handle.wait.then(() => true),
    new Promise<false>((resolve) => {
      if (blockMs === 0) {
        // 立即后台：让出一个宏任务，给「瞬间失败」（如 start error）一次直接返回的机会
        setImmediate(() => resolve(false));
        return;
      }
      const timer = setTimeout(() => resolve(false), blockMs);
      // 进程先退出时释放定时器
      void handle.wait.then(() => clearTimeout(timer));
    }),
  ]);

  // 竞态处理：转后台瞬间进程恰好退出 → 按前台结果返回，不产生 taskId 和通知
  if (settledInTime || handle.settled) {
    monitor.dispose();
    const status = await handle.wait;
    if (status.startError) {
      return {
        success: false,
        error:
          `Failed to start Bash command (command: ${command}, cwd: ${cwd}): ${status.startError}. ` +
          `Check that the cwd exists and the command is available.`,
      };
    }
    return buildForegroundResult(command, cwd, status, sandboxed);
  }

  // 转后台：强制创建落盘文件（含已有 headBuffer），保证 outputFilePath 立即可读
  const outputFilePath = handle.ensureOutputFile();
  const task = bashTaskRegistry.register({
    sessionId: config.sessionId ?? "default",
    command,
    intent,
    cwd,
    handle,
    outputFilePath,
    monitor,
    subscriptionReason: subscription?.reason,
    sandboxed,
  });

  const data: BashBackgroundedResult = {
    command,
    cwd,
    status: "backgrounded",
    taskId: task.taskId,
    outputFilePath,
    reason: blockMs === 0 ? "explicit" : "block_timeout",
    sandboxed,
    hint:
      "The command is still running in the background. You will receive a <task_notification> when it finishes. " +
      "To check progress, call bash_output with this taskId (or read the output file). " +
      "To stop it, call bash_kill. Do NOT poll with sleep loops.",
  };

  return { success: true, data };
};
