import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { CheckpointPolicy, createCoreCodecRegistry, SessionDurabilityFailure } from "@actspace/session-journal";
import type { SessionEventCandidateV1 } from "@actspace/session-journal";
import { SessionStore } from "../session-store.js";
import { sessionFileLayout } from "../session.js";
import { SessionWriterLease } from "../writer-lease.js";
import type { JsonlWriteOperation } from "@actspace/session-jsonl";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "actspace-session-v2-"));
  roots.push(root);
  return root;
}

function candidate(type: string, data: RuntimeV2JsonValue, extra: Partial<SessionEventCandidateV1> = {}): SessionEventCandidateV1 {
  return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null, ...extra };
}

function headerInput(registry: ReturnType<typeof createCoreCodecRegistry>, sessionId = "session-1") {
  return {
    sessionId,
    createdAt: "2026-08-22T12:00:00.000Z",
    lineage: null,
    createdWith: {
      profileId: "base",
      runtimeContractVersion: "1",
      manifestDigest: "manifest-sha256",
      plugins: [{ id: "@actspace/core", version: "2.0.0" }],
      codecSetDigest: registry.digest,
    },
  } as const;
}

describe("raw JSONL Session persistence", () => {
  it("publishes Header then durably appends LF-delimited events", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    const session = await store.create(headerInput(registry), { writerHooks: { maxWriteBytes: 7 } });
    await session.append(candidate("turn/start", { turnId: "turn-1" }));
    await session.append(candidate("turn/end", { turnId: "turn-1", reason: "completed" }));
    await session.flush();

    const bytes = await readFile(session.layout.journalPath);
    expect(bytes.at(-1)).toBe(0x0a);
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(bytes.toString("utf8").trimEnd().split("\n")).toHaveLength(3);

    const inspection = await store.inspect("session-1");
    expect(inspection.accessState).toBe("read-write");
    expect(inspection.events.map((event) => event.seq)).toEqual([0, 1]);
    await session.close();
    expect(await readFile(session.layout.journalPath, "utf8")).not.toContain("context-state.json");
  });

  it("fires the session event hook only after the append write completes", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const order: string[] = [];
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    const session = await store.create(headerInput(registry, "post-commit"), {
      writerHooks: { afterWriteChunk: (operation) => { if (operation === "append-write") order.push("write"); } },
      onEvent: () => { order.push("event"); },
    });
    await session.append(candidate("turn/start", { turnId: "turn-1" }));
    await session.flush();
    expect(order).toEqual(["write", "event"]);
    await session.close();
  });

  it("separates post-commit session/event from the awaited session/flush checkpoint", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const order: string[] = [];
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    const session = await store.create(headerInput(registry, "flush-event-boundary"), {
      writerHooks: { afterWriteChunk: (operation) => { if (operation === "append-write") order.push("durable-write"); } },
      onEvent: () => { order.push("session/event"); },
      onFlush: () => { order.push("session/flush"); },
    });
    await session.append(candidate("turn/start", { turnId: "turn-1" }));
    await session.flush();
    expect(order).toEqual(["durable-write", "session/event", "session/flush"]);
    await session.close();
  });

  it("serializes close after already-submitted append and makes repeated close idempotent", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    const session = await store.create(headerInput(registry, "close-race"));
    const append = session.append(candidate("turn/start", { turnId: "turn-1" }));
    const firstClose = session.close();
    const secondClose = session.close();
    expect(secondClose).toBe(firstClose);
    await append;
    await firstClose;
    const inspection = await store.inspect("close-race");
    expect(inspection.events).toHaveLength(1);
    await expect(session.append(candidate("turn/end", { turnId: "turn-1" }))).rejects.toThrow("closed");
  });

  it("fails closed when append durability fails and retains the accepted batch", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    let failAppend = true;
    const session = await store.create(headerInput(registry), {
      writerHooks: {
        before(operation) {
          if (operation === "append-write" && failAppend) {
            failAppend = false;
            throw new Error("injected append failure");
          }
        },
      },
    });
    await session.append(candidate("turn/start", { turnId: "turn-1" }));
    await expect(session.flush()).rejects.toThrow("Journal append failed");
    await expect(session.append(candidate("turn/end", { turnId: "turn-1" }))).rejects.toThrow("blocked");
    await expect(session.close()).rejects.toThrow();

    const inspection = await store.inspect("session-1");
    expect(inspection.events).toHaveLength(0);
    const nextLease = await SessionWriterLease.acquire({
      sessionDir: session.layout.sessionDir,
      sessionId: "session-1",
      runtimeId: "runtime-2",
    });
    await nextLease.dispose();
  });

  it("restores the original Journal when append fsync fails", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    let fsyncs = 0;
    const session = await store.create(headerInput(registry, "append-fsync-failure"), {
      writerHooks: {
        before(operation) {
          if (operation === "file-fsync" && ++fsyncs === 2) throw new Error("injected append fsync failure");
        },
      },
    });
    const original = await readFile(session.layout.journalPath);

    await session.append(candidate("turn/start", { turnId: "turn-1" }));
    await expect(session.flush()).rejects.toThrow("Journal append failed");
    await expect(session.close()).rejects.toThrow();

    expect(await readFile(session.layout.journalPath)).toEqual(original);
    const inspection = await store.inspect("append-fsync-failure");
    expect(inspection.accessState).toBe("read-write");
    expect(inspection.events).toHaveLength(0);
  });

  it("restores the original Journal after a partial append write fails", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    let appendChunks = 0;
    const session = await store.create(headerInput(registry, "partial-append-recovery"), {
      writerHooks: {
        maxWriteBytes: 8,
        afterWriteChunk(operation) {
          if (operation === "append-write" && ++appendChunks === 1) throw new Error("injected partial write");
        },
      },
    });
    const original = await readFile(session.layout.journalPath);

    await session.append(candidate("turn/start", { turnId: "turn-1" }));
    await expect(session.flush()).rejects.toThrow("Journal append failed");
    await expect(session.close()).rejects.toThrow();

    expect(await readFile(session.layout.journalPath)).toEqual(original);
    const inspection = await store.inspect("partial-append-recovery");
    expect(inspection.accessState).toBe("read-write");
    expect(inspection.events).toHaveLength(0);
  });

  it("reports a torn final line without modifying forensic bytes", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    const session = await store.create(headerInput(registry));
    await session.close();
    const original = await readFile(session.layout.journalPath);
    const torn = Buffer.concat([original, Buffer.from('{"recordKind":"event"')]);
    await writeFile(session.layout.journalPath, torn);

    const inspection = await store.inspect("session-1");
    expect(inspection.accessState).toBe("corrupt");
    expect(inspection.tornTail?.bytes.toString("utf8")).toBe('{"recordKind":"event"');
    expect(await readFile(session.layout.journalPath)).toEqual(torn);
    await expect(store.open("session-1")).rejects.toThrow("forensic repair");
  });

  it.each<JsonlWriteOperation>([
    "open",
    "header-write",
    "file-fsync",
    "rename",
    "directory-fsync",
  ])("fails closed when Session creation injects a %s failure", async (failedOperation) => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    let injected = false;
    await expect(
      store.create(headerInput(registry, `create-${failedOperation}`), {
        writerHooks: {
          before(operation) {
            if (!injected && operation === failedOperation) {
              injected = true;
              throw new Error(`injected ${failedOperation}`);
            }
          },
        },
      }),
    ).rejects.toThrow();
    const layout = sessionFileLayout(dataRoot, `create-${failedOperation}`);
    const lease = await SessionWriterLease.acquire({ sessionDir: layout.sessionDir, sessionId: `create-${failedOperation}`, runtimeId: "recovery-runtime" });
    await lease.dispose();
  });

  it("marks the writer corrupt when a partial append cannot be truncated", async () => {
    const dataRoot = await temporaryRoot();
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-1", registry });
    let appendChunks = 0;
    const session = await store.create(headerInput(registry, "truncate-failure"), {
      writerHooks: {
        maxWriteBytes: 8,
        afterWriteChunk(operation) {
          if (operation === "append-write" && ++appendChunks === 1) throw new Error("injected partial write");
        },
        before(operation) {
          if (operation === "truncate") throw new Error("injected truncate failure");
        },
      },
    });
    await session.append(candidate("turn/start", { turnId: "turn-1" }));
    await expect(session.flush()).rejects.toThrow("could not be restored");
    await expect(session.close()).rejects.toThrow();
    const inspection = await store.inspect("truncate-failure");
    expect(inspection.accessState).toBe("corrupt");
  });
});

