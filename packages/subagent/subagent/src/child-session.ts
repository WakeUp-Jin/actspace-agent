import { createHash } from "node:crypto";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionHandle, SessionStore } from "@actspace/session-persistence";

/** A new child Session: `agent_id` is its id, its lineage points at the main Session (agent-subagent-runtime.md「子会话」). */
export async function createChildSession(options: {
  readonly store: SessionStore;
  readonly parent: SessionHandle;
  readonly parentCallId: string;
  readonly childSessionId: string;
  readonly createdAt: string;
  readonly cwd?: string;
  readonly prompt: string;
  readonly presetId: string;
  readonly manifestDigest: string;
  readonly plugins: readonly { id: string; version: string }[];
  readonly onEvent?: (event: SessionEventEnvelopeV1) => void;
}): Promise<SessionHandle> {
  const seedDigest = createHash("sha256").update(options.prompt).digest("hex");
  return options.store.create({
    sessionId: options.childSessionId,
    createdAt: options.createdAt,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    lineage: { parentSessionId: options.parent.header.sessionId, parentBoundarySeq: options.parent.lastSeq, parentCallId: options.parentCallId, seedDigest, origin: "delegation", delegationDepth: 1 },
    createdWith: { profileId: "base", presetId: options.presetId, runtimeContractVersion: "2", manifestDigest: options.manifestDigest, plugins: options.plugins, codecSetDigest: options.store.options.registry.digest },
  }, options.onEvent ? { onEvent: options.onEvent } : {});
}
