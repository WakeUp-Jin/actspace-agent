import { expect, it, vi } from "vitest";
import { SessionJournal, createCoreCodecRegistry, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { codecs, CONTEXT_OWNER, STATE_EVENT, SUPPLEMENT_EVENT } from "@actspace/context-engine/codec";
import {
  ContextCompactionCoordinator,
  ContextSupplements,
  type CompactionSession,
  type Context,
} from "@actspace/context-engine";
import { emptyDisclosureState, registerPaths, applyStateEvent, candidatePaths } from "@actspace/context-engine/state";
import { DISCLOSURE_OWNER, ProgressiveDisclosure, batchReferences, createDisclosureSource } from "../plugin.js";
import { selectActive } from "../policy.js";
import { collectPathHints, type DisclosureHost } from "../paths.js";

function fixture(seed: readonly SessionEventEnvelopeV1[] = [], sessionId = "s", origin?: string): CompactionSession {
  const registry = createCoreCodecRegistry();
  codecs.forEach((codec) => {
    registry.register(codec);
  });
  const journal = new SessionJournal({ registry, seed });
  return {
    header: { sessionId, lineage: origin ? { origin } : null },
    journal,
    get lastSeq() {
      return journal.lastSeq;
    },
    append: async (value) => journal.append(value),
    appendMany: async (values) => journal.appendMany(values),
    flush: async () => {},
  };
}
function context(session: CompactionSession): Context {
  return {
    request: { sessionId: session.header.sessionId, requestId: "r", routeId: "r", model: "m", options: {} },
    content: {
      system: { sections: [], modelFacts: [] },
      conversation: session.journal.surface,
      supplements: [],
      tools: [],
    },
    status: { throughJournalSeq: session.lastSeq, cycle: 0, paths: [], facts: [], plugins: {} },
  };
}
function host() {
  const indexes = new Map<string, string>();
  const port: DisclosureHost = {
    normalizeFile: async (_id, path) => (path.startsWith("/file/") ? path : undefined),
    historyPath: async (id) => `/history/${id}.jsonl`,
    createIndex: vi.fn(async (_id, text) => {
      const artifactId = `index-${indexes.size}`;
      indexes.set(artifactId, text);
      return { artifactId, mediaType: "text/plain", size: text.length, sha256: "hash" };
    }),
    resolveArtifact: async (_id, id) => {
      if (!indexes.has(id)) throw Error("missing");
      return { path: `/index/${id}`, mediaType: "text/plain" };
    },
  };
  return { port, indexes };
}
async function users(session: CompactionSession, count = 4) {
  for (let i = 0; i < count; i++) {
    const messageId = `m${session.lastSeq + 1}`;
    await session.append({
      type: "user/message",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: { messageId, content: `/file/${i}.ts` },
      surface: { kind: "append" },
    });
  }
}
async function fact(session: CompactionSession, paths: string[], reads = true) {
  await session.append({
    type: STATE_EVENT,
    eventVersion: 1,
    source: { ownerPluginId: CONTEXT_OWNER },
    data: {
      op: "fact",
      sourceSeq: session.lastSeq,
      callId: `call${session.lastSeq}`,
      time: new Date().toISOString(),
      paths: paths.map((path) => ({ path, owner: "actspace.context-tools", read: reads })),
    },
    surface: null,
  });
}
function coordinator(
  disclosure: ProgressiveDisclosure,
  summarize = vi.fn(async () => ({ content: "Summary\n## Relevant files / directories\n/file/0.ts" })),
) {
  const value = new ContextCompactionCoordinator();
  value.registerDisclosure(disclosure);
  value.register({
    shouldCompact: () => true,
    select: (ctx) =>
      ctx.content.conversation.entries.length > 1
        ? { start: 0, end: ctx.content.conversation.entries.length - 1 }
        : null,
    summarize,
  });
  return { value, summarize };
}

it.each([0, 1, 100, 101, 10000])("caps %i files and batches durable candidates below 256 KiB", (count) => {
  const paths = Array.from({ length: count }, (_, i) => ({
    path: `/file/${String(i).padStart(6, "0")}.ts`,
    owner: "tools",
  }));
  const state = emptyDisclosureState();
  registerPaths(state, paths);
  expect([...state.paths.values()].filter((path) => path.visibility === "active")).toHaveLength(Math.min(count, 100));
  expect(selectActive([...state.paths.values()], 0)).toHaveLength(Math.min(count, 100));
  for (const batch of batchReferences(paths)) expect(Buffer.byteLength(JSON.stringify(batch))).toBeLessThan(256 * 1024);
  state.cycle++;
  expect(selectActive([...state.paths.values()], state.cycle)).toEqual([]);
});

it("sleeping reads wait for the next successful compaction; restart and fork preserve independent counters", async () => {
  const session = fixture();
  await users(session);
  const { port } = host();
  let disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  await fact(
    session,
    Array.from({ length: 101 }, (_, i) => `/file/${String(i).padStart(3, "0")}.ts`),
    false,
  );
  let view = await disclosure.hydrate(context(session), session);
  const sleeping = view.status.paths.find((path) => path.visibility === "sleeping")!;
  await fact(session, [sleeping.path]);
  disclosure = new ProgressiveDisclosure(port);
  view = await disclosure.hydrate(context(session), session);
  expect(view.status.paths.find((path) => path.id === sleeping.id)).toMatchObject({
    visibility: "sleeping",
    readsInCycle: 1,
  });
  const child = fixture(session.journal.events, "child");
  const childDisclosure = new ProgressiveDisclosure(port);
  await childDisclosure.hydrate(context(child), child);
  await fact(child, [sleeping.path]);
  expect(
    (await childDisclosure.hydrate(context(child), child)).status.paths.find((path) => path.id === sleeping.id)
      ?.readsInCycle,
  ).toBe(2);
  const { value } = coordinator(disclosure);
  await value.compact(session);
  view = await disclosure.hydrate(context(session), session);
  expect(view.status.paths.find((path) => path.id === sleeping.id)).toMatchObject({
    visibility: "active",
    readsInCycle: 0,
  });
  expect(view.status.cycle).toBe(1);
  expect((await childDisclosure.hydrate(context(child), child)).status.cycle).toBe(0);
  const history = view.status.paths.find((path) => path.history)!;
  expect(history.path).toBe("/history/s.jsonl");
  expect(history.history?.sourceEventSeqs).toEqual([0, 1, 2]);
});

it("repairs a committed summary after index failure without summarizing or clearing counts twice", async () => {
  const session = fixture();
  await users(session);
  const { port } = host();
  let disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  await fact(
    session,
    Array.from({ length: 101 }, (_, i) => `/file/${i}.ts`),
  );
  const { value, summarize } = coordinator(disclosure);
  vi.mocked(port.createIndex).mockRejectedValueOnce(Error("disk unavailable"));
  await expect(value.compact(session)).rejects.toThrow("disk unavailable");
  expect(session.journal.events.filter((event) => event.type === "compaction/end")).toHaveLength(1);
  disclosure = new ProgressiveDisclosure(port);
  const recovery = coordinator(disclosure, summarize);
  expect(await recovery.value.compact(session)).toBe(true);
  expect(summarize).toHaveBeenCalledTimes(1);
  const view = await disclosure.hydrate(context(session), session);
  expect(view.status.cycle).toBe(1);
  const seq = session.lastSeq;
  await disclosure.hydrate(context(session), session);
  expect(session.lastSeq).toBe(seq);
});

it("does not apply orphan candidates or failed summaries, and rejects a changed Surface", async () => {
  const session = fixture();
  await users(session);
  const { port } = host();
  const disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  await fact(session, ["/file/0.ts"]);
  await disclosure.prepare(session, context(session), { start: 0, end: 2 }, { content: "summary" }, "orphan");
  expect(await disclosure.recover(session)).toBe(false);
  const failure = coordinator(
    disclosure,
    vi.fn(async () => {
      throw Error("provider failed");
    }),
  );
  await expect(failure.value.compact(session)).rejects.toThrow("provider failed");
  const changed = coordinator(
    disclosure,
    vi.fn(async () => {
      await users(session, 1);
      return { content: "stale summary" };
    }),
  );
  expect(await changed.value.compact(session)).toBe(false);
  const view = await disclosure.hydrate(context(session), session);
  expect(view.status.cycle).toBe(0);
  expect(view.status.paths[0]?.readsInCycle).toBe(1);
  expect(session.journal.events.some((event) => event.type === "compaction/end")).toBe(false);
});

it("registers only trusted successful reads and never counts indexes or duplicate results", async () => {
  const session = fixture();
  const { port } = host();
  const disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  const event = {
    seq: session.lastSeq + 1,
    type: "tool/result",
    time: new Date().toISOString(),
    data: {
      status: "completed",
      callId: "call",
      pluginId: "actspace.filesystem-read",
      name: "read_file",
      detail: [{ label: "actspace.context.file", value: { path: "/file/a.ts", kind: "file", operation: "read" } }],
    },
  } as unknown as SessionEventEnvelopeV1;
  await disclosure.observe(session, { ...event, data: { ...(event.data as object), status: "failed" } });
  await disclosure.observe(session, { ...event, data: { ...(event.data as object), pluginId: "untrusted" } });
  expect((await disclosure.hydrate(context(session), session)).status.paths).toHaveLength(0);
  const successful = { ...event, seq: session.lastSeq + 1 };
  await disclosure.observe(session, successful);
  await disclosure.observe(session, successful);
  expect((await disclosure.hydrate(context(session), session)).status.paths[0]?.readsInCycle).toBe(1);
});

it("collects relative file hints including bare filenames without altering the summary", () => {
  expect(collectPathHints("## Relevant files / directories\n- AGENTS.md\n- src/file.ts\n- /file/absolute.ts")).toEqual(
    expect.arrayContaining(["AGENTS.md", "src/file.ts", "/file/absolute.ts"]),
  );
});

it("collects paths from real read_file numbered lines", () => {
  const output = "     1|/file/absolute.ts\n     2|src/relative.ts\n     3|AGENTS.md\n     4|ordinary words";
  expect(collectPathHints(output)).toEqual(
    expect.arrayContaining(["/file/absolute.ts", "src/relative.ts", "AGENTS.md"]),
  );
  expect(collectPathHints(output)).not.toContain("ordinary words");
});

it("keeps the inherited navigation list in a forked subagent but drops it in a user fork", async () => {
  const session = fixture();
  await users(session, 2);
  const { port } = host();
  await new ContextSupplements(session).put({
    op: "add",
    id: "navigation",
    owner: DISCLOSURE_OWNER,
    text: "Current active context files",
    afterEventSeq: session.lastSeq,
    lifetime: "persistent",
  });
  await new ProgressiveDisclosure(port).hydrate(context(session), session);
  const navigation = (child: CompactionSession) =>
    child.journal.events
      .filter((event) => event.type === SUPPLEMENT_EVENT)
      .map((event) => (event.data as { op: string }).op);
  // agent_fork: the copied prefix stays byte for byte the parent's, so the provider cache keeps hitting.
  const forked = fixture(session.journal.events, "forked", "delegation");
  await new ProgressiveDisclosure(port).hydrate(context(forked), forked);
  expect(navigation(forked)).toEqual(["add"]);
  expect(
    forked.journal.events.some((event) => event.type === STATE_EVENT && (event.data as { op: string }).op === "fork"),
  ).toBe(true);
  const userFork = fixture(session.journal.events, "user-fork", "fork");
  await new ProgressiveDisclosure(port).hydrate(context(userFork), userFork);
  expect(navigation(userFork)).toEqual(["add", "remove"]);
});

it("does not replay an ignored pre-compaction read into a fork's new cycle", async () => {
  const session = fixture();
  await users(session);
  const { port } = host();
  const disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  const oldSeq = session.lastSeq + 1;
  await users(session, 1);
  await coordinator(disclosure).value.compact(session);
  const child = fixture(session.journal.events, "child");
  const replay = new ProgressiveDisclosure(port);
  await replay.hydrate(context(child), child);
  const read = (seq: number) =>
    ({
      seq,
      type: "tool/result",
      time: new Date().toISOString(),
      data: {
        status: "completed",
        callId: `read-${seq}`,
        pluginId: "actspace.filesystem-read",
        name: "read_file",
        detail: [
          { label: "actspace.context.file", value: { path: "/file/old-index.txt", kind: "file", operation: "read" } },
        ],
      },
    }) as unknown as SessionEventEnvelopeV1;
  await replay.observe(child, read(oldSeq));
  expect(
    (await replay.hydrate(context(child), child)).status.paths.some((path) => path.path === "/file/old-index.txt"),
  ).toBe(false);
  await replay.observe(child, read(child.lastSeq + 1));
  expect(
    (await replay.hydrate(context(child), child)).status.paths.find((path) => path.path === "/file/old-index.txt")
      ?.readsInCycle,
  ).toBe(1);
});

it("excludes navigation indexes from summary and history candidates", async () => {
  const session = fixture();
  await users(session);
  const { port } = host();
  port.normalizeFile = async (_id, path) => (path.startsWith("/") ? path : undefined);
  const disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  await fact(
    session,
    Array.from({ length: 101 }, (_, i) => `/file/${i}.ts`),
    false,
  );
  const before = await disclosure.hydrate(context(session), session);
  const indexPath = before.status.sleepingDirectory!.path;
  await disclosure.prepare(
    session,
    context(session),
    { start: 0, end: 3 },
    { content: `summary ${indexPath}`, pathlist: [indexPath, "/file/kept.ts"] },
    "exclude-index",
  );
  const state = emptyDisclosureState();
  session.journal.events.forEach((event) => {
    applyStateEvent(state, event);
  });
  expect(candidatePaths(state, "exclude-index")!.map((path) => path.path)).toContain("/file/kept.ts");
  expect(candidatePaths(state, "exclude-index")!.map((path) => path.path)).not.toContain(indexPath);
});

it("persists ignored index reads across restart and fork before another compaction", async () => {
  const session = fixture();
  await users(session);
  const { port } = host();
  port.normalizeFile = async (_id, path) => (path.startsWith("/") ? path : undefined);
  const disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  await fact(
    session,
    Array.from({ length: 101 }, (_, i) => `/file/${i}.ts`),
    false,
  );
  const view = await disclosure.hydrate(context(session), session);
  const indexPath = view.status.sleepingDirectory!.path;
  await session.append({
    type: "turn/start",
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data: { turnId: "t" },
    surface: null,
  });
  await session.append({
    type: "step/start",
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data: { turnId: "t", stepId: "s" },
    surface: null,
  });
  await session.append({
    type: "request/header",
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data: { requestId: "r", turnId: "t", stepId: "s" },
    surface: null,
  });
  await session.append({
    type: "request/system-prompt",
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data: {
      requestId: "r",
      turnId: "t",
      stepId: "s",
      digest: "p",
      sections: [],
      modelFacts: [],
      contributorProvenance: [{ contributorId: "context-disclosure" }],
    },
    surface: null,
  });
  await session.append({
    type: "request/context",
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data: { requestId: "r", turnId: "t", stepId: "s", snapshot: { schemaVersion: 3 } },
    surface: null,
  });
  await session.append({
    type: "tool/call",
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data: { callId: "read-index", name: "read_file" },
    surface: null,
  });
  const result = await session.append({
    type: "tool/result",
    eventVersion: 1,
    source: { ownerPluginId: "@actspace/core" },
    data: {
      callId: "read-index",
      name: "read_file",
      status: "completed",
      pluginId: "actspace.filesystem-read",
      detail: [{ label: "actspace.context.file", value: { path: indexPath, kind: "file", operation: "read" } }],
    },
    surface: null,
  });
  await disclosure.observe(session, result);
  const recorded = session.journal.events.filter(
    (event) =>
      event.type === STATE_EVENT && (event.data as any).op === "fact" && (event.data as any).sourceSeq === result.seq,
  );
  expect(recorded).toHaveLength(1);
  expect((recorded[0].data as any).paths).toEqual([]);
  const child = fixture(session.journal.events, "child");
  const childPort = {
    ...port,
    resolveArtifact: async (_id: string, id: string) => ({ path: `/child-index/${id}`, mediaType: "text/plain" }),
  };
  const replay = new ProgressiveDisclosure(childPort);
  const childView = await replay.hydrate(context(child), child);
  expect(childView.status.paths.map((path) => path.path)).not.toContain(indexPath);
  expect(childView.status.paths.every((path) => path.readsInCycle === 0)).toBe(true);
  const restarted = new ProgressiveDisclosure(childPort);
  expect((await restarted.hydrate(context(child), child)).status.paths).toEqual(childView.status.paths);
  expect((await disclosure.hydrate(context(session), session)).status.paths).toEqual(view.status.paths);
});

it("adds index identities to legacy state without serializing internal Maps", async () => {
  const session = fixture();
  const { port } = host();
  const disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  await fact(
    session,
    Array.from({ length: 101 }, (_, i) => `/file/${i}.ts`),
    false,
  );
  const before = await disclosure.hydrate(context(session), session);
  const legacy = session.journal.events.map((event) => {
    const copy = JSON.parse(JSON.stringify(event));
    if (copy.type === STATE_EVENT) delete copy.data.indexPaths;
    return copy;
  });
  const restored = fixture(legacy);
  const view = await new ProgressiveDisclosure(port).hydrate(context(restored), restored);
  expect(view.status.paths).toEqual(before.status.paths);
  expect(view.status.sleepingDirectory?.artifactId).toBe(before.status.sleepingDirectory?.artifactId);
  expect(restored.lastSeq).toBe(session.lastSeq + 1);
});

it("replays every durable cut around the four-event transaction and applies exactly once", async () => {
  const session = fixture();
  await users(session);
  const { port } = host();
  const disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  const { value } = coordinator(disclosure);
  await value.compact(session);
  const events = session.journal.events;
  const start = events.findIndex((event) => event.type === "compaction/start");
  const end = events.findIndex((event) => event.type === "compaction/end");
  expect(end - start).toBe(3);
  for (const cut of [start - 1, start, start + 1, start + 2]) {
    const recovered = fixture(events.slice(0, cut + 1));
    expect(recovered.journal.surface.replaceGeneration).toBe(0);
    expect(await new ProgressiveDisclosure(port).recover(recovered)).toBe(false);
  }
  for (const cut of [end, events.length - 1]) {
    const recovered = fixture(events.slice(0, cut + 1));
    const replay = new ProgressiveDisclosure(port);
    await replay.recover(recovered);
    const seq = recovered.lastSeq;
    expect(await replay.recover(recovered)).toBe(false);
    expect(recovered.lastSeq).toBe(seq);
    expect((await replay.hydrate(context(recovered), recovered)).status.cycle).toBe(1);
    expect(
      recovered.journal.events.filter(
        (event) => event.type === STATE_EVENT && (event.data as { op?: string }).op === "applied",
      ),
    ).toHaveLength(1);
  }
});

it("does not regenerate an index for read counts and removes navigation owned only by disabled sources", async () => {
  const session = fixture();
  const { port } = host();
  const disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  await fact(
    session,
    Array.from({ length: 101 }, (_, i) => `/file/${i}.ts`),
    false,
  );
  const first = await disclosure.hydrate(context(session), session);
  const artifact = first.status.sleepingDirectory!.artifactId;
  await fact(session, [first.status.paths[0].path]);
  expect((await disclosure.hydrate(context(session), session)).status.sleepingDirectory!.artifactId).toBe(artifact);
  expect(port.createIndex).toHaveBeenCalledTimes(1);
  const base = context(session);
  const hidden = {
    ...base,
    status: { ...base.status, plugins: { "actspace.context.owners": ["actspace.context-disclosure"] } },
  };
  const result = await disclosure.hydrate(hidden, session);
  expect(result.status.paths).toEqual([]);
  expect(result.status.sleepingDirectory).toBeUndefined();
});

it("stores 10000 references in bounded batches while rendering at most 100 active files and one index", async () => {
  const { createDisclosureSource } = await import("../plugin.js");
  const session = fixture();
  await users(session);
  const { port, indexes } = host();
  const disclosure = new ProgressiveDisclosure(port);
  const value = new ContextCompactionCoordinator();
  value.registerDisclosure(disclosure);
  value.register({
    shouldCompact: () => true,
    select: () => ({ start: 0, end: 3 }),
    summarize: async () => ({
      content: "summary",
      pathlist: Array.from({ length: 10000 }, (_, i) => `/file/${String(i).padStart(6, "0")}.ts`),
    }),
  });
  await value.compact(session);
  const view = await disclosure.hydrate(context(session), session);
  let text = "";
  await createDisclosureSource().get(view, (output) => {
    text = output.supplements![0].text;
  });
  expect(text.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(100);
  expect(text.match(/Sleeping references index/g)).toHaveLength(1);
  expect([...indexes.values()][0].split("\n").filter((line) => line.startsWith("- "))).toHaveLength(9904); // 10000 explicit refs + three original-message files + raw Journal - 100 active.
  const candidates = session.journal.events.filter(
    (event) => event.type === STATE_EVENT && (event.data as { op?: string }).op === "candidate",
  );
  expect(candidates.length).toBeGreaterThan(1);
  const partial = emptyDisclosureState();
  applyStateEvent(partial, candidates[0]);
  expect(candidatePaths(partial, (candidates[0].data as { compactionId: string }).compactionId)).toBeUndefined();
  for (const event of candidates) expect(Buffer.byteLength(JSON.stringify(event))).toBeLessThan(256 * 1024);
});

it.each(["candidate-flush", "applied-append"])("recovers %s failure at the durable boundary", async (fault) => {
  const base = fixture();
  await users(base);
  const { port } = host();
  const disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(base), base);
  await fact(
    base,
    Array.from({ length: 101 }, (_, i) => `/file/${i}.ts`),
  );
  let failed = false;
  const session: CompactionSession = {
    ...base,
    get lastSeq() {
      return base.lastSeq;
    },
    append: async (event) => {
      if (fault === "applied-append" && !failed && (event.data as { op?: string }).op === "applied") {
        failed = true;
        throw Error("injected");
      }
      return base.append(event);
    },
    flush: async () => {
      if (
        fault === "candidate-flush" &&
        !failed &&
        (base.journal.events.at(-1)?.data as { op?: string } | undefined)?.op === "candidate"
      ) {
        failed = true;
        throw Error("injected");
      }
    },
  };
  const { value, summarize } = coordinator(disclosure);
  await expect(value.compact(session)).rejects.toThrow("injected");
  const end = base.journal.events.some((event) => event.type === "compaction/end");
  expect(end).toBe(fault === "applied-append");
  const restored = fixture(base.journal.events);
  const recovery = new ProgressiveDisclosure(port);
  expect(await recovery.recover(restored)).toBe(end);
  expect((await recovery.hydrate(context(restored), restored)).status.cycle).toBe(end ? 1 : 0);
  expect(summarize).toHaveBeenCalledTimes(1);
});

function traceResult(seq: number, pluginId: string, detail: readonly unknown[], status = "completed") {
  return {
    seq,
    type: "tool/result",
    time: new Date().toISOString(),
    data: { status, callId: `trace-${seq}`, pluginId, name: "anything", detail },
  } as unknown as SessionEventEnvelopeV1;
}
const trace = (path: string, description: string) => ({
  label: "actspace.context.trace",
  value: { kind: "trace", path, description },
});

it("registers trace files from any plugin's completed result with their description, skipping missing files", async () => {
  const session = fixture();
  const { port } = host();
  const disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  await disclosure.observe(
    session,
    traceResult(session.lastSeq + 1, "actspace.tool-subagent", [
      trace("/file/agents/child.md", "Subagent transcript: review the diff"),
    ]),
  );
  await disclosure.observe(
    session,
    traceResult(session.lastSeq + 1, "some.third-party", [
      trace("/missing/bash_1.log", "gone"),
      trace("/file/logs/bash_2.log", "Bash log: pnpm test"),
      { label: "actspace.context.trace", value: { kind: "file", path: "/file/not-a-trace.ts" } },
    ]),
  );
  await disclosure.observe(
    session,
    traceResult(session.lastSeq + 1, "some.third-party", [trace("/file/failed.md", "failed call")], "failed"),
  );
  const view = await disclosure.hydrate(context(session), session);
  expect(view.status.paths.map((path) => [path.path, path.description, path.readsInCycle, path.visibility])).toEqual([
    ["/file/agents/child.md", "Subagent transcript: review the diff", 0, "active"],
    ["/file/logs/bash_2.log", "Bash log: pnpm test", 0, "active"],
  ]);
  let navigation = "";
  await createDisclosureSource().get(view, (value) => {
    navigation = (value.supplements as readonly { text: string }[])[0].text;
  });
  expect(navigation).toContain('"/file/agents/child.md" — Subagent transcript: review the diff');
  // A fresh disclosure over the same Journal (restart) folds the durable facts into the same paths.
  const replayed = await new ProgressiveDisclosure(port).hydrate(context(session), session);
  expect(replayed.status.paths).toEqual(view.status.paths);
});

it("keeps a trace description when the same file is also reported as a plain read", async () => {
  const session = fixture();
  const { port } = host();
  const disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  const event = {
    seq: session.lastSeq + 1,
    type: "tool/result",
    time: new Date().toISOString(),
    data: {
      status: "completed",
      callId: "both",
      pluginId: "actspace.filesystem-read",
      name: "read_file",
      detail: [
        trace("/file/t.md", "Subagent transcript: t"),
        { label: "actspace.context.file", value: { path: "/file/t.md", kind: "file", operation: "read" } },
      ],
    },
  } as unknown as SessionEventEnvelopeV1;
  await disclosure.observe(session, event);
  expect((await disclosure.hydrate(context(session), session)).status.paths).toMatchObject([
    { path: "/file/t.md", description: "Subagent transcript: t", readsInCycle: 1 },
  ]);
});

it("tracks reads only while the effective prompt record lists disclosure as a contributor", async () => {
  const core = { ownerPluginId: "@actspace/core" };
  const session = fixture();
  const { port } = host();
  const disclosure = new ProgressiveDisclosure(port);
  await disclosure.hydrate(context(session), session);
  const append = (type: string, data: Record<string, unknown>) =>
    session.append({ type, eventVersion: 1, source: core, data: data as never, surface: null });
  let call = 0;
  const request = async (id: string, contributors: string[] | null) => {
    await append("turn/start", { turnId: id });
    await append("step/start", { turnId: id, stepId: id });
    await append("request/header", { requestId: id, turnId: id, stepId: id });
    // 提示词没变的请求不写 request/system-prompt，沿用前一条。
    if (contributors)
      await append("request/system-prompt", {
        requestId: id,
        turnId: id,
        stepId: id,
        digest: contributors.join(),
        sections: [],
        modelFacts: [],
        contributorProvenance: contributors.map((contributorId) => ({ contributorId })),
      });
    await append("request/context", { requestId: id, turnId: id, stepId: id, snapshot: { schemaVersion: 3 } });
    await append("assistant/message", {
      requestId: id,
      turnId: id,
      stepId: id,
      messageId: `a-${id}`,
      finishReason: "tool-calls",
      content: [],
    });
    const callId = `read-${call++}`;
    await append("tool/call", { turnId: id, stepId: id, callId, name: "read_file" });
    await append("tool/result", {
      callId,
      name: "read_file",
      status: "completed",
      pluginId: "actspace.filesystem-read",
      detail: [{ label: "actspace.context.file", value: { path: `/file/${id}.ts`, kind: "file", operation: "read" } }],
    });
    await append("step/end", { turnId: id, stepId: id, status: "completed" });
    await append("turn/end", { turnId: id, status: "completed" });
  };
  await request("off", ["context-rules"]);
  await request("on", ["context-rules", "context-disclosure"]);
  await request("same", null);
  await request("off-again", ["context-rules"]);
  const view = await disclosure.hydrate(context(session), session);
  expect(view.status.paths.map((path) => path.path).sort()).toEqual(["/file/on.ts", "/file/same.ts"]);
  // 重启后从边界前最近一条提示词记录恢复启用状态，结果一致。
  expect((await new ProgressiveDisclosure(port).hydrate(context(session), session)).status.paths).toEqual(
    view.status.paths,
  );
});
