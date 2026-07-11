import { isAbsolute, relative, resolve } from "node:path";
import type { ApprovalGate, ToolApprovalDecision, ToolApprovalRequest } from "./scheduler";

export type PermissionMode = "default" | "trusted" | "yolo";

export function createApprovalGateForPermissionMode(
  mode: PermissionMode,
  workspaceRoot: string,
): ApprovalGate | undefined {
  if (mode === "default" || mode === "trusted") {
    return undefined;
  }

  return {
    async waitForDecision(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
      return {
        requestId: request.id,
        decision: requestLooksWorkspaceLocal(request, workspaceRoot) ? "approve_once" : "deny",
        decidedAt: Date.now(),
      };
    },
  };
}

function requestLooksWorkspaceLocal(request: ToolApprovalRequest, workspaceRoot: string): boolean {
  const paths = collectPathLikeValues(request.args);
  if (paths.length === 0) return true;
  return paths.every((pathValue) => isWorkspaceLocal(pathValue, workspaceRoot));
}

function collectPathLikeValues(value: unknown): string[] {
  const paths: string[] = [];
  collect(value, "");
  return paths;

  function collect(current: unknown, key: string): void {
    if (typeof current === "string") {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "path" || lowerKey.endsWith("path") || lowerKey.includes("file")) {
        paths.push(current);
      }
      return;
    }

    if (Array.isArray(current)) {
      current.forEach((entry, index) => collect(entry, `${key}.${index}`));
      return;
    }

    if (current && typeof current === "object") {
      for (const [entryKey, entryValue] of Object.entries(current)) {
        collect(entryValue, entryKey);
      }
    }
  }
}

function isWorkspaceLocal(pathValue: string, workspaceRoot: string): boolean {
  const absolute = isAbsolute(pathValue) ? resolve(pathValue) : resolve(workspaceRoot, pathValue);
  const rel = relative(workspaceRoot, absolute);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
