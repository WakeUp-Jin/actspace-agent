import type { ToolResult } from "../../../internal-tools";
import type { BashResult } from "./executor";

export function renderBashResult(result: ToolResult): string {
  const data = result.data as BashResult | undefined;
  if (!data) {
    return result.error ?? "Bash command failed without structured output.";
  }

  const lines = [
    `$ ${data.command}`,
    `cwd: ${data.cwd}`,
    `exitCode: ${data.exitCode}`,
    `durationMs: ${data.durationMs}`,
  ];

  if (data.timedOut) {
    lines.push("timedOut: true");
  }

  const output = data.output.trimEnd();
  if (output) {
    lines.push("", "output:", output);
  }

  // 输出超过头部阈值：逐字头部 + 截断标记 + 文件路径（不调 flash 摘要）。
  if (data.outputTruncated) {
    const recovery = data.stdoutFilePath
      ? `完整原文见 ${data.stdoutFilePath}，可用 read_file 读取`
      : "完整原文未落盘（超出内存头部即被丢弃，可缩小输出后重跑）";
    lines.push(
      "",
      `[输出截断：显示前 ${data.output.length}/共 ${data.totalChars} 字符，${recovery}]`,
    );
  }

  // 命中磁盘硬上限：连落盘文件也被截断。
  if (data.truncated) {
    lines.push("", "[输出已达磁盘上限，末尾部分被丢弃]");
  }

  if (!result.success && result.error) {
    lines.push("", `error: ${result.error}`);
  }

  return lines.join("\n");
}
