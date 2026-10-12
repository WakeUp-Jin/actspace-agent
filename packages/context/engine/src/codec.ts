import type { EventCodec } from "@actspace/session-journal";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";

export const CONTEXT_OWNER = "actspace.context";
export const SUPPLEMENT_EVENT = "plugin/actspace.context/supplement";
export const STATE_EVENT = "plugin/actspace.context/state";

export type SupplementOperation =
  | { readonly op: "add"; readonly id: string; readonly owner: string; readonly text: string; readonly afterEventSeq: number; readonly lifetime: "persistent" | "turn" | "request"; readonly turnId?: string }
  | { readonly op: "remove"; readonly id: string; readonly owner: string }
  | { readonly op: "bind"; readonly id: string; readonly owner: string; readonly requestId: string; readonly stepId: string };

function validateSupplement(data: RuntimeV2JsonValue): void {
  const value = record(data);
  string(value.id); string(value.owner);
  if (value.op === "remove") return;
  if (value.op === "bind") { string(value.requestId); string(value.stepId); return; }
  if (value.op !== "add" || typeof value.text !== "string" || !Number.isSafeInteger(value.afterEventSeq) || Number(value.afterEventSeq) < -1) throw new Error("Invalid Context supplement.");
  if (!["persistent", "turn", "request"].includes(String(value.lifetime))) throw new Error("Invalid supplement lifetime.");
  if (value.lifetime !== "persistent") string(value.turnId);
}
function validateState(data: RuntimeV2JsonValue): void {
  const value = record(data);
  if (value.op === "initialize") { integer(value.throughSeq, -1); string(value.sessionId); return; }
  if (value.op === "fact") { integer(value.sourceSeq); string(value.callId); string(value.time); paths(value.paths); for (const path of value.paths as readonly RuntimeV2JsonValue[]) if (typeof record(path).read !== "boolean") throw new Error("Invalid read fact."); return; }
  if (value.op === "candidate") {
    string(value.compactionId); integer(value.cycle); integer(value.batch); integer(value.total, 1); paths(value.paths);
    if (Number(value.batch) >= Number(value.total) || Buffer.byteLength(JSON.stringify(value), "utf8") > 256 * 1024) throw new Error("Invalid Context candidate batch size.");
    return;
  }
  if (value.op === "index" || value.op === "applied") {
    if (value.indexPaths !== undefined) { if (!Array.isArray(value.indexPaths)) throw new Error("Invalid index paths."); value.indexPaths.forEach(string); }
    string(value.indexDigest);
    if (value.index !== null) { const artifact = record(value.index!); string(artifact.artifactId); string(artifact.mediaType); string(artifact.sha256); integer(artifact.size); }
    if (value.op === "applied") { string(value.compactionId); integer(value.cycle); if (!Array.isArray(value.activeIds) || value.activeIds.length > 100 || value.activeIds.some(id => typeof id !== "string") || new Set(value.activeIds).size !== value.activeIds.length) throw new Error("Invalid active path IDs."); }
    return;
  }
  if (value.op === "fork") {
    string(value.sessionId); if (!Array.isArray(value.replacements)) throw new Error("Invalid fork paths.");
    for (const item of value.replacements) { const path = record(item); string(path.oldId); string(path.path); history(path.history); } return;
  }
  throw new Error("Invalid Context state operation.");
}
export const codecs: readonly EventCodec[] = [
  { type: SUPPLEMENT_EVENT, ownerPluginId: CONTEXT_OWNER, currentVersion: 1, criticality: "required", validate: validateSupplement, validateRelations: noSurface },
  { type: STATE_EVENT, ownerPluginId: CONTEXT_OWNER, currentVersion: 1, criticality: "required", validate: validateState, validateRelations: noSurface },
];
function record(value: RuntimeV2JsonValue): Readonly<Record<string, RuntimeV2JsonValue>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Context event data must be an object.");
  return value as Readonly<Record<string, RuntimeV2JsonValue>>;
}
function string(value: unknown): void { if (typeof value !== "string" || !value) throw new Error("Context event identity must be non-empty."); }

function integer(value: unknown, minimum = 0): void { if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error("Invalid Context integer."); }
function paths(value: unknown): void {
  if (!Array.isArray(value)) throw new Error("Context paths must be an array.");
  for (const item of value) { const path = record(item); string(path.path); string(path.owner); if (path.history !== undefined) history(path.history); }
}
function history(value: unknown): void { const item = record(value as RuntimeV2JsonValue); string(item.sessionId); if (!Array.isArray(item.sourceEventSeqs)) throw new Error("Invalid history source seqs."); item.sourceEventSeqs.forEach(seq => integer(seq)); }
function noSurface({ candidate }: import("@actspace/session-journal").EventCodecRelationContext): void { if (candidate.surface !== null) throw new Error("Context events cannot change Session Surface."); }
