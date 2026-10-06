import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { ContextPathState } from "./types.js";
import type { PathReference, DisclosureArtifact } from "./disclosure/paths.js";
import { capNewPaths } from "./disclosure/policy.js";
import { STATE_EVENT } from "./codec.js";

export type StateOperation =
  | { op: "initialize"; throughSeq: number; sessionId: string }
  | { op: "fact"; sourceSeq: number; callId: string; time: string; paths: readonly (PathReference & { read: boolean })[] }
  | { op: "candidate"; compactionId: string; cycle: number; batch: number; total: number; paths: readonly PathReference[] }
  | { op: "applied"; compactionId: string; cycle: number; activeIds: readonly string[]; index: DisclosureArtifact | null; indexDigest: string; indexPaths?: readonly string[] }
  | { op: "index"; index: DisclosureArtifact | null; indexDigest: string; indexPaths?: readonly string[] }
  | { op: "fork"; sessionId: string; replacements: readonly { oldId: string; path: string; history: NonNullable<ContextPathState["history"]> }[] };
export type DisclosureState = {
  throughSeq: number; initialized: boolean; boundary: number; sessionId: string; cycle: number;
  paths: Map<string, ContextPathState>; processed: Set<number>; applied: Set<string>;
  candidates: Map<string, { cycle: number; total: number; batches: Map<number, readonly PathReference[]> }>;
  completed: Set<string>; completedThrough: Map<string, number>; indexArtifacts: Set<string>; indexPaths: Set<string>; index: DisclosureArtifact | null; indexDigest: string;
};
export function emptyDisclosureState(): DisclosureState {
  return { throughSeq: -1, initialized: false, boundary: -1, sessionId: "", cycle: 0, paths: new Map(), processed: new Set(), applied: new Set(), candidates: new Map(), completed: new Set(), completedThrough: new Map(), indexArtifacts: new Set(), indexPaths: new Set(), index: null, indexDigest: "" };
}
export function registerPaths(state: DisclosureState, paths: readonly PathReference[]): void {
  const added = new Set<string>();
  for (const item of paths) {
    if (state.indexPaths.has(item.path)) continue;
    const id = item.path; const previous = state.paths.get(id);
    if (previous) {
      const history = item.history ? { ...item.history, sourceEventSeqs: [...new Set([...(previous.history?.sourceEventSeqs ?? []), ...item.history.sourceEventSeqs])].sort((a, b) => a - b) } : previous.history;
      state.paths.set(id, { ...previous, owners: [...new Set([...previous.owners, item.owner])], ...(item.description ? { description: item.description } : {}), ...(history ? { history } : {}) });
    } else {
      added.add(id); state.paths.set(id, { id, path: item.path, owners: [item.owner], visibility: "active", readsInCycle: 0, addedCycle: state.cycle, ...(item.description ? { description: item.description } : {}), ...(item.history ? { history: item.history } : {}) });
    }
  }
  if (added.size) {
    const active = new Set(capNewPaths([...state.paths.values()], added));
    for (const [id, value] of state.paths) if (value.visibility === "active" || added.has(id)) state.paths.set(id, { ...value, visibility: active.has(id) ? "active" : "sleeping" });
  }
}
export function candidatePaths(state: DisclosureState, id: string): readonly PathReference[] | undefined {
  const candidate = state.candidates.get(id);
  if (!candidate || candidate.batches.size !== candidate.total) return;
  return Array.from({ length: candidate.total }, (_, index) => candidate.batches.get(index)!).flat();
}
export function applyStateEvent(state: DisclosureState, event: SessionEventEnvelopeV1): void {
  if (event.seq <= state.throughSeq) return;
  state.throughSeq = event.seq;
  if (event.type === "compaction/end") { const id = (event.data as { compactionId?: string }).compactionId; if (id) { state.completed.add(id); state.completedThrough.set(id, event.seq); } }
  if (event.type !== STATE_EVENT) return;
  const data = event.data as unknown as StateOperation;
  if (data.op === "index" || data.op === "applied") {
    for (const path of data.indexPaths ?? []) state.indexPaths.add(path);
    for (const path of state.indexPaths) state.paths.delete(path);
  }
  if (data.op === "initialize" && !state.initialized) { state.initialized = true; state.boundary = data.throughSeq; state.sessionId = data.sessionId; }
  if (data.op === "fact" && !state.processed.has(data.sourceSeq)) {
    const newIds = new Set(data.paths.filter(path => !state.paths.has(path.path)).map(path => path.path));
    state.processed.add(data.sourceSeq); registerPaths(state, data.paths);
    for (const path of data.paths) if (path.read && state.paths.has(path.path)) { const value = state.paths.get(path.path)!; state.paths.set(path.path, { ...value, readsInCycle: value.readsInCycle + 1, lastReadAt: data.time }); }
    if (newIds.size) { const active = new Set(capNewPaths([...state.paths.values()], newIds)); for (const [id, value] of state.paths) if (value.visibility === "active" || newIds.has(id)) state.paths.set(id, { ...value, visibility: active.has(id) ? "active" : "sleeping" }); }
  }
  if (data.op === "candidate") {
    let value = state.candidates.get(data.compactionId);
    if (!value) { value = { cycle: data.cycle, total: data.total, batches: new Map() }; state.candidates.set(data.compactionId, value); }
    if (value.cycle !== data.cycle || value.total !== data.total || value.batches.has(data.batch)) throw new Error("Conflicting disclosure candidate batch.");
    value.batches.set(data.batch, data.paths);
  }
  if (data.op === "applied" && !state.applied.has(data.compactionId)) {
    const paths = candidatePaths(state, data.compactionId);
    if (!paths || !state.completed.has(data.compactionId) || data.cycle !== state.cycle || state.candidates.get(data.compactionId)?.cycle !== data.cycle) throw new Error("Disclosure applied without a complete committed candidate.");
    registerPaths(state, paths);
    if (data.activeIds.some(id => !state.paths.has(id))) throw new Error("Disclosure active path is absent from the candidate state.");
    const active = new Set(data.activeIds);
    const ordered = [...data.activeIds.map(id => state.paths.get(id)!), ...[...state.paths.values()].filter(path => !active.has(path.id))];
    state.paths = new Map(ordered.map(path => [path.id, { ...path, visibility: active.has(path.id) ? "active" : "sleeping", readsInCycle: 0 }]));
    state.cycle++; state.applied.add(data.compactionId); state.index = data.index; state.indexDigest = data.indexDigest;
    // Old completed reads were already included in the cycle that just ended.
    // Use the transaction boundary, not a later recovery/applied event.
    state.boundary = Math.max(state.boundary, state.completedThrough.get(data.compactionId)!);
  }
  if (data.op === "index") { state.index = data.index; state.indexDigest = data.indexDigest; }
  if ((data.op === "index" || data.op === "applied") && data.index) state.indexArtifacts.add(data.index.artifactId);
  if (data.op === "fork") {
    for (const replacement of data.replacements) {
      const old = state.paths.get(replacement.oldId); if (!old) continue;
      state.paths.delete(replacement.oldId); state.paths.set(replacement.path, { ...old, id: replacement.path, path: replacement.path, history: replacement.history });
    }
    state.sessionId = data.sessionId; state.index = null; state.indexDigest = "";
  }
}
