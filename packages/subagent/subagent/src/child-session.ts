import { createHash } from "node:crypto";
import type { SessionStore } from "@actspace/session-persistence";
import type { SessionHandle } from "@actspace/session-persistence";
import type { StaticAgentPreset } from "./preset.js";

export async function createChildSession(options: { readonly store: SessionStore; readonly parentSessionId: string; readonly parentBoundarySeq: number; readonly parentCallId: string; readonly childSessionId: string; readonly createdAt: string; readonly cwd?: string; readonly delegationDepth: number; readonly task: string; readonly preset: StaticAgentPreset; readonly manifestDigest: string; readonly plugins: readonly { id: string; version: string }[] }): Promise<SessionHandle> {
  const seedDigest = createHash("sha256").update(options.task).digest("hex");
  return options.store.create({ sessionId: options.childSessionId, createdAt: options.createdAt, ...(options.cwd === undefined ? {} : { cwd: options.cwd }), lineage: { parentSessionId: options.parentSessionId, parentBoundarySeq: options.parentBoundarySeq, parentCallId: options.parentCallId, seedDigest, origin: "delegation", delegationDepth: options.delegationDepth }, createdWith: { profileId: "base", presetId: options.preset.id, runtimeContractVersion: "2", manifestDigest: options.manifestDigest, plugins: options.plugins, codecSetDigest: options.store.options.registry.digest } });
}