describe("writer lease and checkpoints", () => {
  it("allows exactly one live writer and permits reacquisition after dispose", async () => {
    const dataRoot = await temporaryRoot();
    const layout = sessionFileLayout(dataRoot, "session-race");
    const first = await SessionWriterLease.acquire({ sessionDir: layout.sessionDir, sessionId: "session-race", runtimeId: "desktop" });
    await expect(SessionWriterLease.acquire({ sessionDir: layout.sessionDir, sessionId: "session-race", runtimeId: "cli" })).rejects.toThrow("owned by runtime desktop");
    await first.dispose();
    await first.dispose();
    const second = await SessionWriterLease.acquire({ sessionDir: layout.sessionDir, sessionId: "session-race", runtimeId: "cli" });
    await second.dispose();
  });

  it("moves a proven stale lease to recovery before acquiring ownership", async () => {
    const dataRoot = await temporaryRoot();
    const layout = sessionFileLayout(dataRoot, "session-stale");
    const first = await SessionWriterLease.acquire({
      sessionDir: layout.sessionDir,
      sessionId: "session-stale",
      runtimeId: "dead-runtime",
      pid: 999_999,
      now: () => new Date("2026-08-22T11:00:00.000Z"),
      isProcessAlive: () => false,
    });
    const nonce = first.owner.nonce;
    const second = await SessionWriterLease.acquire({
      sessionDir: layout.sessionDir,
      sessionId: "session-stale",
      runtimeId: "new-runtime",
      now: () => new Date("2026-08-22T12:00:00.000Z"),
      isProcessAlive: () => false,
    });
    expect(await readFile(join(layout.recoveryDir, `stale-lock-${nonce}`, "owner.json"), "utf8")).toContain("dead-runtime");
    await first.dispose();
    await second.dispose();
  });

  it("wraps failed durability barriers and never invokes the side effect", async () => {
    let sideEffects = 0;
    const policy = new CheckpointPolicy();
    const target = {
      lastSeq: 7,
      async flush() {
        throw new Error("disk full");
      },
    };
    await expect(
      policy.enforce(target, "before-llm-dispatch").then(() => {
        sideEffects += 1;
      }),
    ).rejects.toBeInstanceOf(SessionDurabilityFailure);
    expect(sideEffects).toBe(0);
  });
});
