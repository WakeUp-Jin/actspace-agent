import { existsSync } from "node:fs";
import { mkdir, open, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ACTSPACE_SERVICE_IDS, containNotification, getService, provideService, serviceKey, serviceView, type CordisContext } from "@actspace/cordis-adapter";
import { PROMPT_HOST_PORT } from "@actspace/prompt";
import { runtimeInfo } from "@actspace/prompt/source-support";
import type { SessionEventEnvelopeV1, SessionHeaderV1 } from "@actspace/session-journal";
import { sessionsRoot, transcriptPath } from "./paths.js";
import { PLUGIN_ID, PROMPT_ID, sessionHistorySection } from "./prompt.js";
import { EMPTY_TRANSCRIPT, foldTranscript, inheritedThroughSeq, reduceSubagentFacts, reduceTranscript, renderTranscript, type TranscriptBranch, type TranscriptState, type TranscriptSubagentFacts } from "./render.js";

type OpenSession = {
  readonly header: SessionHeaderV1;
  readonly journal: { project<T>(key: symbol, initial: () => T, reduce: (state: T, event: SessionEventEnvelopeV1) => T): T };
};
type SessionRuntime = { getOpen(sessionId: string): OpenSession | undefined };
type SessionStorage = {
  inspect(sessionId: string): Promise<{ readonly header: SessionHeaderV1 | null; readonly events: readonly SessionEventEnvelopeV1[] }>;
  listSessionIds(): Promise<readonly string[]>;
};
type HostSession = { readonly dataRoot: string };
/** 这个包用到的三个服务各取一小块：打开着的会话、落盘的会话、数据目录。 */
export const TRANSCRIPT_SESSIONS_VIEW = serviceView<SessionRuntime>(ACTSPACE_SERVICE_IDS.sessionRuntime);
export const TRANSCRIPT_STORAGE_VIEW = serviceView<SessionStorage>(ACTSPACE_SERVICE_IDS.sessionStorage);
export const TRANSCRIPT_HOST_VIEW = serviceView<HostSession>(ACTSPACE_SERVICE_IDS.hostSession);

export const inject = Object.freeze(["actspace.host.session", "session.runtime", "session.storage"]);

const PROJECTION = Symbol("actspace.session-transcript");
const SUBAGENT_FACTS = Symbol("actspace.session-transcript.subagents");
const NO_SUBAGENTS: Readonly<Record<string, TranscriptSubagentFacts>> = Object.freeze({});
const HEADER_READ_LIMIT = 1024 * 1024;

const TITLE_EVENTS = new Set(["session/title-set", "session/title"]);

/**
 * Keeps `sessions-v2/<id>/transcript.md` in step with the Journal (rewritten at
 * every Turn end, again when the title changes between Turns, and whenever
 * `refresh` is called) and tells main agents where those transcripts live.
 */
export class SessionTranscriptService {
  readonly #running = new Map<string, Promise<void>>();
  readonly #dirty = new Set<string>();
  readonly #prompts = new Map<string, () => void>();
  readonly #branches = new Map<string, TranscriptBranch[]>();
  /** Sessions with a Turn in progress: a title set then is picked up by that Turn's end. */
  readonly #activeTurns = new Set<string>();
  readonly #removeListeners: Array<() => void> = [];
  #branchScan: Promise<void> | undefined;
  #closed = false;

