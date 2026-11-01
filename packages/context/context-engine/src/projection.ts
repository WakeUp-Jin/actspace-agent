import { describeContextContent } from "./content-manifest.js";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { freezeRequest } from "./request-snapshot.js";
import type { Context, ContextProjection } from "./types.js";

const cache = new WeakMap<Context, Map<string, ContextProjection>>();

export function projectContext(context: Context, basis: ContextProjection["basis"] = "current-context"): ContextProjection {
  const found = cache.get(context)?.get(basis);
  if (found) return found;
  const projection = freezeRequest({
    schemaVersion: 1,
    identity: { sessionId: context.request.sessionId, logicalAgentScopeId: context.request.logicalAgentScopeId ?? "main" },
    basis,
    contextRevision: context.status.contextRevision ?? 0,
    throughJournalSeq: context.status.throughJournalSeq,
    surfaceGeneration: context.content.conversation.replaceGeneration,
    ...(basis === "request" ? { request: { requestId: context.request.requestId, ...(context.request.turnId === undefined ? {} : { turnId: context.request.turnId }), ...(context.request.stepId === undefined ? {} : { stepId: context.request.stepId }), routeId: context.request.routeId, model: context.request.model } } : {}),
    instanceGeneration: context.status.instanceGeneration ?? "unmanaged",
    model: context.status.requestModel ?? null,
    manifest: describeContextContent(context).manifest,
    content: context.content,
    status: context.status,
  } as unknown as RuntimeV2JsonValue) as unknown as ContextProjection;
  let entries = cache.get(context); if (!entries) { entries = new Map(); cache.set(context, entries); }
  entries.set(basis, projection);
  return projection;
}
