import { runProcess } from "../../subprocess/run-process";
import type { ToolResult } from "../../../internal-tools";
import { DEFAULT_COMPRESSION_CONFIG } from "../../../context/types";
import { buildToolOutputPath, createToolOutputId } from "../../tool-output-paths";
import { DEFAULT_BASH_TIMEOUT_MS } from "./permissions";

export interface BashResult {
  command: string;
  cwd: string;
  /** 合并输出（stdout+stderr）的头部，≤ inlineThreshold。回填给模型的就是它。 */
  output: string;
  /** 合并输出的总字符数（反映真实规模，可能远大于 output.length）。 */
  totalChars: number;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  permissionStatus: "allowed";
  riskReason?: string;
  /** 命中磁盘硬上限（diskCap），末尾部分被丢弃。 */
  truncated: boolean;
  /** 输出超过 inlineThreshold，模型只看到头部（完整原文在 stdoutFilePath）。 */
  outputTruncated: boolean;
  /** 大输出落盘文件的绝对路径（仅 outputTruncated 且 tmpRoot 可用时）。 */
  stdoutFilePath?: string;
}

/** bash executor 的落盘与阈值配置，由 createBashTool 经闭包注入。 */
export interface BashExecutorConfig {
  /** 大输出落盘根目录（通常 <userData>/tmp）。缺省则不落盘，仅头部截断。 */
  tmpRoot?: string;
  /** 当前会话 id，用于落盘文件分目录。 */
  sessionId?: string;
  /** 落盘/头部阈值（字符），默认 4000。 */
  inlineThreshold?: number;
  /** 流式写盘硬上限（字符），默认 5MB。 */
  diskCap?: number;
}

export const bashExecutor = async (
  args: Record<string, unknown>,
  workspaceRoot: string,
  config: BashExecutorConfig = {},
): Promise<ToolResult> => {
  const command = typeof args.command === "string" ? args.command : "";
  const cwd = typeof args.cwd === "string" ? args.cwd : workspaceRoot;
  const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : DEFAULT_BASH_TIMEOUT_MS;

  if (!command) {
    return { success: false, error: "command is required" };
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

  const proc = await runProcess({
    command: "bash",
    args: ["-lc", command],
    cwd,
    timeoutMs,
    maxOutputChars: diskCap,
    headBufferCap: inlineThreshold,
    diskCap,
    outputFile,
  });

  if (proc.startError) {
    return { success: false, error: `Failed to start Bash command: ${proc.startError}` };
  }

  const outputTruncated = proc.totalBytes > proc.headBuffer.length;
  const result: BashResult = {
    command,
    cwd,
    output: proc.headBuffer,
    totalChars: proc.totalBytes,
    exitCode: proc.exitCode,
    durationMs: proc.durationMs,
    timedOut: proc.timedOut,
    permissionStatus: "allowed",
    truncated: proc.truncated,
    outputTruncated,
    stdoutFilePath: proc.outputFilePath,
  };

  // 大输出落盘时给出 file ref，供 bridge 填 rawOutputRef、前端「查看完整输出」。
  const outputRef = proc.outputFilePath
    ? ({ kind: "file", value: proc.outputFilePath } as const)
    : undefined;

  if (proc.timedOut) {
    return { success: false, data: result, error: `Bash command timed out after ${timeoutMs}ms`, outputRef };
  }

  if (proc.exitCode !== 0) {
    return { success: false, data: result, error: `Bash command exited with code ${proc.exitCode}`, outputRef };
  }

  return { success: true, data: result, outputRef };
};
