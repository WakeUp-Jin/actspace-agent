// Bash 审批卡的极简 shell 着色：只区分每段命令的命令名、连接符、参数和引号字符串。
// 不做完整的 shell 解析；切分失败时整段按普通文本显示，不影响审批内容的完整性。

export type ShellTokenKind = "command" | "operator" | "flag" | "string" | "text";
export type ShellToken = { readonly text: string; readonly kind: ShellTokenKind };

const SHELL_SPLIT_PATTERN = /(\s+|&&|\|\||[|;]|"(?:[^"\\]|\\.)*"|'[^']*')/;
const SHELL_OPERATOR_PATTERN = /^(?:&&|\|\||[|;])$/;
const SHELL_SEGMENT_PATTERN = /&&|\|\||[|;]/;

export function tokenizeShellCommand(command: string): ShellToken[] {
  let expectCommand = true;
  return command.split(SHELL_SPLIT_PATTERN).filter(Boolean).map((text): ShellToken => {
    if (/^\s+$/.test(text)) return { text, kind: "text" };
    if (SHELL_OPERATOR_PATTERN.test(text)) {
      expectCommand = true;
      return { text, kind: "operator" };
    }
    if (expectCommand) {
      expectCommand = false;
      return { text, kind: "command" };
    }
    if (/^["']/.test(text)) return { text, kind: "string" };
    if (text.startsWith("-")) return { text, kind: "flag" };
    return { text, kind: "text" };
  });
}

/** 每段命令的命令名，去重后按出现顺序返回，用于审批卡标题后的摘要（如 `git, tail`）。 */
export function getShellCommandHeads(command: string): string[] {
  const heads = command.split(SHELL_SEGMENT_PATTERN).map((segment) => segment.trim().split(/\s+/)[0]).filter(Boolean);
  return [...new Set(heads)];
}
