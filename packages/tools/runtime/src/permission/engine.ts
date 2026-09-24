import type { PermissionMode } from "@actspace/shared/runtime-v2";
import { classifyFileResource, isPathWithin } from "./file-resource.js";
import type { GlobalBoundaryDecision, PermissionDecision, PermissionReason, ToolPermissionDecision, ToolResource } from "./types.js";

export function evaluateGlobalBoundary(
  mode: PermissionMode,
  workspaceRoot: string,
  resources: readonly ToolResource[],
): GlobalBoundaryDecision {
  const reasons: PermissionReason[] = [];
  for (const resource of resources) {
    if (resource.kind !== "file") continue;
    const sensitivity = classifyFileResource(resource);
    if (sensitivity.kind === "protected") return { kind: "deny", code: sensitivity.code, reason: sensitivity.reason };
    if (sensitivity.kind === "once-only") {
      reasons.push({ code: sensitivity.code, message: sensitivity.reason, risk: "high", reusable: false });
    }
    if (mode === "default" && !isPathWithin(workspaceRoot, resource.canonicalPath)) {
      reasons.push({ code: "WORKSPACE_SCOPE_APPROVAL_REQUIRED", message: "The requested file is outside the workspace.", risk: resource.access === "read" ? "medium" : "high", reusable: resource.access !== "delete" });
    }
  }
  return reasons.length === 0 ? { kind: "pass" } : { kind: "ask", reasons: Object.freeze(reasons) };
}

export function combinePermissionDecisions(global: GlobalBoundaryDecision, tool: ToolPermissionDecision): PermissionDecision {
  if (global.kind === "deny") return global;
  if (tool.kind === "deny") return tool;
  const reasons: PermissionReason[] = global.kind === "ask" ? [...global.reasons] : [];
  if (tool.kind === "ask") reasons.push({ code: "TOOL_APPROVAL_REQUIRED", message: tool.reason, risk: tool.risk, reusable: false });
  if (reasons.length === 0) return { kind: "allow" };
  return { kind: "ask", reasons: Object.freeze(reasons) };
}
