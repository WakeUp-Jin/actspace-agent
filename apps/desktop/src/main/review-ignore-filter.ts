import type { ReviewGitCommandRunner } from "./review-git-engine";

export type ReviewWatchPathFilter = (input: { workspaceRoot: string; paths: string[] }) => Promise<boolean>;

/**
 * 判断一批 watch 路径里是否有 Review 需要关心的变化：只要有一条不被 Git 忽略就返回 true。
 * `git check-ignore` 默认查 index，已跟踪的文件即使匹配忽略规则也不会被报成 ignored。
 * 任何拿不准的情况（非仓库、子模块、超时、输出截断）都按「有变化」处理，宁可多刷新一次也不漏掉改动。
 */
export function createReviewIgnoredPathFilter(runner: ReviewGitCommandRunner): ReviewWatchPathFilter {
  return async ({ workspaceRoot, paths }) => {
    if (paths.length === 0) return false;
    const input = paths.join("\0") + "\0";
    const result = await runner(["check-ignore", "-z", "--stdin"], {
      cwd: workspaceRoot,
      timeoutMs: 5_000,
      maxOutputChars: input.length + 1024,
      input,
    });
    // 退出码 1 表示没有任何路径被忽略。
    if (result.exitCode === 1) return true;
    if (result.exitCode !== 0 || result.timedOut || result.truncated || result.startError) return true;
    const ignored = new Set(result.stdout.split("\0").filter(Boolean));
    return paths.some((path) => !ignored.has(path));
  };
}
