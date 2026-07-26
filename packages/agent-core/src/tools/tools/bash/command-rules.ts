import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * bash 文本层规则分级表（单一事实源）
 *
 * 三级语义（docs/design-docs/execution-safety/agent-bash工具设计文档.md「权限层与沙盒的关系」）：
 *
 * 1. **hard reject（deny）**：不存在正当场景，任何环境、任何审批都不跑。
 *    准入标准苛刻——一旦列入，用户批准也救不回，所以只放「永远不该发生」的。
 * 2. **不可逆 ask**：有正当场景（用户可能真的要丢弃改动/删文件），但出错后
 *    没有回滚路径（删 untracked、摧毁 git 兜底本身）。沙盒管不住 workspace
 *    内部，所以这一级**沙盒放宽不豁免**，永远问人，且逐条评估（allowSimilar 关）。
 * 3. **allowlist（allow）**：无沙盒环境下免审的开发命令白名单。
 *
 * 其余命令：沙盒可用 → 自动跑（沙盒兜底爆炸半径）；沙盒不可用 → ask。
 *
 * 可信度前提：不支持的 shell 语法（| < > ` $ () {}）在 hard reject 一级整体
 * 拒绝，变量展开和子 shell 不存在，所以下面的 token 级文本匹配所见即所得，
 * 不会被 `rm $DIR`、`$(cmd)` 之类绕过。
 */

// ─── 一级：hard reject ───

const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const UNICODE_WHITESPACE_RE = /[\u00A0\u1680\u180E\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/;
const UNSUPPORTED_SHELL_SYNTAX_RE = /[|<>`$(){}]/;
const EVAL_LIKE_COMMANDS = new Set(["eval", "source", ".", "exec", "builtin", "fc", "trap"]);
const DELETE_COMMANDS = new Set(["rm", "rmdir"]);
const SHELL_GLOB_RE = /[*?\[]/;

/** 整条命令级 hard reject（不依赖分段）。 */
export function getCommandHardRejectReason(command: string): string | undefined {
  if (CONTROL_CHARS_RE.test(command)) {
    return "Command contains control characters";
  }
  if (UNICODE_WHITESPACE_RE.test(command)) {
    return "Command contains unsupported Unicode whitespace";
  }
  if (UNSUPPORTED_SHELL_SYNTAX_RE.test(command)) {
    return "Command uses unsupported shell syntax and cannot be safely classified";
  }
  return undefined;
}

/** 段级 hard reject。 */
export function getSegmentHardRejectReason(segment: string): string | undefined {
  const first = getFirstToken(segment);
  if (!first) {
    return "Command segment is empty";
  }

  if (EVAL_LIKE_COMMANDS.has(first)) {
    return `Command uses blocked shell builtin: ${first}`;
  }

  if (DELETE_COMMANDS.has(first) && isDangerousDelete(segment)) {
    return "Command contains dangerous delete operation";
  }

  // 删除/移动 .git 本体 = 摧毁整个回滚能力的根，没有正当场景
  if (targetsGitDirectory(segment)) {
    return "Command deletes or moves the .git directory itself, which would destroy the repository history";
  }

  return undefined;
}

function isDangerousDelete(segment: string): boolean {
  const tokens = tokenizeSimpleShellSegment(segment);
  if (!tokens || tokens.length < 2) return true;

  return getCommandTargets(tokens).some((token) => {
    if (SHELL_GLOB_RE.test(token)) return true;
    return isCriticalPath(token);
  });
}

/**
 * Bash 可以承担目录删除，但只有明确位于 workspace 内部的目标才能进入 ask。
 * workspace 根、越界路径、glob 和 .git 树仍然 hard reject。
 */
export function getDeleteBoundaryHardRejectReason(
  segment: string,
  cwd: string,
  workspaceRoot: string,
): string | undefined {
  const tokens = tokenizeSimpleShellSegment(segment);
  if (!tokens) return "Delete command arguments cannot be safely parsed";
  if (!DELETE_COMMANDS.has(tokens[0] ?? "")) return undefined;

  const targets = getCommandTargets(tokens);
  if (targets.length === 0) return "Delete command has no explicit target";

  for (const target of targets) {
    if (SHELL_GLOB_RE.test(target)) return "Delete command uses a glob target";

    const resolvedTarget = resolve(cwd, target);
    const relativeTarget = relative(workspaceRoot, resolvedTarget);
    if (relativeTarget === "") return "Delete command targets the workspace root";
    if (relativeTarget === ".." || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
      return "Delete command target escapes the workspace boundary";
    }

    const pathParts = relativeTarget.split(/[\\/]+/).filter(Boolean);
    if (pathParts.includes(".git")) return "Delete command targets the .git directory tree";
  }

  return undefined;
}

function isCriticalPath(token: string): boolean {
  const cleaned = stripQuotes(token);
  return cleaned === "/" ||
    cleaned === "~" ||
    cleaned === "$HOME" ||
    cleaned === "/tmp" ||
    cleaned === "/var" ||
    cleaned === "/usr" ||
    cleaned === "/bin" ||
    cleaned === "/sbin" ||
    cleaned === "/etc" ||
    cleaned === "/Applications" ||
    /^\/Users\/[^/]+$/.test(cleaned);
}

function targetsGitDirectory(segment: string): boolean {
  const tokens = tokenizeSimpleShellSegment(segment);
  if (!tokens) return false;
  const first = tokens[0];
  if (first !== "rm" && first !== "rmdir" && first !== "mv") return false;
  return tokens.slice(1).some((token) => {
    const cleaned = stripQuotes(token).replace(/\/+$/, "");
    return cleaned === ".git" || cleaned.endsWith("/.git");
  });
}

// ─── 二级：不可逆 ask（沙盒放宽不豁免） ───

/**
 * 段命中不可逆操作时返回给审批卡片/模型的说明；未命中返回 undefined。
 *
 * 判据：沙盒管不住（伤害在 workspace 内）且没有回滚路径。写/编辑文件不在此
 * 列——git 提供了逆操作（diff / revert），这也是 write_file 工具本身 allow
 * 的原因；而删除 untracked、丢弃未提交改动，摧毁的恰恰是回滚路径本身。
 */
export function getIrreversibleAskReason(segment: string): string | undefined {
  const tokens = segment.trim().split(/\s+/);
  const first = tokens[0] ?? "";

  // 删除文件：untracked 文件删了无法恢复；与 delete_file 工具的永远 ask 对齐，
  // 否则 bash rm 成为绕过 delete_file 审批的后门
  if (first === "rm" || first === "rmdir") {
    return "Deleting files is irreversible (untracked files cannot be recovered)";
  }

  // rm 的等价旁路
  if (first === "find" && tokens.includes("-delete")) {
    return "find -delete removes files irreversibly (equivalent to rm)";
  }

  // 覆写/擦除类冷门命令：低频、破坏性明确
  if (first === "dd" || first === "shred" || first === "truncate") {
    return `${first} overwrites or truncates data irreversibly`;
  }

  if (first === "git") {
    return getGitIrreversibleReason(tokens);
  }

  return undefined;
}

/**
 * git 丢弃类子命令：这些命令摧毁的恰恰是「git 可回滚」这个兜底本身，
 * 比 rm 更需要确认。分支/commit 级操作（branch -D、rebase 等）reflog 可恢复，
 * 刻意不列，保持清单短。
 */
function getGitIrreversibleReason(tokens: string[]): string | undefined {
  const sub = tokens[1] ?? "";

  // git reset --hard / --merge：丢弃工作区与暂存区未提交改动
  if (sub === "reset" && tokens.some((t) => t === "--hard" || t === "--merge")) {
    return "git reset --hard/--merge discards uncommitted changes irreversibly";
  }

  // git clean：删除 untracked 文件（-n dry-run 除外）
  if (sub === "clean" && !tokens.some((t) => t === "-n" || t === "--dry-run")) {
    return "git clean deletes untracked files irreversibly";
  }

  // git restore：默认丢弃工作区改动（--staged-only 的区分不做，保持规则简单，
  // restore 在 agent 工作流里低频，宁可多问一次）
  if (sub === "restore") {
    return "git restore discards working tree changes irreversibly";
  }

  // git checkout 的丢弃形态：`--` 显式路径模式、`.` 全量丢弃、多参数的
  // pathspec 歧义形态（git checkout HEAD file 会丢弃 file 的改动）。
  // 单参数的分支切换（git checkout main / -b feat）是安全高频操作，放行。
  if (sub === "checkout") {
    const hasBranchCreateFlag = tokens.some((t) => t === "-b" || t === "-B");
    if (!hasBranchCreateFlag) {
      const args = tokens.slice(2).filter((t) => !t.startsWith("-") || t === "--" || t === "-");
      const hasPathDiscardMarker = args.some(
        (t) => t === "--" || t === "." || stripQuotes(t).startsWith("./"),
      );
      if (hasPathDiscardMarker || args.length >= 2) {
        return "git checkout with pathspec discards working tree changes irreversibly";
      }
    }
  }

  // git stash drop / clear：丢弃 stash 内容
  if (sub === "stash" && (tokens[2] === "drop" || tokens[2] === "clear")) {
    return "git stash drop/clear discards stashed changes irreversibly";
  }

  // 强推：改写远端历史，本地无法回滚；第一期沙盒网络放行，只有文本层能管
  if (sub === "push" && tokens.some((t) => t === "-f" || t === "--force" || t.startsWith("--force-with-lease"))) {
    return "git push --force rewrites remote history, which cannot be undone locally";
  }

  return undefined;
}

// ─── 三级：allowlist（无沙盒环境的免审白名单） ───

export function isAllowedDevelopmentCommand(segment: string): boolean {
  const normalized = segment.trim().replace(/\s+/g, " ");
  if (normalized === "pwd") return true;
  if (normalized === "ls" || normalized.startsWith("ls ")) return true;
  if (normalized === "git status" || normalized.startsWith("git status ")) return true;
  if (normalized === "git diff" || normalized.startsWith("git diff ")) return true;
  if (normalized === "node --version" || normalized === "node -v") return true;
  if (normalized === "pnpm --version" || normalized === "pnpm -v") return true;
  if (normalized === "pnpm typecheck" || normalized.startsWith("pnpm typecheck ")) return true;
  if (normalized === "pnpm test" || normalized.startsWith("pnpm test ")) return true;
  if (normalized === "pnpm build" || normalized.startsWith("pnpm build ")) return true;
  return false;
}

// ─── 共用小工具 ───

export function getFirstToken(segment: string): string {
  return tokenizeSimpleShellSegment(segment)?.[0] ?? "";
}

function stripQuotes(token: string): string {
  return token.replace(/^['"]|['"]$/g, "");
}

function getCommandTargets(tokens: string[]): string[] {
  const targets: string[] = [];
  let optionsEnded = false;
  for (const token of tokens.slice(1)) {
    if (!optionsEnded && token === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && token.startsWith("-")) continue;
    targets.push(token);
  }
  return targets;
}

/** 解析本工具允许的简单 shell 子集：空白、单双引号与反斜杠转义。 */
function tokenizeSimpleShellSegment(segment: string): string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let quote: "single" | "double" | undefined;
  let escaping = false;

  const pushCurrent = () => {
    if (current.length === 0) return;
    tokens.push(current);
    current = "";
  };

  for (const char of segment.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "single") {
      escaping = true;
      continue;
    }
    if (char === "'" && quote !== "double") {
      quote = quote === "single" ? undefined : "single";
      continue;
    }
    if (char === '"' && quote !== "single") {
      quote = quote === "double" ? undefined : "double";
      continue;
    }
    if (/\s/.test(char) && quote === undefined) {
      pushCurrent();
      continue;
    }
    current += char;
  }

  if (escaping || quote !== undefined) return undefined;
  pushCurrent();
  return tokens;
}
