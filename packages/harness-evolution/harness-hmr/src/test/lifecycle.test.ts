import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { HarnessHmr, atomicJson } from "../service.js";
import { apply } from "../plugin.js";
it.each(["Host fingerprint changed", ""])("preserves recovery blocking for the task scheduler: %s", async blocked => {
  const dataRoot = await mkdtemp(join(tmpdir(), "hmr-blocked-"));
  const control = { inspect: () => ({ current: undefined, history: [], blocked }), acquire: async () => { throw new Error("must not acquire"); } };
  const hmr = new HarnessHmr({ dataRoot, control: control as never });
  try {
    await expect(hmr.acquire("session")).rejects.toMatchObject({ code: "RECOVERY_BLOCKED" });
  } finally { await hmr.close(); await rm(dataRoot, { recursive: true, force: true }); }
});
it("recovers a committed selection before admitting leases, without starting tasks", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "hmr-recover-"));
  const base = { harnessId: "main", revision: 1, executionDigest: "old" };
  let current = base; const history: any[] = []; const acquired: string[] = [];
  const control = { inspect: () => ({ current, history, blocked: "" }), acquire: async (id: string) => { acquired.push(id); return { harnessId: id }; } };
  const hmr = new HarnessHmr({ dataRoot, control: control as never });
  try {
    const sessionId = "session"; const harnessId = hmr.branchId(sessionId);
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    await atomicJson(join(dataRoot, "harness-sessions", hash(sessionId) + ".intent.json"), { schemaVersion: 1, sessionId, changeId: "change", candidateId: "candidate", harnessId, executionDigest: "new", expectedBindingRevision: 0 });
    current = { harnessId, revision: 1, executionDigest: "new" }; history.push({ ...current, activationId: "change", requestDigest: hash(JSON.stringify({ candidateId: "candidate" })) });
    expect(await hmr.inspect(sessionId)).toMatchObject({ revision: 1, harnessId, executionDigest: "new" });
    expect(await hmr.acquire(sessionId)).toEqual({ harnessId }); expect(acquired).toEqual([harnessId]);
    await atomicJson(join(dataRoot, "harness-sessions", hash(sessionId) + ".binding.json"), { schemaVersion: 9 });
    await expect(hmr.acquire(sessionId)).rejects.toThrow("Invalid"); expect(acquired).toHaveLength(1);
  } finally { await hmr.close(); await rm(dataRoot, { recursive: true, force: true }); }
});
it("owns a Host lifecycle and refuses new work after disposal", async () => {
  let instance!: HarnessHmr; let dispose!: () => Promise<void>;
  apply({ get: () => ({ dataRoot: "/unused", control: {} }), provide: (_name: string, value: HarnessHmr) => { instance = value; }, effect: (fn: () => () => Promise<void>) => { dispose = fn(); } } as never);
  await dispose(); await expect(instance.inspect("session")).rejects.toThrow("closed");
});
it("serializes admission behind publication, recovers lost commit replies and rejects conflicts/cancellation", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "hmr-commit-"));
  const base = { harnessId: "main", revision: 1, executionDigest: "old" };
  let current = base; const history: any[] = []; let release!: () => void; let enter!: () => void;
  const entered = new Promise<void>(r => { enter = r; }); const gate = new Promise<void>(r => { release = r; });
  const control = { inspect: (id: string) => ({ current: id === "main" ? base : current, history, blocked: "" }), acquire: async (id: string) => ({ harnessId: id }), activate: async (activationId: string, candidateId: string) => {
    enter(); await gate;
    current = { harnessId: hmr.branchId("s"), revision: 1, executionDigest: "new" };
    history.push({ ...current, activationId, requestDigest: createHash("sha256").update(JSON.stringify({ candidateId })).digest("hex") });
    throw new Error("lost response after commit");
  } };
  const hmr = new HarnessHmr({ dataRoot, control: control as never });
  try {
    const input = { schemaVersion: 1 as const, sessionId: "s", harnessId: hmr.branchId("s"), changeId: "c", candidateId: "candidate", executionDigest: "new", expectedBindingRevision: 0 };
    const apply = hmr.apply(input, {}); const failure = expect(apply).rejects.toThrow("lost response");
    await entered;
    let acquired = false; const lease = hmr.acquire("s").then(value => { acquired = true; return value; });
    await Promise.resolve(); expect(acquired).toBe(false);
    release(); await failure;
    expect(await lease).toEqual({ harnessId: hmr.branchId("s") });
    expect(await hmr.apply(input, {})).toMatchObject({ revision: 1, executionDigest: "new" });
    await expect(hmr.apply({ ...input, candidateId: "different" }, {})).rejects.toThrow("conflict");
    await expect(hmr.apply({ ...input, changeId: "other", expectedBindingRevision: 0 }, {})).rejects.toThrow("binding changed");
    await expect(hmr.apply({ ...input, changeId: "cancelled", expectedBindingRevision: 1 }, {}, AbortSignal.abort("stop"))).rejects.toBe("stop");
    expect(history).toHaveLength(1);
    expect((await hmr.inspect("untouched")).harnessId).toBe("main");
  } finally { release(); await hmr.close(); await rm(dataRoot, { recursive: true, force: true }); }
});
