import { describeContextContent } from "./content-manifest.js";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { freezeRequest } from "./request-snapshot.js";
import { contextValue } from "./context-snapshot.js";
import type { Context, ContextProjection } from "./types.js";

const cache = new WeakMap<Context, Map<string, ContextProjection>>();

export function projectContext(context: Context, basis: ContextProjection["basis"] = "current-context"): ContextProjection {
  const found = cache.get(context)?.get(basis);
  if (found) return found;
  const { conversation, ...content } = context.content;
  const frozen = freezeRequest({
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
    content,
    status: context.status,
  } as unknown as RuntimeV2JsonValue) as unknown as ContextProjection;
  // 对话不复制：已信任视图直接引用，其他对象照旧检查、冻结（agent-context-engine.md「已信任的对话视图」）。
  // content 的键顺序保持 system、conversation、supplements、tools，与改前序列化结果一致。
  const projection = Object.freeze({ ...frozen, content: Object.freeze({ system: frozen.content.system, conversation: contextValue(conversation), supplements: frozen.content.supplements, tools: frozen.content.tools }) }) as ContextProjection;
  let entries = cache.get(context); if (!entries) { entries = new Map(); cache.set(context, entries); }
  entries.set(basis, projection);
  return projection;
}
