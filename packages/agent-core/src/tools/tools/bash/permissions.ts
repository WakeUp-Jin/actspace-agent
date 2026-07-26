/**
 * bash 权限层编排
 *
 * 规则内容（哪些命令拒/问/放）集中在 ./command-rules.ts；本文件只做决策编排。
 *
 * 决策顺序（docs/design-docs/execution-safety/agent-bash工具设计文档.md「权限层与沙盒的关系」）：
 *
 * ```txt
 * 归一化（command / cwd 边界 / blockMs）
 *   → ① hard reject（deny：任何环境、任何审批都不跑）
 *   → ② requiredPermissions 升级请求（强制 ask，无视一切放宽）
 *   → ③ 不可逆操作（ask：沙盒放宽不豁免，逐条评估）
 *   → ④ ALWAYS_ASK 调试开关（ask）
 *   → ⑤ allowlist 命中（allow）
 *   → ⑥ 沙盒可用放宽（allow：沙盒兜底爆炸半径）
 *   → ⑦ 兜底 ask
 * ```
 */

import type { PermissionResult } from "../../../internal-tools";
import { guardWorkspacePath } from "../../workspace-guard";
import { env } from "../../../env";
import { probeSandbox } from "./sandbox";
import {
  getCommandHardRejectReason,
  getDeleteBoundaryHardRejectReason,
  getSegmentHardRejectReason,
  getIrreversibleAskReason,
  isAllowedDevelopmentCommand,
  getFirstToken,
} from "./command-rules";

/** blockMs：前台最长等待（到点转后台，不杀进程）。0 = 立即后台。 */
export const DEFAULT_BASH_BLOCK_MS = 30_000;
export const MIN_BASH_BLOCK_MS = 1_000;
export const MAX_BASH_BLOCK_MS = 600_000;

/** requiredPermissions 目前只支持真实环境升级；full_network 随网络代理阶段引入。 */
export const SUPPORTED_REQUIRED_PERMISSIONS = ["no_sandbox"] as const;

export interface BashPermissionOptions {
  /** 沙盒可用时权限层放宽：非 allowlist 命令直接沙盒内自动运行。 */
  sandboxAvailable?: boolean;
}

interface NormalizedBashArgs {
  command: string;
  cwd: string;
  blockMs: number;
  intent: string;
}

const SIMPLE_SEGMENT_SPLIT_RE = /\s*(?:&&|;)\s*/;

export function createBashPermissionChecker(workspaceRoot: string) {
  return async (args: Record<string, unknown>): Promise<PermissionResult> => {
    return bashCheckPermissions(args, workspaceRoot, { sandboxAvailable: await probeSandbox() });
  };
}

/** 解析 requiredPermissions；非法时返回错误消息字符串。 */
function parseRequiredPermissions(value: unknown): string[] | string {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return "requiredPermissions must be an array of strings";
  }
  const unknown = value.filter(
    (item) => !(SUPPORTED_REQUIRED_PERMISSIONS as readonly string[]).includes(item),
  );
  if (unknown.length > 0) {
    return `Unknown requiredPermissions: ${unknown.join(", ")} (supported: ${SUPPORTED_REQUIRED_PERMISSIONS.join(", ")})`;
  }
  return value;
}

