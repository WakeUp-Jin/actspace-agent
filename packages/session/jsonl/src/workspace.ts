import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionHeaderV1 } from "@actspace/session-journal";

export function resolveSessionWorkspaceRoot(
  header: SessionHeaderV1,
  events: readonly SessionEventEnvelopeV1[],
  fallback?: string,
): string {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== "session/workspace-set" || !isRecord(event.data)) continue;
    if (typeof event.data.workspaceRoot === "string" && event.data.workspaceRoot.trim()) return event.data.workspaceRoot;
  }
  return header.cwd ?? fallback ?? "";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
