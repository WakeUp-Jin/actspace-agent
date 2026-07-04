/**
 * 沙盒违规标注（输出模式匹配一条腿）
 *
 * 被沙盒拒绝的系统调用返回 EPERM，很多程序会把它包装成误导性错误
 * （"认证失败"、"daemon 没启动"）。这里对命令输出做特征模式匹配，命中时
 * 生成明确的归因标注，让模型分清「命令本身错了」和「被沙盒拦了」。
 *
 * 精确归因的 `log stream` 监听（按 Seatbelt `with message` tag 过滤）
 * 记录在 tech-debt，本期不做。
 */

const VIOLATION_PATTERNS: RegExp[] = [
  /operation not permitted/i,
  /\bEPERM\b/,
  /read-only file system/i,
  /\bsandbox\b.*\bdeny\b/i,
];

/**
 * 在命令输出中查找沙盒拦截痕迹。命中返回第一条证据行（截断到 200 字符），
 * 未命中返回 undefined。仅对确认在沙盒内执行且失败的命令调用。
 */
export function findSandboxViolationEvidence(output: string): string | undefined {
  for (const line of output.split("\n")) {
    for (const pattern of VIOLATION_PATTERNS) {
      if (pattern.test(line)) {
        const trimmed = line.trim();
        return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
      }
    }
  }
  return undefined;
}

/** 生成回填给模型的违规标注文本。 */
export function formatSandboxViolationHint(evidenceLine: string): string {
  return (
    `[sandbox] This command likely failed due to sandbox restrictions (evidence: "${evidenceLine}"). ` +
    `The sandbox only allows writes inside the workspace and temp directories, and denies reads of sensitive paths (~/.ssh etc.). ` +
    `If the command genuinely needs the real environment, retry with requiredPermissions: ["no_sandbox"] ` +
    `and put the evidence in intent — this will ask the user for approval. ` +
    `If the failure is unrelated to the sandbox (wrong path, missing dependency), fix the command instead.`
  );
}