export async function bashCheckPermissions(
  args: Record<string, unknown>,
  workspaceRoot: string,
  options: BashPermissionOptions = {},
): Promise<PermissionResult> {
  const normalized = normalizeArgs(args, workspaceRoot);
  if (isPermissionResult(normalized)) {
    return normalized;
  }

  // ① hard reject：整条命令级 + 段级
  const hardReject = getCommandHardRejectReason(normalized.command);
  if (hardReject) {
    return deny(hardReject, normalized.command);
  }

  const segments = splitCommandSegments(normalized.command);
  if (!segments.length) {
    return deny("Command is empty", normalized.command);
  }

  for (const segment of segments) {
    const segmentReject = getSegmentHardRejectReason(segment);
    if (segmentReject) {
      return deny(segmentReject, normalized.command);
    }
    const boundaryReject = getDeleteBoundaryHardRejectReason(segment, normalized.cwd, workspaceRoot);
    if (boundaryReject) {
      return deny(boundaryReject, normalized.command);
    }
  }

  const requiredPermissions = parseRequiredPermissions(args.requiredPermissions);
  if (typeof requiredPermissions === "string") {
    return deny(requiredPermissions, normalized.command);
  }

  // notifyOnOutput / requiredPermissions 是透传字段，不参与归一化：
  // intent 已在 normalizeArgs 中校验为必填非空字符串，
  // notifyOnOutput 结构校验在 executor 层做，
  // requiredPermissions 让 executor 知道「已获批真实环境」
  const sanitizedArgs = {
    ...normalized,
    ...(args.notifyOnOutput !== undefined ? { notifyOnOutput: args.notifyOnOutput } : {}),
    ...(requiredPermissions.length > 0 ? { requiredPermissions } : {}),
  };

  // ② 沙盒升级请求：无条件 ask（无视 allowlist 与沙盒放宽）。
  // 逐条评估（allowSimilar: false）：不因上一条豁免过就默认下一条也豁免。
  if (requiredPermissions.includes("no_sandbox")) {
    return {
      decision: "ask",
      reason:
        "Command requests escalation to the real environment (no sandbox). " +
        "The user's previous approvals were given with the sandbox as a backstop; " +
        "running unsandboxed requires fresh approval.",
      summary: summarizeCommand(normalized.command),
      riskLevel: "high",
      allowSimilar: false,
      executionEnvironment: "real",
      sanitizedArgs,
    };
  }

  // ③ 不可逆操作：沙盒管不住 workspace 内部（本来就是可写区），删除 /
  // 丢弃改动没有回滚路径，所以沙盒放宽不豁免这一级，永远问人
  for (const segment of segments) {
    const irreversible = getIrreversibleAskReason(segment);
    if (irreversible) {
      return {
        decision: "ask",
        reason: `Irreversible operation (not exempted by the sandbox): ${irreversible}`,
        summary: summarizeCommand(normalized.command),
        riskLevel: "high",
        allowSimilar: false,
        executionEnvironment: options.sandboxAvailable === true ? "sandbox" : "real",
        sanitizedArgs,
      };
    }
  }

  // ④ 调试开关：全部进审
  if (env.ACTSPACE_BASH_ALWAYS_ASK) {
    return {
      decision: "ask",
      reason: `Bash always-ask mode is enabled (ACTSPACE_BASH_ALWAYS_ASK=1)`,
      summary: summarizeCommand(normalized.command),
      riskLevel: "low",
      executionEnvironment: options.sandboxAvailable === true ? "sandbox" : "real",
      sanitizedArgs,
    };
  }

  // ⑤ allowlist 命中：任何环境免审
  if (segments.every(isAllowedDevelopmentCommand)) {
    return {
      decision: "allow",
      summary: summarizeCommand(normalized.command),
      riskLevel: "low",
      sanitizedArgs,
    };
  }

  // ⑥ 沙盒优先：沙盒可用时非 allowlist 命令不再打扰用户，沙盒兜底爆炸半径
  if (options.sandboxAvailable === true) {
    return {
      decision: "allow",
      reason: "Running inside the sandbox (writes restricted to workspace and temp directories)",
      summary: summarizeCommand(normalized.command),
      riskLevel: "low",
      sanitizedArgs,
    };
  }

  // ⑦ 兜底：无沙盒环境的非 allowlist 命令进审
  return {
    decision: "ask",
    reason: `Command is not in the Bash allowlist: ${segments.join(" && ")}`,
    summary: summarizeCommand(normalized.command),
    riskLevel: "medium",
    executionEnvironment: "real",
    sanitizedArgs,
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

  const intent = typeof args.intent === "string" ? args.intent.trim() : "";
  if (!intent) {
    return deny("intent is required and must explain the Bash command", command);
  }

  const cwdArg = typeof args.cwd === "string" && args.cwd.trim() ? args.cwd : workspaceRoot;
  const cwdGuard = guardWorkspacePath(cwdArg, workspaceRoot);
  if (!cwdGuard.ok) {
    return deny(cwdGuard.error ?? "cwd escapes workspace boundary", command);
  }

  return {
    command,
    cwd: cwdGuard.resolvedPath,
    blockMs: sanitizeBlockMs(args.blockMs),
    intent,
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

function splitCommandSegments(command: string): string[] {
  return command
    .split(SIMPLE_SEGMENT_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean);
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
