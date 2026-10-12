import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { Context, ContextRequest } from "@actspace/context-engine";
import { surfaceMessage } from "@actspace/context-engine";
import type { SessionSurfaceView, SessionSurfaceNodeV1 } from "@actspace/session-journal";
import type { LlmToolDefinition } from "@actspace/llm-service";
import type { LogicalRequestCandidate } from "./request-snapshot.js";

/** Compatibility adapter for legacy contributor callers; production uses Context sources. */
export function contextFromCandidate(request: ContextRequest, candidate: LogicalRequestCandidate, surface: SessionSurfaceView, throughJournalSeq: number): Context {
  const unchanged = JSON.stringify(candidate.messages) === JSON.stringify(surface.entries.map(entry => surfaceMessage(entry.node)));
  const conversation: SessionSurfaceView = unchanged ? surface : {
    replaceGeneration: surface.replaceGeneration,
    entries: candidate.messages.map((value, index) => {
      const record = value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : {};
      const messageId = `legacy-contributor-${index}`;
      const node: SessionSurfaceNodeV1 = record.role === "tool" && typeof record.callId === "string"
        ? { kind: "tool-result", messageId, callId: record.callId, content: record.content ?? null, isError: record.isError === true }
        : { kind: record.role === "assistant" ? "assistant" : "user", messageId, content: record.content ?? value };
      return { node, sourceEventSeqs: [] };
    }),
  };
  return { request, content: {
    system: { sections: candidate.renderedSystemPrompt ? [{ id: "legacy-prompt", owner: "actspace.prompt", order: 0, content: candidate.renderedSystemPrompt }] : [], modelFacts: [] },
    conversation, supplements: [], tools: candidate.tools as unknown as readonly LlmToolDefinition[],
  }, status: { throughJournalSeq, cycle: 0, paths: [], facts: candidate.facts, plugins: {} } };
}
