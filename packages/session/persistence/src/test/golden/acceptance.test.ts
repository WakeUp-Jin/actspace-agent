import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { EventCodecRegistry, createCoreCodecRegistry } from "@actspace/session-journal";
import type { SessionEventCandidateV1, SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { SessionJournal } from "@actspace/session-journal";
import { SessionStore } from "../../session-store.js";
import { sessionFileLayout } from "../../session.js";
import { SessionWriterLease } from "../../writer-lease.js";

export const GOLDEN_ACCEPTANCE_CASES = Object.freeze([
  "basic-turn-round-trip",
  "ordered-parallel-tools",
  "checkpoint-fail-closed",
  "tool-not-started-recovery",
  "tool-outcome-unknown-recovery",
  "compaction-append-only",
  "codec-access-states",
  "codec-pre-discovery",
  "cross-process-writer-race",
  "writer-failure-fail-closed",
  "torn-tail-idempotent-repair",
  "cold-balanced-fork",
  "manifest-drift-compatible",
  "canonical-raw-jsonl",
  "secret-canary-rejection",
  "v1-data-rejected",
  "durable-inbox-resume",
] as const);

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "actspace-golden-v2-"));
  roots.push(root);
  return root;
}

function candidate(type: string, data: RuntimeV2JsonValue, extra: Partial<SessionEventCandidateV1> = {}): SessionEventCandidateV1 {
  return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null, ...extra };
}

function createdWith(registry: ReturnType<typeof createCoreCodecRegistry>, manifestDigest = "manifest-a") {
  return { profileId: "base", runtimeContractVersion: "1", manifestDigest, plugins: [{ id: "@actspace/core", version: "2.0.0" }], codecSetDigest: registry.digest } as const;
}

function headerInput(registry: ReturnType<typeof createCoreCodecRegistry>, sessionId: string, manifestDigest?: string) {
  return { sessionId, createdAt: "2026-08-22T12:00:00.000Z", lineage: null, createdWith: createdWith(registry, manifestDigest) } as const;
}

