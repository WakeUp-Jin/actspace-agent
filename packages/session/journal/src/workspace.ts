import type { SessionJournal } from "./journal.js";
import type { SessionEventEnvelopeV1 } from "./event-envelope.js";
import type { SessionHeaderV1 } from "./header.js";

export function resolveSessionWorkspaceRoot(
  header: SessionHeaderV1,
  events: readonly SessionEventEnvelopeV1[] | SessionJournal,
  fallback?: string,
): string {
  if ("project" in events) {
    const root = events.project(WORKSPACE_ROOT, () => null as string | null, (previous, event) =>
      event.type === "session/workspace-set" && isRecord(event.data) && typeof event.data.workspaceRoot === "string" && event.data.workspaceRoot.trim() ? event.data.workspaceRoot : previous);
    return root ?? header.cwd ?? fallback ?? "";
  }
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

const WORKSPACE_ROOT = Symbol("workspace-root");
