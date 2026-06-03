import { join } from "node:path";
import {
  createSessionStorePaths,
  parseJsonl,
  readContextState,
  readMeta,
} from "@actspace/agent-core";
import type {
  ContextState,
  ContextUsageSnapshot,
  LlmUsagePayload,
  ModelId,
  SessionEvent,
  SessionPreviewInput,
  SessionPreviewResult,
} from "@actspace/shared";
import { getLatestContextSnapshot } from "@actspace/shared";
import type { AppDataRoots } from "./agent-turn";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafeSessionId(sessionId: string): boolean {
  return (
    sessionId.length > 0 &&
    sessionId !== "." &&
    sessionId !== ".." &&
    !sessionId.includes("/") &&
    !sessionId.includes("\\")
  );
}

function contextStateToSnapshot(state: ContextState | null | undefined): ContextUsageSnapshot | null {
  if (!state) return null;
  return {
    totalTokens: state.totalEstimatedTokens,
    maxTokens: state.maxTokens,
    percentUsed: state.percentUsed,
    estimator: state.estimator,
    buckets: state.buckets,
  };
}

function latestModelFromEvents(events: SessionEvent[]): Pick<SessionPreviewResult, "model" | "modelId"> {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!isRecord(event.payload)) continue;

    if (event.type === "llm_usage") {
      const payload = event.payload as Partial<LlmUsagePayload>;
      if (typeof payload.model === "string" || typeof payload.modelId === "string") {
        return {
          ...(typeof payload.model === "string" ? { model: payload.model } : {}),
          ...(typeof payload.modelId === "string" ? { modelId: payload.modelId as ModelId } : {}),
        };
      }
    }

    if (event.type === "assistant_message" || event.type === "assistant_reply") {
      const model = typeof event.payload.model === "string" ? event.payload.model : undefined;
      const modelId = typeof event.payload.modelId === "string" ? event.payload.modelId as ModelId : undefined;
      if (model || modelId) {
        return {
          ...(model ? { model } : {}),
          ...(modelId ? { modelId } : {}),
        };
      }
    }
  }

  return {};
}

export async function getSessionPreview(
  input: SessionPreviewInput,
  roots: AppDataRoots,
): Promise<SessionPreviewResult | null> {
  const sessionId = input.sessionId.trim();
  if (!isSafeSessionId(sessionId)) return null;

  const paths = createSessionStorePaths(join(roots.sessionRoot, sessionId));
  const meta = await readMeta(paths.metaPath);
  if (!meta) return null;

  const [parsed, contextState] = await Promise.all([
    parseJsonl(paths.sessionPath),
    readContextState(paths),
  ]);

  const contextSnapshot =
    getLatestContextSnapshot(parsed.events) ??
    contextStateToSnapshot(contextState);
  const model = latestModelFromEvents(parsed.events);

  return {
    sessionId: meta.id,
    ...(meta.workspaceId ? { workspaceId: meta.workspaceId } : {}),
    workspaceRoot: meta.workspaceRoot ?? roots.defaultWorkspaceRoot,
    ...model,
    contextSnapshot,
  };
}