describe("Session Format v1 golden acceptance inventory", () => {
  it("keeps all 17 decision-complete cases named and unique", () => {
    expect(GOLDEN_ACCEPTANCE_CASES).toHaveLength(17);
    expect(new Set(GOLDEN_ACCEPTANCE_CASES).size).toBe(17);
  });

  it("commits terminal tool facts in original model call order", () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-08-22T12:00:00.000Z" });
    journal.append(candidate("turn/start", { turnId: "turn-1" }));
    journal.append(candidate("step/start", { turnId: "turn-1", stepId: "step-1" }));
    journal.append(candidate("tool/call", { callId: "call-1", name: "read" }));
    journal.append(candidate("tool/call", { callId: "call-2", name: "read" }));
    expect(() => journal.append(candidate("tool/result", { callId: "call-2", name: "read", status: "completed" }))).toThrow("call order");
    journal.append(candidate("tool/result", { callId: "call-1", name: "read", status: "completed" }));
    journal.append(candidate("tool/result", { callId: "call-2", name: "read", status: "completed" }));
    expect(journal.validation.relations.openToolCallIds).toEqual([]);
  });

  it("calculates all codec compatibility states without executing unknown code", () => {
    const base = {
      recordKind: "event" as const,
      seq: 0,
      time: "2026-08-22T12:00:00.000Z",
      source: { ownerPluginId: "missing" },
      data: {},
      surface: null,
      provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null },
    };
    const unknownRequired = { ...base, type: "plugin/missing/state", eventVersion: 1, criticality: "required" as const } satisfies SessionEventEnvelopeV1;
    const unknownIgnorable = { ...base, type: "plugin/missing/info", eventVersion: 1, criticality: "ignorable" as const } satisfies SessionEventEnvelopeV1;
    const higherKnown = { ...base, type: "turn/start", eventVersion: 2, criticality: "required" as const, source: { ownerPluginId: "@actspace/core" }, data: { turnId: "turn-1" } } satisfies SessionEventEnvelopeV1;
    expect(new SessionJournal({ registry: createCoreCodecRegistry(), seed: [unknownRequired] }).validation.accessState).toBe("browse-only");
    expect(new SessionJournal({ registry: createCoreCodecRegistry(), seed: [unknownIgnorable] }).validation.accessState).toBe("degraded");
    expect(new SessionJournal({ registry: createCoreCodecRegistry(), seed: [higherKnown] }).validation.accessState).toBe("browse-only");
    expect(() => new EventCodecRegistry([{ type: "plugin/a/event", ownerPluginId: "other", currentVersion: 1, criticality: "required", validate: () => undefined }])).toThrow("outside owner namespace");
  });

  it("allows manifest provenance drift when codecs and behavior remain compatible", async () => {
    const root = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot: root, runtimeId: "runtime-a", registry });
    const session = await store.create(headerInput(registry, "manifest-drift", "old-manifest"));
    await session.close();
    const reopened = await store.open("manifest-drift");
    expect(reopened.header.createdWith.manifestDigest).toBe("old-manifest");
    await reopened.close();
  });

  it("rebuilds pending Inbox and enforces FIFO target-aware claims", () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-08-22T12:00:00.000Z" });
    journal.append(candidate("agent/inbox/spliced", { operation: "enqueue", messageId: "step-1", target: "next-step", content: "steer" }));
    journal.append(candidate("agent/inbox/spliced", { operation: "enqueue", messageId: "turn-1", target: "next-turn", content: "follow" }));
    expect(journal.validation.relations.pendingInboxMessageIds).toEqual(["step-1", "turn-1"]);
    journal.append(candidate("turn/start", { turnId: "active-turn" }));
    journal.append(candidate("agent/inbox/spliced", { operation: "claim", messageId: "step-1", target: "next-step" }, {
      provenance: { sourceEventSeqs: [0], contributorIds: ["main-inbox"], runtimeSelectionSeq: null },
      surface: { kind: "append", node: { kind: "user", messageId: "step-1", content: "steer" } },
    }));
    journal.append(candidate("agent/inbox/spliced", { operation: "claim", messageId: "turn-1", target: "next-turn" }, {
      provenance: { sourceEventSeqs: [1], contributorIds: ["main-inbox"], runtimeSelectionSeq: null },
      surface: { kind: "append", node: { kind: "user", messageId: "turn-1", content: "follow" } },
    }));
    const reloaded = new SessionJournal({ registry: createCoreCodecRegistry(), seed: journal.events });
    expect(reloaded.validation.relations.pendingInboxMessageIds).toEqual([]);
    expect(reloaded.surface.entries.map((entry) => entry.node.messageId)).toEqual(["step-1", "turn-1"]);
  });

  it("prevents Desktop and CLI processes from owning one writer simultaneously", async () => {
    const root = await temporaryRoot();
    const layout = sessionFileLayout(root, "cross-process");
    await mkdir(layout.sessionDir, { recursive: true });
    const fixture = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "lease-holder.cjs");
    const child = spawn(process.execPath, [fixture, layout.sessionDir, "cross-process"], { stdio: ["pipe", "pipe", "pipe"] });
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.stdout?.once("data", (chunk) => chunk.toString().includes("ready") ? resolve() : reject(new Error(`Unexpected child output: ${chunk}`)));
    });
    try {
      await expect(SessionWriterLease.acquire({ sessionDir: layout.sessionDir, sessionId: "cross-process", runtimeId: "parent-cli" })).rejects.toThrow("child-runtime");
    } finally {
      child.stdin?.end();
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    }
  });

  it("keeps canonical bytes raw and rejects v1 or secret-bearing input", async () => {
    const root = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot: root, runtimeId: "runtime-a", registry });
    await mkdir(join(root, "sessions", "legacy"), { recursive: true });
    await expect(store.inspect("legacy")).rejects.toThrow();
    const session = await store.create(headerInput(registry, "canonical"));
    await expect(session.append(candidate("user/message", { messageId: "secret", apiKey: "CANARY_SECRET" }))).rejects.toThrow("apiKey");
    await session.close();
    const bytes = await readFile(session.layout.journalPath);
    expect(bytes.includes(Buffer.from("CANARY_SECRET"))).toBe(false);
    expect(bytes.at(-1)).toBe(0x0a);
    expect(bytes.subarray(0, 1).toString()).toBe("{");
  });
});