  constructor(private readonly ctx: CordisContext, private readonly dataRoot: string) {
    const service = this;
    const listen = (name: "session/event" | "session/created" | "session/disposed", listener: (...args: never[]) => unknown) => {
      const remove = ctx.on?.(name, containNotification(ctx, listener as never) as never);
      if (typeof remove === "function") this.#removeListeners.push(remove as () => void);
    };
    listen("session/event", function (this: { sessionId?: string } | undefined, event: SessionEventEnvelopeV1) {
      const sessionId = this?.sessionId;
      if (!sessionId || !event) return;
      if (event.type === "turn/start") service.#activeTurns.add(sessionId);
      else if (event.type === "turn/end") { service.#activeTurns.delete(sessionId); return service.render(sessionId); }
      // The generated title usually lands after a short first Turn has ended; a manual rename can come any time.
      else if (TITLE_EVENTS.has(event.type)) return service.#retitle(sessionId);
      // A rewind replaced the Journal under a fresh handle; the transcript follows the shorter history.
      else if (event.type === "session/rewound") return service.render(sessionId);
    });
    listen("session/created", (payload: { sessionId: string }) => this.#created(payload.sessionId));
    listen("session/disposed", (payload: { sessionId: string }) => { this.#activeTurns.delete(payload.sessionId); this.#detachPrompt(payload.sessionId); });
  }

  get root(): string { return sessionsRoot(this.dataRoot); }

  hasPrompt(sessionId: string): boolean { return this.#prompts.has(sessionId); }

  /**
   * Rewrite one transcript now, even mid-Turn (calls without a result show `→ running`).
   * The subagent module calls this when an activation starts, after each child `step/end`, and when it settles.
   */
  refresh(sessionId: string): Promise<void> { return this.render(sessionId); }

  /** Rewrite one transcript; overlapping requests for the same Session coalesce into one extra pass. */
  render(sessionId: string): Promise<void> {
    const running = this.#running.get(sessionId);
    if (running) { this.#dirty.add(sessionId); return running; }
    const run = (async () => {
      do { this.#dirty.delete(sessionId); await this.#write(sessionId); } while (this.#dirty.has(sessionId) && !this.#closed);
    })().finally(() => { this.#running.delete(sessionId); });
    this.#running.set(sessionId, run);
    return run;
  }

  /**
   * Only between Turns, and only once a Turn has written the file: rewriting
   * mid-Turn would publish half a Turn, and before the first Turn there is
   * nothing to show but the title (that Turn's end writes it anyway).
   */
  #retitle(sessionId: string): Promise<void> | undefined {
    if (this.#activeTurns.has(sessionId)) return undefined;
    let target: string;
    try { target = transcriptPath(this.dataRoot, sessionId); } catch { return undefined; }
    return existsSync(target) ? this.render(sessionId) : undefined;
  }

  async #write(sessionId: string): Promise<void> {
    // `turn/end` is observed inside the Session's serialized append; leave it before projecting.
    await new Promise<void>(resolve => setImmediate(resolve));
    if (this.#closed) return;
    const target = transcriptPath(this.dataRoot, sessionId);
    // Ephemeral sessions have no directory and get no transcript.
    if (!existsSync(join(dirname(target), "journal.jsonl"))) return;
    const loaded = await this.#load(sessionId);
    if (!loaded) return;
    const branches = await this.#branchesOf(sessionId);
    const subagent = await this.#subagentFacts(loaded.header);
    await writeAtomic(target, renderTranscript(loaded.header, loaded.state, branches, subagent));
    for (const child of loaded.state.children) if (await this.#stale(child)) await this.render(child);
  }

  async #load(sessionId: string): Promise<{ header: SessionHeaderV1; state: TranscriptState } | undefined> {
    const live = getService(this.ctx, TRANSCRIPT_SESSIONS_VIEW)?.getOpen(sessionId);
    if (live) {
      const inherited = inheritedThroughSeq(live.header);
      return { header: live.header, state: live.journal.project(PROJECTION, () => EMPTY_TRANSCRIPT, (state, event) => reduceTranscript(state, event, inherited)) };
    }
    const snapshot = await this.#storage().inspect(sessionId);
    if (!snapshot.header) return undefined;
    return { header: snapshot.header, state: foldTranscript(snapshot.events, inheritedThroughSeq(snapshot.header)) };
  }

  /** Description, preset and model of a subagent live in its parent's Journal; old delegations have none. */
  async #subagentFacts(header: SessionHeaderV1): Promise<TranscriptSubagentFacts | undefined> {
    const lineage = header.lineage;
    if (lineage?.origin !== "delegation") return undefined;
    const live = getService(this.ctx, TRANSCRIPT_SESSIONS_VIEW)?.getOpen(lineage.parentSessionId);
    if (live) return live.journal.project(SUBAGENT_FACTS, () => NO_SUBAGENTS, reduceSubagentFacts)[header.sessionId];
    const parent = await this.#storage().inspect(lineage.parentSessionId).catch(() => undefined);
    let facts = NO_SUBAGENTS;
    for (const event of parent?.events ?? []) facts = reduceSubagentFacts(facts, event);
    return facts[header.sessionId];
  }

  /** A delegated child is rewritten only when its Journal is newer than its transcript. */
  async #stale(sessionId: string): Promise<boolean> {
    let target: string;
    try { target = transcriptPath(this.dataRoot, sessionId); } catch { return false; }
    const [journal, transcript] = await Promise.all([stat(join(dirname(target), "journal.jsonl")).catch(() => null), stat(target).catch(() => null)]);
    return journal !== null && (transcript === null || transcript.mtimeMs < journal.mtimeMs);
  }

  async #created(sessionId: string): Promise<void> {
    const session = getService(this.ctx, TRANSCRIPT_SESSIONS_VIEW)?.getOpen(sessionId);
    if (!session) return;
    const lineage = session.header.lineage;
    if (lineage?.origin !== "delegation") this.#attachPrompt(sessionId);
    if (lineage && lineage.origin !== "delegation") {
      await this.#ensureBranchIndex();
      // A new side chat or fork adds a mark to the parent's existing transcript.
      if (this.#noteBranch(session.header) && existsSync(transcriptPath(this.dataRoot, lineage.parentSessionId))) await this.render(lineage.parentSessionId);
    }
  }

  #attachPrompt(sessionId: string): void {
    if (this.#prompts.has(sessionId) || this.#closed) return;
    const extensions = getService(this.ctx, PROMPT_HOST_PORT)?.extensions;
    if (!extensions) return;
    const section = sessionHistorySection(this.root);
    this.#prompts.set(sessionId, extensions.registerMainSession(sessionId, {
      id: PROMPT_ID, owner: PLUGIN_ID, order: 100, criticality: "optional", fields: ["system"],
      get: (context, write) => {
        // Chat mode has no file tools to read a transcript with.
        if (runtimeInfo(context).mode === "chat") return;
        write({ system: { sections: [{ id: PROMPT_ID, owner: PLUGIN_ID, order: 4800, content: section }], modelFacts: [] } });
      },
    }));
  }

  #detachPrompt(sessionId: string): void {
    this.#prompts.get(sessionId)?.();
    this.#prompts.delete(sessionId);
  }

  async #branchesOf(sessionId: string): Promise<readonly TranscriptBranch[]> {
    await this.#ensureBranchIndex();
    return this.#branches.get(sessionId) ?? [];
  }

  /** Headers never change, so one scan per process plus `session/created` keeps the index current. */
  #ensureBranchIndex(): Promise<void> {
    this.#branchScan ??= (async () => {
      for (const sessionId of await this.#storage().listSessionIds()) {
        const header = await readHeader(join(this.root, sessionId, "journal.jsonl"));
        if (header) this.#noteBranch(header);
      }
    })();
    return this.#branchScan;
  }

  #noteBranch(header: SessionHeaderV1): boolean {
    const lineage = header.lineage;
    if (!lineage || lineage.origin === "delegation") return false;
    const list = this.#branches.get(lineage.parentSessionId) ?? [];
    if (list.some(item => item.sessionId === header.sessionId)) return false;
    list.push({ sessionId: header.sessionId, origin: lineage.origin, boundarySeq: lineage.parentBoundarySeq, createdAt: header.createdAt });
    list.sort((a, b) => a.boundarySeq - b.boundarySeq || a.sessionId.localeCompare(b.sessionId));
    this.#branches.set(lineage.parentSessionId, list);
    return true;
  }

  #storage(): SessionStorage {
    const storage = getService(this.ctx, TRANSCRIPT_STORAGE_VIEW);
    if (!storage) throw new Error("Session transcripts require session.storage.");
    return storage;
  }

  async dispose(): Promise<void> {
    this.#closed = true;
    this.#activeTurns.clear();
    for (const remove of this.#removeListeners.splice(0)) remove();
    for (const remove of this.#prompts.values()) remove();
    this.#prompts.clear();
    await Promise.allSettled([...this.#running.values()]);
  }
}

export const SESSION_TRANSCRIPT_SERVICE = serviceKey<SessionTranscriptService>("session.transcript");

async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

/** Read only the first JSONL line; the header is small even when the Journal is large. */
async function readHeader(path: string): Promise<SessionHeaderV1 | undefined> {
  const file = await open(path, "r").catch(() => undefined);
  if (!file) return undefined;
  try {
    const chunks: Buffer[] = [];
    let total = 0;
    while (total < HEADER_READ_LIMIT) {
      const buffer = Buffer.alloc(64 * 1024);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, total);
      if (bytesRead === 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      const newline = chunk.indexOf(0x0a);
      chunks.push(newline === -1 ? chunk : chunk.subarray(0, newline));
      total += bytesRead;
      if (newline !== -1) break;
    }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Partial<SessionHeaderV1>;
    return value.recordKind === "header" && typeof value.sessionId === "string" ? value as SessionHeaderV1 : undefined;
  } catch { return undefined; } finally { await file.close(); }
}

export function apply(ctx: CordisContext): void {
  const host = getService(ctx, TRANSCRIPT_HOST_VIEW);
  if (!host?.dataRoot) throw new Error("Session transcripts require actspace.host.session.dataRoot.");
  const service = new SessionTranscriptService(ctx, host.dataRoot);
  provideService(ctx, SESSION_TRANSCRIPT_SERVICE, service);
  ctx.effect?.(() => () => service.dispose(), "session-transcript");
}
