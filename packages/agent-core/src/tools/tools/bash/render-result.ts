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

  if (data.stdout) {
    lines.push("", "stdout:", data.stdout.trimEnd());
  }

  if (data.stderr) {
    lines.push("", "stderr:", data.stderr.trimEnd());
  }

  if (data.truncated) {
    lines.push("", "[Bash output truncated before returning to the model]");
  }

  if (!result.success && result.error) {
    lines.push("", `error: ${result.error}`);
  }

  return lines.join("\n");
}
