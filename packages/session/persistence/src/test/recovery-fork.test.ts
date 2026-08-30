import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { createCompactionTransaction, createCoreCodecRegistry } from "@actspace/session-journal";
import type { SessionEventCandidateV1 } from "@actspace/session-journal";
import { applySessionRecovery, planSessionRecovery, repairTornJsonlSession } from "../recovery.js";
import { SessionStore } from "../session-store.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "actspace-recovery-v2-"));
  roots.push(root);
  return root;
}

function candidate(type: string, data: RuntimeV2JsonValue, extra: Partial<SessionEventCandidateV1> = {}): SessionEventCandidateV1 {
  return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null, ...extra };
}

function createdWith(registry: ReturnType<typeof createCoreCodecRegistry>) {
  return {
    profileId: "base",
    runtimeContractVersion: "1",
    manifestDigest: "manifest-sha256",
    plugins: [{ id: "@actspace/core", version: "2.0.0" }],
    codecSetDigest: registry.digest,
  } as const;
}

function headerInput(registry: ReturnType<typeof createCoreCodecRegistry>, sessionId: string) {
  return { sessionId, createdAt: "2026-08-22T12:00:00.000Z", lineage: null, createdWith: createdWith(registry) } as const;
}

describe("conservative Session recovery", () => {
  it.each([
    { dispatched: false, expected: "not-started" },
    { dispatched: true, expected: "outcome-unknown" },
  ])("records $expected for an interrupted tool", async ({ dispatched, expected }) => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    const session = await store.create(headerInput(registry, `tool-${expected}`));
    await session.append(candidate("turn/start", { turnId: "turn-1" }));
    await session.append(candidate("step/start", { turnId: "turn-1", stepId: "step-1" }));
    await session.append(candidate("tool/call", { callId: "call-1", name: "write" }));
    if (dispatched) await session.append(candidate("tool-workflow/run-start", { callId: "call-1" }));
    await session.flush();

    const plan = await applySessionRecovery(session);
    expect(plan?.candidates.some((event) => event.type === "tool/recovery-outcome" && (event.data as { outcome?: string }).outcome === expected)).toBe(true);
    expect(planSessionRecovery(session.journal.events)).toBeNull();
    expect(session.journal.validation.relations.openTurnId).toBeNull();
    expect(session.journal.surface.entries.at(-1)?.node).toMatchObject({ kind: "tool-result", callId: "call-1" });
    await session.close();
  });

  it("resumes an uncommitted repair transaction without duplicating its start", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    const session = await store.create(headerInput(registry, "repair-resume"));
    await session.append(candidate("turn/start", { turnId: "turn-1" }));
    await session.append(candidate("recovery/start", { repairId: "repair-existing", sourceBoundarySeq: 0 }));
    const plan = planSessionRecovery(session.journal.events);
    expect(plan?.repairId).toBe("repair-existing");
    expect(plan?.resumedTransaction).toBe(true);
    expect(plan?.candidates.filter((event) => event.type === "recovery/start")).toHaveLength(0);
    const closer = plan?.candidates.find((event) => event.type === "turn/end");
    expect(closer).toBeDefined();
    await session.append(closer as SessionEventCandidateV1);
    expect(session.journal.validation.relations.openTurnId).toBe("turn-1");
    expect(session.projection.eventCount).toBe(1);
    await applySessionRecovery(session);
    expect(session.journal.events.filter((event) => event.type === "recovery/committed")).toHaveLength(1);
    await session.close();
  });

  it("preserves torn bytes before publishing a repaired complete Journal", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    const session = await store.create(headerInput(registry, "torn-repair"));
    await session.close();
    const original = await readFile(session.layout.journalPath);
    const torn = Buffer.concat([original, Buffer.from('{"partial":')]);
    await writeFile(session.layout.journalPath, torn);
    const inspection = await store.inspect("torn-repair");

    const result = await repairTornJsonlSession({ inspection, registry, runtimeId: "repair-runtime" });
    expect(await readFile(result.forensicPath)).toEqual(torn);
    const repaired = await store.inspect("torn-repair");
    expect(repaired.accessState).toBe("read-write");
    expect(repaired.tornTail).toBeNull();
  });
});

describe("cold fork and compaction provenance", () => {
  it("forks a persisted balanced prefix and rejects an open boundary", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    const parent = await store.create(headerInput(registry, "parent"));
    await parent.append(candidate("turn/start", { turnId: "turn-1" }));
    await parent.append(candidate("turn/end", { turnId: "turn-1", reason: "completed" }));
    await parent.flush();
    await expect(store.fork({ parentSessionId: "parent", boundarySeq: 0, newSessionId: "invalid-child", createdAt: "2026-08-22T12:01:00.000Z", createdWith: createdWith(registry) })).rejects.toThrow("balanced");
    await parent.close();

    const child = await store.fork({ parentSessionId: "parent", boundarySeq: 1, newSessionId: "child", createdAt: "2026-08-22T12:02:00.000Z", createdWith: createdWith(registry) });
    expect(child.header.lineage).toMatchObject({ parentSessionId: "parent", parentBoundarySeq: 1, origin: "fork" });
    expect(child.journal.events).toHaveLength(2);
    await child.close();
  });

  it("compacts Surface by appending one provenance-complete replacement", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    const session = await store.create(headerInput(registry, "compact"));
    await session.append(candidate("user/message", { messageId: "u1" }, { surface: { kind: "append", node: { kind: "user", messageId: "u1", content: "one" } } }));
    await session.append(candidate("assistant/message", { messageId: "a1" }, { surface: { kind: "append", node: { kind: "assistant", messageId: "a1", content: "two" } } }));
    const before = session.journal.events;
    const transaction = createCompactionTransaction({ surface: session.journal.surface, start: 0, end: 2, summary: { kind: "user", messageId: "summary", content: "condensed" }, compactionId: "compact-1", contributorIds: ["summary-provider"], summaryDigest: "sha256-summary" });
    await session.append(transaction[0] as SessionEventCandidateV1);
    await session.append(transaction[1] as SessionEventCandidateV1);
    await session.append(transaction[2] as SessionEventCandidateV1);
    expect(session.journal.surface.entries).toHaveLength(2);
    await session.append(transaction[3] as SessionEventCandidateV1);
    expect(session.journal.events.slice(0, before.length)).toEqual(before);
    expect(session.journal.surface.entries).toHaveLength(1);
    expect(session.journal.surface.entries[0]?.sourceEventSeqs).toEqual([0, 1, 4]);
    await session.close();
  });
});
