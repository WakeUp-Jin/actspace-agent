import type { PermissionResult } from "../../../internal-tools";
import { guardWorkspacePath } from "../../workspace-guard";
import { env } from "../../../env";

/** blockMs：前台最长等待（到点转后台，不杀进程）。0 = 立即后台。 */
export const DEFAULT_BASH_BLOCK_MS = 30_000;
export const MIN_BASH_BLOCK_MS = 1_000;
export const MAX_BASH_BLOCK_MS = 600_000;

interface NormalizedBashArgs {
  command: string;
  cwd: string;
  blockMs: number;
}

const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const UNICODE_WHITESPACE_RE = /[\u00A0\u1680\u180E\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/;
const SIMPLE_SEGMENT_SPLIT_RE = /\s*(?:&&|;)\s*/;
const UNSUPPORTED_SHELL_SYNTAX_RE = /[|<>`$(){}]/;
const EVAL_LIKE_COMMANDS = new Set(["eval", "source", ".", "exec", "builtin", "fc", "trap"]);
const DELETE_COMMANDS = new Set(["rm", "rmdir"]);

export function createBashPermissionChecker(workspaceRoot: string) {
  return async (args: Record<string, unknown>): Promise<PermissionResult> => {
    return bashCheckPermissions(args, workspaceRoot);
  };
}

export async function bashCheckPermissions(
  args: Record<string, unknown>,
  workspaceRoot: string,
): Promise<PermissionResult> {
  const normalized = normalizeArgs(args, workspaceRoot);
  if (isPermissionResult(normalized)) {
    return normalized;
  }

  const hardReject = getHardRejectReason(normalized.command);
  if (hardReject) {
    return {
      decision: "deny",
      reason: hardReject,
      summary: summarizeCommand(normalized.command),
      riskLevel: "high",
    };
  }

  const segments = splitCommandSegments(normalized.command);
  if (!segments.length) {
    return deny("Command is empty", normalized.command);
  }

  for (const segment of segments) {
    const segmentReject = getSegmentRejectReason(segment);
    if (segmentReject) {
      return {
        decision: "deny",
        reason: segmentReject,
        summary: summarizeCommand(normalized.command),
        riskLevel: "high",
      };
    }
  }

  const policy = classifyCommand(segments);
  return {
    decision: policy.decision,
    reason: policy.reason,
    summary: summarizeCommand(normalized.command),
    riskLevel: policy.riskLevel,
    // intent / notifyOnOutput 是透传字段，不参与归一化：intent 供展示，
    // notifyOnOutput 的结构校验在 executor 层做
    sanitizedArgs: {
      ...normalized,
      ...(typeof args.intent === "string" && args.intent.trim() ? { intent: args.intent.trim() } : {}),
      ...(args.notifyOnOutput !== undefined ? { notifyOnOutput: args.notifyOnOutput } : {}),
    },
  };
}

function isPermissionResult(value: NormalizedBashArgs | PermissionResult): value is PermissionResult {
  return "decision" in value;
}

function normalizeArgs(
  args: Record<string, unknown>,
  workspaceRoot: string,
): NormalizedBashArgs | PermissionResult {
  const command = typeof args.command === "string" ? args.command.trim() : "";
  if (!command) {
    return deny("command is required", command);
  }

  const cwdArg = typeof args.cwd === "string" && args.cwd.trim() ? args.cwd : workspaceRoot;
  const cwdGuard = guardWorkspacePath(cwdArg, workspaceRoot);
  if (!cwdGuard.ok) {
    return {
      decision: "deny",
      reason: cwdGuard.error ?? "cwd escapes workspace boundary",
      summary: summarizeCommand(command),
      riskLevel: "high",
    };
  }

  return {
    command,
    cwd: cwdGuard.resolvedPath,
    blockMs: sanitizeBlockMs(args.blockMs),
  };
}

function sanitizeBlockMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_BASH_BLOCK_MS;
  }
  // 0 = 显式立即后台（dev server / watcher 等常驻进程）
  if (value === 0) return 0;

  return Math.min(MAX_BASH_BLOCK_MS, Math.max(MIN_BASH_BLOCK_MS, Math.trunc(value)));
}

function getHardRejectReason(command: string): string | undefined {
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

function splitCommandSegments(command: string): string[] {
  return command
    .split(SIMPLE_SEGMENT_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getSegmentRejectReason(segment: string): string | undefined {
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

  return undefined;
}

function getFirstToken(segment: string): string {
  return segment.trim().split(/\s+/)[0] ?? "";
}

function isDangerousDelete(segment: string): boolean {
  const tokens = segment.split(/\s+/).slice(1);
  if (!tokens.length) return true;

  return tokens.some((token) => {
    if (token.startsWith("-")) return token.includes("r") || token.includes("f");
    if (token.includes("*")) return true;
    return isCriticalPath(token);
  });
}

function isCriticalPath(token: string): boolean {
  const cleaned = token.replace(/^['"]|['"]$/g, "");
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

function classifyCommand(segments: string[]): {
  decision: PermissionResult["decision"];
  reason?: string;
  riskLevel?: PermissionResult["riskLevel"];
} {
  if (env.ACTSPACE_BASH_ALWAYS_ASK) {
    return {
      decision: "ask",
      reason: `Bash always-ask mode is enabled (ACTSPACE_BASH_ALWAYS_ASK=1)`,
      riskLevel: "low",
    };
  }

  const allAllowed = segments.every(isAllowedDevelopmentCommand);
  if (allAllowed) {
    return { decision: "allow", riskLevel: "low" };
  }

  return {
    decision: "ask",
    reason: `Command is not in the Bash allowlist: ${segments.join(" && ")}`,
    riskLevel: "medium",
  };
}

function isAllowedDevelopmentCommand(segment: string): boolean {
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

function deny(reason: string, command: string): PermissionResult {
  return {
    decision: "deny",
    reason,
    summary: summarizeCommand(command),
    riskLevel: "high",
  };
}

function summarizeCommand(command: string): string {
  const first = getFirstToken(command);
  return first ? `Run Bash command: ${first}` : "Run Bash command";
}
