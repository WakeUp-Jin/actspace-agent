import type { PermissionChecker, PermissionResult } from "../../../internal-tools";
import { browserCommandMetadata } from "./generated-actions";
import { summarizeBrowserToolCall } from "./preview";
import type { BrowserCommandAction, BrowserPreflightResult } from "./types";

const INTERNAL_APPROVAL_ARG = "__browser_approval";
const INTERNAL_ACTION_HASH_ARG = "__browser_action_hash";

export type BrowserPreflight = (actions: BrowserCommandAction[]) => Promise<BrowserPreflightResult>;

export function createBrowserActionPermissionChecker(
  category: string,
  disabledCapabilities: ReadonlySet<string> = new Set(),
): PermissionChecker {
  return async (args) => {
    const action = typeof args.action === "string" ? args.action : "";
    const metadata = browserCommandMetadata.find(
      (entry) => entry.category === category && entry.action === action,
    );
    if (!metadata) return deny(`未知 Browser Use action: ${category}.${action || "<empty>"}`);
    const implementationStatus: string = metadata.status;
    if (implementationStatus === "not_implemented") {
      return deny(`${metadata.id} 尚未实现，请调用 browser_help 查看当前状态。`);
    }
    if (isBrowserEffectDisabled(metadata.effect, disabledCapabilities)) {
      return deny(`${metadata.effect} capability 已在设置中禁用。`);
    }
    const sanitizedArgs = stripInternalArgs(args);
    if (metadata.readOnly) {
      return { decision: "allow", riskLevel: metadata.riskLevel, sanitizedArgs };
    }
    return {
      decision: "ask",
      reason: `${metadata.id} 会产生 ${metadata.effect} 外部影响。`,
      summary: summarizeAction(category, action, sanitizedArgs),
      riskLevel: metadata.riskLevel,
      allowSimilar: metadata.riskLevel !== "high",
      sanitizedArgs,
    };
  };
}

export function createBrowserRunPermissionChecker(
  preflight: BrowserPreflight,
  disabledCapabilities: ReadonlySet<string> = new Set(),
): PermissionChecker {
  return async (args) => {
    const actions = normalizeActions(args.actions);
    if (!actions) return deny("browser_run.actions 必须是结构化 action 数组。");
    let result: BrowserPreflightResult;
    try {
      result = await preflight(actions);
    } catch (error) {
      return deny(error instanceof Error ? error.message : String(error));
    }
    if (!result.approval) return deny("Go bridge 未返回 browser_run approval token。");
    if (result.actions.some((action) => action.status === "not_implemented")) {
      return deny("browser_run 包含尚未实现的 action，请先调用 browser_help 检查状态。");
    }
    const disabledEffect = result.actions.find((action) => (
      isBrowserEffectDisabled(action.effect, disabledCapabilities)
    ));
    if (disabledEffect) {
      return deny(`${disabledEffect.effect} capability 已在设置中禁用，整批未执行。`);
    }
    const sanitizedArgs = {
      actions,
      stop_on_error: result.readOnly ? args.stop_on_error !== false : true,
      [INTERNAL_APPROVAL_ARG]: result.approval,
      [INTERNAL_ACTION_HASH_ARG]: result.actionHash,
    };
    if (result.readOnly) {
      return { decision: "allow", riskLevel: result.highestRisk, sanitizedArgs };
    }
    return {
      decision: "ask",
      reason: `批处理中最高风险为 ${result.highestRisk}，包含会改变真实 Chrome 状态的动作。`,
      summary: result.actions.map((action) => (
        `${action.category}.${action.action}${action.target ? ` (${action.target})` : ""}${action.origin ? ` @ ${action.origin}` : ""}`
      )).join(" → "),
      riskLevel: result.highestRisk,
      allowSimilar: false,
      sanitizedArgs,
    };
  };
}

function isBrowserEffectDisabled(effect: string, disabledCapabilities: ReadonlySet<string>): boolean {
  return disabledCapabilities.has(`browser_capability_${effect}`);
}

export function getBrowserApproval(args: Record<string, unknown>): string {
  return typeof args[INTERNAL_APPROVAL_ARG] === "string" ? args[INTERNAL_APPROVAL_ARG] : "";
}

function stripInternalArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...args };
  delete sanitized[INTERNAL_APPROVAL_ARG];
  delete sanitized[INTERNAL_ACTION_HASH_ARG];
  return sanitized;
}

function normalizeActions(value: unknown): BrowserCommandAction[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const actions: BrowserCommandAction[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.category !== "string" || typeof candidate.action !== "string") return null;
    if (candidate.params !== undefined && (!candidate.params || typeof candidate.params !== "object" || Array.isArray(candidate.params))) return null;
    actions.push({
      category: candidate.category,
      action: candidate.action,
      params: candidate.params as Record<string, unknown> | undefined,
    });
  }
  return actions;
}

function summarizeAction(category: string, action: string, args: Record<string, unknown>): string {
  return summarizeBrowserToolCall(`browser_${category}`, { action, ...args });
}

function deny(reason: string): PermissionResult {
  return { decision: "deny", reason, summary: reason, riskLevel: "high", allowSimilar: false };
}
