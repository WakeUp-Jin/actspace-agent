import type { CordisContext } from "@actspace/cordis-adapter";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { Context, ContextPathState, ContextSource, CompactionDisclosure, CompactionRegion, CompactionResult, CompactionSession, ContextCompactionCoordinator } from "@actspace/context-engine";
import { CONTEXT_OWNER, STATE_EVENT } from "@actspace/context-engine/codec";
import { ContextSupplements } from "@actspace/context-engine";
import { applyStateEvent, candidatePaths, emptyDisclosureState, registerPaths, type DisclosureState, type StateOperation } from "@actspace/context-engine/state";
import { selectActive } from "./policy.js";
import { collectPathHints, referenceText, type DisclosureHost, type PathReference } from "./paths.js";
import { sleepingIndex } from "./index-impl.js";

export const DISCLOSURE_OWNER = "actspace.context-disclosure";
export class ProgressiveDisclosure implements CompactionDisclosure {
  private readonly states = new WeakMap<CompactionSession, DisclosureState>();
  private readonly scanned = new WeakMap<CompactionSession, { seq: number; enabled: boolean }>();
  constructor(private readonly host: DisclosureHost) {}

  private state(session: CompactionSession): DisclosureState {
    let state = this.states.get(session);
    if (!state) { state = emptyDisclosureState(); this.states.set(session, state); }
    for (const event of session.journal.events.slice(state.throughSeq + 1)) applyStateEvent(state, event);
    return state;
  }
  private async append(session: CompactionSession, data: StateOperation): Promise<void> {
    await session.append({ type: STATE_EVENT, eventVersion: 1, source: { ownerPluginId: CONTEXT_OWNER }, data: data as unknown as RuntimeV2JsonValue, surface: null });
    this.state(session);
  }
  private async indexPaths(session: CompactionSession): Promise<Set<string>> {
    const state = this.state(session);
    const resolved = await Promise.all([...state.indexArtifacts].map(id => this.host.resolveArtifact(session.header.sessionId, id).catch(() => undefined)));
    return new Set([...state.indexPaths, ...resolved.flatMap(value => value ? [value.path] : [])]);
  }
  private async initialize(session: CompactionSession): Promise<void> {
    const state = this.state(session);
    if (!state.initialized) await this.append(session, { op: "initialize", throughSeq: session.lastSeq, sessionId: session.header.sessionId });
    if (state.sessionId !== session.header.sessionId) {
      const path = await this.host.historyPath(session.header.sessionId);
      const replacements = path ? [...state.paths.values()].filter(value => value.history?.sessionId === state.sessionId).map(value => ({ oldId: value.id, path, history: { sessionId: session.header.sessionId, sourceEventSeqs: value.history!.sourceEventSeqs } })) : [];
      await new ContextSupplements(session).remove(DISCLOSURE_OWNER, "navigation");
      await this.append(session, { op: "fork", sessionId: session.header.sessionId, replacements });
    }
  }
  async hydrate(context: Context, session: CompactionSession): Promise<Context> {
    await this.initialize(session);
    await this.recover(session);
    const state = this.state(session);
    let scanned = this.scanned.get(session);
    if (!scanned || scanned.seq < state.boundary) {
      const previous = session.journal.events.slice(0, state.boundary + 1).reverse().find(event => event.type === "request/context");
      scanned = { seq: state.boundary, enabled: previous ? disclosureEnabled(previous) : false };
    }
    for (const event of session.journal.events.slice(scanned.seq + 1)) {
      if (event.type === "request/context") {
        scanned.enabled = disclosureEnabled(event);
      }
      if (event.type === "tool/result" && scanned.enabled) await this.observe(session, event);
      scanned.seq = event.seq;
    }
    this.scanned.set(session, scanned);
    const owners = context.status.plugins["actspace.context.owners"];
    const indexPaths = await this.indexPaths(session);
    const paths = [...state.paths.values()].filter(path => !indexPaths.has(path.path) && (!Array.isArray(owners) || path.owners.some(owner => owners.includes(owner))));
    const index = await sleepingIndex(this.host, session.header.sessionId, paths, state);
    const resolved = index.index ? await this.host.resolveArtifact(session.header.sessionId, index.index.artifactId) : undefined;
    if (resolved) indexPaths.add(resolved.path);
    if (index.indexDigest !== state.indexDigest || index.index?.artifactId !== state.index?.artifactId || [...indexPaths].some(path => !state.indexPaths.has(path))) await this.append(session, { op: "index", ...index, indexPaths: [...indexPaths] });
    return { ...context, status: { ...context.status, throughJournalSeq: session.lastSeq, cycle: state.cycle, paths,
      ...(resolved && index.index ? { sleepingDirectory: { artifactId: index.index.artifactId, mediaType: index.index.mediaType, path: resolved.path } } : {}),
    } };
  }
  async observe(session: CompactionSession, event: SessionEventEnvelopeV1): Promise<void> {
    const state = this.state(session);
    if (!state.initialized || event.seq <= state.boundary || state.processed.has(event.seq)) return;
    const data = record(event.data);
    if (event.type !== "tool/result" || data.status !== "completed" || typeof data.callId !== "string") return;
    const paths: (PathReference & { read: boolean })[] = [];
    if ((data.pluginId === "actspace.filesystem-read" && data.name === "read_file") || (data.pluginId === "actspace.filesystem-write" && ["write_file", "edit_file"].includes(String(data.name)))) {
      for (const detail of Array.isArray(data.detail) ? data.detail : []) {
        const block = record(detail); const value = record(block.value);
        if (block.label !== "actspace.context.file" || value.kind !== "file" || typeof value.path !== "string") continue;
        const path = await this.host.normalizeFile(session.header.sessionId, value.path);
        if (path) paths.push({ path, owner: "actspace.context-tools", read: data.name === "read_file" && value.operation === "read" });
      }
    }
    for (const artifact of Array.isArray(data.artifacts) ? data.artifacts : []) {
      const value = record(artifact);
      if (typeof value.artifactId !== "string" || typeof value.mediaType !== "string" || !value.mediaType.startsWith("text/") || state.indexArtifacts.has(value.artifactId)) continue;
      try { const file = await this.host.resolveArtifact(session.header.sessionId, value.artifactId); paths.push({ path: file.path, owner: "actspace.context-tools", read: false }); } catch { /* Missing optional output references do not fabricate files. */ }
    }
    const indexPaths = await this.indexPaths(session);
    const merged = new Map<string, PathReference & { read: boolean }>();
    for (const path of paths) if (!indexPaths.has(path.path)) merged.set(path.path, { ...path, read: path.read || merged.get(path.path)?.read === true });
    const unique = [...merged.values()];
    await this.append(session, { op: "fact", sourceSeq: event.seq, callId: data.callId, time: event.time, paths: unique });
  }
  async prepare(session: CompactionSession, context: Context, region: CompactionRegion, result: CompactionResult, compactionId: string): Promise<void> {
    await this.initialize(session);
    const entries = context.content.conversation.entries.slice(region.start, region.end);
    const hints = new Set([...(result.pathlist ?? []), ...collectPathHints(entries.map(entry => entry.node.content)), ...collectPathHints(result.content)]);
    const paths: PathReference[] = [];
    const indexPaths = await this.indexPaths(session);
    for (const hint of hints) { const path = await this.host.normalizeFile(session.header.sessionId, hint); if (path && !indexPaths.has(path)) paths.push({ path, owner: DISCLOSURE_OWNER }); }
    const historyPath = await this.host.historyPath(session.header.sessionId);
    if (historyPath) paths.push({ path: historyPath, owner: DISCLOSURE_OWNER, description: "Original Session Journal", history: { sessionId: session.header.sessionId, sourceEventSeqs: [...new Set(entries.flatMap(entry => entry.sourceEventSeqs))].sort((a, b) => a - b) } });
    const unique = [...new Map(paths.map(path => [path.path, path])).values()];
    const batches = batchReferences(unique);
    const cycle = this.state(session).cycle;
    for (const [batch, values] of batches.entries()) await this.append(session, { op: "candidate", compactionId, cycle, batch, total: batches.length, paths: values });
    await session.flush();
  }
  async recover(session: CompactionSession): Promise<boolean> {
    const state = this.state(session);
    let repaired = false;
    for (const id of state.completed) if (!state.applied.has(id) && candidatePaths(state, id)) { await this.applied(session, id); repaired = true; }
    return repaired;
  }
  async applied(session: CompactionSession, compactionId: string): Promise<void> {
    const state = this.state(session);
    if (state.applied.has(compactionId)) return;
    const paths = candidatePaths(state, compactionId);
    if (!paths || state.candidates.get(compactionId)?.cycle !== state.cycle || !state.completed.has(compactionId)) throw new Error("Disclosure candidate is not committed.");
    const indexPaths = await this.indexPaths(session);
    const next = structuredClone(state);
    next.indexPaths = indexPaths;
    for (const path of indexPaths) next.paths.delete(path);
    registerPaths(next, paths);
    const activeIds = selectActive([...next.paths.values()], next.cycle);
    const active = new Set(activeIds);
    const nextPaths: ContextPathState[] = [...next.paths.values()].map(path => ({ ...path, visibility: active.has(path.id) ? "active" : "sleeping" }));
    const index = await sleepingIndex(this.host, session.header.sessionId, nextPaths, state);
    if (index.index) indexPaths.add((await this.host.resolveArtifact(session.header.sessionId, index.index.artifactId)).path);
    await this.append(session, { op: "applied", compactionId, cycle: state.cycle, activeIds, ...index, indexPaths: [...indexPaths] });
    await session.flush();
  }
}

