import { isCommandPrefixSelector, type GrantAudience, type SessionGrant } from "@actspace/shared/runtime-v2";
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
  if (resources.length === 0 || resources.some((resource) => resource.access === "delete")) return false;
  const now = context.now ?? Date.now();
  const eligible = grants.filter((grant) => isEligibleGrant(grant, context, now));
  return resources.every((resource) => eligible.some((grant) => resource.kind === "file" ? grantCoversFile(grant, resource) : grantCoversProcess(grant, resource)));
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
    : grant.selector.kind === "subtree" && isPathWithin(grant.selector.canonicalRoot, resource.canonicalPath);
}

export function grantCoversProcess(
  grant: Pick<SessionGrant, "action" | "access" | "selector">,
  resource: Extract<ToolResource, { kind: "process" }>,
): boolean {
  const selector = grant.selector;
  return grant.action === "process.execute" && grant.access === "execute"
    && isCommandPrefixSelector(selector) && resource.noSandbox === false && !resource.dynamic
    && resource.workspaceRoot === selector.cwdRoot && isPathWithin(selector.cwdRoot, resource.cwd)
    && resource.grantPrefix?.length === selector.prefix.length
    && selector.prefix.every((token, index) => resource.grantPrefix?.[index] === token && resource.argv?.[index] === token);
}

export function matchingProcessGrant(grants: readonly SessionGrant[], resources: readonly ToolResource[], context: GrantResolutionContext): SessionGrant | undefined {
  const resource = resources[0];
  if (resources.length !== 1 || resource?.kind !== "process") return undefined;
  return grants.filter(grant => isEligibleGrant(grant, context) && grantCoversProcess(grant, resource))
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.grantId.localeCompare(b.grantId))[0];
}
