import type { GrantAudience, SessionGrant } from "@actspace/shared/runtime-v2";
import { isPathWithin } from "./file-resource.js";
import type { ToolResource } from "./types.js";

export type GrantResolutionContext = {
  readonly sessionId: string;
  readonly agentId: string;
  readonly audience: GrantAudience;
  readonly now?: number;
};

export function sessionGrantsCoverResources(
  grants: readonly SessionGrant[],
  resources: readonly ToolResource[],
  context: GrantResolutionContext,
): boolean {
  if (resources.length === 0 || resources.some((resource) => resource.kind !== "file" || resource.access === "delete")) return false;
  const now = context.now ?? Date.now();
  const eligible = grants.filter((grant) => isEligibleGrant(grant, context, now));
  return resources.every((resource) => resource.kind === "file" && eligible.some((grant) => grantCoversFile(grant, resource)));
}

export function isEligibleGrant(grant: SessionGrant, context: GrantResolutionContext, now = context.now ?? Date.now()): boolean {
  return grant.sessionId === context.sessionId
    && grant.agentId === context.agentId
    && grant.audience.pluginId === context.audience.pluginId
    && grant.audience.permissionDomain === context.audience.permissionDomain
    && grant.audience.policyVersion === context.audience.policyVersion
    && (grant.expiresAt === undefined || Date.parse(grant.expiresAt) > now);
}

export function grantCoversFile(
  grant: SessionGrant,
  resource: Extract<ToolResource, { kind: "file" }>,
): boolean {
  const action = resource.access === "read" ? "file.read" : resource.access === "write" ? "file.write" : undefined;
  if (action === undefined || grant.action !== action || grant.access !== resource.access) return false;
  return grant.selector.kind === "exact"
    ? grant.selector.canonicalPath === resource.canonicalPath
    : isPathWithin(grant.selector.canonicalRoot, resource.canonicalPath);
}