export function batchReferences(paths: readonly PathReference[]): readonly (readonly PathReference[])[] {
  const limit = 256 * 1024 - 2048; const batches: PathReference[][] = [[]]; let bytes = 2;
  for (const path of paths) {
    const size = Buffer.byteLength(JSON.stringify(path), "utf8") + 1;
    if (size > limit) throw new Error("A context path exceeds the state event size limit.");
    if (bytes + size > limit) { batches.push([]); bytes = 2; }
    batches.at(-1)!.push(path); bytes += size;
  }
  return batches;
}
export function createDisclosureSource(): ContextSource {
  return { id: "context-disclosure", owner: DISCLOSURE_OWNER, order: 60, criticality: "required", fields: ["supplements"], get: (context, write) => {
    const active = context.status.paths.filter(path => path.visibility === "active");
    const sleeping = context.status.sleepingDirectory;
    const text = [...(active.length ? ["Current active context files (this list supersedes earlier navigation lists):", ...active.map(path => `- ${referenceText(path)}`)] : []), ...(sleeping ? [`Sleeping references index: ${JSON.stringify(sleeping.path)}. Read it to discover other files.`] : [])].join("\n");
    write({ supplements: [{ id: "navigation", owner: DISCLOSURE_OWNER, afterEventSeq: -1, sourceEventSeq: -1, text }] });
  } };
}
export function apply(ctx: CordisContext): void {
  const host = ctx.get?.("actspace.host.agent") as { contextDisclosure?: DisclosureHost } | undefined;
  if (!host?.contextDisclosure) { ctx.provide?.("context.disclosure", undefined); return; }
  const disclosure = new ProgressiveDisclosure(host.contextDisclosure);
  const coordinator = (ctx.get?.("context.engine") as { compaction: ContextCompactionCoordinator }).compaction;
  const remove = coordinator.registerDisclosure(disclosure); ctx.effect?.(() => remove);
  ctx.provide?.("context.disclosure", disclosure);
}
function record(value: unknown): Readonly<Record<string, RuntimeV2JsonValue>> { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : {}; }
function disclosureEnabled(event: SessionEventEnvelopeV1): boolean {
  const snapshot = record(record(event.data).snapshot);
  return Array.isArray(snapshot.contributorProvenance) && snapshot.contributorProvenance.some(value => record(value).contributorId === "context-disclosure");
}
