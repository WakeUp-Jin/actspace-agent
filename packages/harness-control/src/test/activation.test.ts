import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { createCordisRoot, publishPluginArtifact, pluginId, entryId, serviceId, type CordisRootHandle, type PluginArtifact } from "@actspace/cordis-adapter";
import { composeRuntime } from "@actspace/composition";
import { SelectionStore } from "../selection-store.js";
import { HarnessControl } from "../service.js";
const roots: string[] = []; const contexts: CordisRootHandle[] = []; const controls: HarnessControl[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const c of controls.splice(0)) await c.close(); for (const c of contexts.splice(0)) await c.dispose(); for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true }); });
async function setup(authorized = true, failOldDispose = false) {
  const path = await mkdtemp(join(tmpdir(), "control-test-")); roots.push(path);
  const ctx = await createCordisRoot(); contexts.push(ctx);
  const artifacts = join(path, "artifacts");
  async function artifact(id: string, failApply = false) {
    const sourceRoot = join(path, id); await mkdir(sourceRoot);
    await writeFile(join(sourceRoot, "plugin.js"), `export function apply(ctx) { ctx.provide('reader', { read: () => '${id}' }); ${failApply ? `throw new Error('init-failed');` : ''} ${failOldDispose && id === 'old' ? `ctx.effect(() => () => { throw new Error('cleanup-failed'); });` : ''} }`);
    return publishPluginArtifact({ sourceRoot, artifactRoot: artifacts, files: ["plugin.js"], plugin: {
      schemaVersion: 1, pluginId: pluginId(id), version: "1", name: id, runtimeContract: "actspace.runtime.v2", source: { kind: "builtin", reference: id }, codecs: [],
      behaviors: [{ entryId: entryId(id), module: "./plugin.js", required: true, enabled: true, config: {}, host: { required: [], optional: [] }, frontend: null, provides: [serviceId("reader")], injects: [], contracts: { services: { provides: [{ id: "reader", version: 1 }], requires: [] }, events: { provides: [], requires: [] } } }], contributions: { services: ["reader"], events: [], contributions: [] },
    } });
  }
  const old = await artifact("old"); const next = await artifact("new");
  const composition = composeRuntime({ profile: { id: "main", runtimeContract: "actspace.runtime.v2", orderedBundleIds: ["base"] }, bundles: [{ id: "base", version: "1", provenance: "test", manifests: [old.manifest.plugin] }], hostCapabilities: [] });
  const options = { context: ctx.context, dataRoot: path, artifactRoot: artifacts, runtimeId: "test", compatibility: { services: [], events: [], sharedModules: [], codecArtifacts: [] }, sharedServices: [], builtin: async () => ({ composition, artifacts: new Map([["old", old]]), sharedServices: [] }), ...(authorized ? { authorize: async (r: import("../contracts.js").AuthorizationRequest) => ({ ...r, actor: "test", decisionId: "yes", expiresAt: Date.now() + 10000 }) } : {}) };
  const control = new HarnessControl(options); controls.push(control); await control.initialize();
  async function prepare(control: HarnessControl, artifact: PluginArtifact) {
    const current = control.inspect().current!;
    return control.prepare({ harnessId: "main", expectedRevision: current.revision, baseExecutionDigest: current.executionDigest, artifactIds: [artifact.artifactId], patch: { id: "patch", provenance: "test", operations: [{ id: "replace", kind: "replace", target: "old", artifactId: artifact.artifactId, manifestEntryId: artifact.manifest.plugin.behaviors[0]!.entryId }] } });
  }
  return { control, options, next, prepare, artifact };
}
it("authorizes and persists replacement while old leases keep their implementation, then recovers and rolls back", async () => {
  const { control, options, next, prepare } = await setup();
  expect(control.inspect().blocked).toBe("");
  const initial = control.inspect().current!; const oldLease = await control.acquire("main");
  const candidate = await prepare(control, next);
  const result = await control.activate("activate", candidate.candidateId);
  expect(result.revision).toBe(2); expect(await control.activate("activate", candidate.candidateId)).toEqual(result);
  const fresh = await control.acquire("main");
  expect(oldLease.getService<{ read(): string }>("reader")!.read()).toBe("old");
  expect(fresh.getService<{ read(): string }>("reader")!.read()).toBe("new");
  await oldLease.release(); await fresh.release(); await control.close();
  const restored = new HarnessControl(options); controls.push(restored); await restored.initialize();
  expect(restored.inspect().current?.revision).toBe(2);
  const lease = await restored.acquire("main"); expect(lease.getService<{ read(): string }>("reader")!.read()).toBe("new"); await lease.release();
  const rollback = await restored.prepareRollback("main", 2, initial.executionDigest);
  expect((await restored.activate("rollback", rollback.candidateId)).revision).toBe(3);
});
it("defaults to denied and retains the original selection", async () => {
  const { control, next, prepare } = await setup(false); const c = await prepare(control, next);
  await expect(control.activate("attempt", c.candidateId)).rejects.toMatchObject({ code: "AUTHORIZATION_REQUIRED" });
  expect(control.inspect().current?.revision).toBe(1);
});
it("rejects stale concurrent candidates without losing current selection", async () => {
  const { control, next, prepare } = await setup(); const a = await prepare(control, next); const b = await prepare(control, next);
  await control.activate("first", a.candidateId);
  await expect(control.activate("second", b.candidateId)).rejects.toMatchObject({ code: "BASELINE_CONFLICT" });
  await control.discard(b.candidateId); expect(control.inspect().current?.revision).toBe(2);
});

it("keeps maintenance available for missing artifacts and authorizes idempotent builtin recovery", async () => {
  const { control, options, next, prepare } = await setup();
  const candidate = await prepare(control, next); await control.activate("replace", candidate.candidateId); await control.close();
  await rm(next.root, { recursive: true });
  const restored = new HarnessControl(options); controls.push(restored); await restored.initialize();
  expect(restored.inspect().current?.revision).toBe(2);
  await expect(restored.acquire("main")).rejects.toMatchObject({ code: "RECOVERY_BLOCKED" });
  const result = await restored.recoverBuiltin("repair", 2);
  expect(result.revision).toBe(3); expect(restored.inspect().blocked).toBe("");
  expect(await restored.recoverBuiltin("repair", 2)).toEqual(result);
  const lease = await restored.acquire("main"); expect(lease.getService<{read(): string}>("reader")!.read()).toBe("old"); await lease.release();
});
it("blocks restoration when Host contracts change without silently using builtin", async () => {
  const { control, options } = await setup(); await control.close();
  const restored = new HarnessControl({ ...options, compatibility: { ...options.compatibility, events: [{ id: "new-host-event", version: 1, mode: "emit" }] } });
  controls.push(restored); await restored.initialize();
  expect(restored.inspect().blocked).toContain("fingerprint");
  await expect(restored.acquire("main")).rejects.toMatchObject({ code: "RECOVERY_BLOCKED" });
});
it("does not let a late authorization resurrect a discarded candidate", async () => {
  const { control, options, next, prepare } = await setup(); const c = await prepare(control, next);
  let approve!: () => void;
  options.authorize = async request => { await new Promise<void>(resolve => { approve = resolve; }); return { ...request, actor: "test", decisionId: "late", expiresAt: Date.now() + 10000 }; };
  const attempt = control.activate("late", c.candidateId);
  await control.discard(c.candidateId); approve();
  await expect(attempt).rejects.toMatchObject({ code: "CANDIDATE_NOT_READY" });
  expect(control.inspect().current?.revision).toBe(1);
});
it("serializes publication and leases while allowing prompt cancellation behind the commit gate", async () => {
  const { control, next, prepare } = await setup(); const c = await prepare(control, next);
  const append = SelectionStore.prototype.append; let release!: () => void; let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  vi.spyOn(SelectionStore.prototype, "append").mockImplementation(async function(record) {
    entered(); await new Promise<void>(resolve => { release = resolve; }); await append.call(this, record);
  });
  const activation = control.activate("gated", c.candidateId); await started;
  const cancellation = new AbortController(); const canceled = control.acquire("main", cancellation.signal);
  cancellation.abort(new Error("cancel-wait")); await expect(canceled).rejects.toThrow("cancel-wait");
  let acquired = false; const acquiring = control.acquire("main").then(lease => { acquired = true; return lease; });
  expect(acquired).toBe(false); release(); await activation;
  const lease = await acquiring; expect(lease.revision).toBe(2); await lease.release();
  expect(control.inspect().instances.every(instance => instance.users === 0)).toBe(true);
});
it("does not publish after a durability failure and blocks new execution", async () => {
  const { control, next, prepare } = await setup(); const c = await prepare(control, next); const old = await control.acquire("main");
  vi.spyOn(SelectionStore.prototype, "append").mockRejectedValue(new Error("disk-full"));
  await expect(control.activate("failure", c.candidateId)).rejects.toThrow("disk-full");
  expect(control.inspect().current?.revision).toBe(1);
  await expect(control.acquire("main")).rejects.toMatchObject({ code: "RECOVERY_BLOCKED" });
  expect(old.getService<{read(): string}>("reader")!.read()).toBe("old"); await old.release();
});

it("keeps a durable activation successful when the old implementation fails cleanup", async () => {
  const { control, options, next, prepare } = await setup(true, true);
  const old = await control.acquire("main"); const c = await prepare(control, next);
  expect((await control.activate("clean-failure", c.candidateId)).revision).toBe(2);
  await expect(old.release()).rejects.toThrow("cleanup");
  expect(control.inspect().instances.some(i => i.state === "cleanup-failed")).toBe(true);
  const lease = await control.acquire("main"); expect(lease.revision).toBe(2); await lease.release();
  expect((await control.artifactUsage()).every(a => "bytes" in a && a.bytes! > 0)).toBe(true);
  await expect(control.close()).rejects.toThrow("cleanup"); controls.splice(controls.indexOf(control), 1);
  const restored = new HarnessControl(options); controls.push(restored); await restored.initialize();
  expect(restored.inspect().current?.revision).toBe(2);
});
it("rejects a configuration override without a pure validator before mounting", async () => {
  const { control } = await setup(); const current = control.inspect().current!;
  await expect(control.prepare({ harnessId: "main", expectedRevision: 1, baseExecutionDigest: current.executionDigest, artifactIds: [], patch: { id: "config", provenance: "test", operations: [{ id: "config", kind: "replace-config", target: "old", config: { unsafe: true } }] } })).rejects.toMatchObject({ code: "CONTRACT_MISMATCH" });
  expect(control.inspect().current?.revision).toBe(1); expect(control.inspect().candidates).toHaveLength(0);
});
it("rechecks authorization expiry after waiting for the commit gate", async () => {
  const { control, options, next, prepare } = await setup(); const c = await prepare(control, next);
  options.authorize = async r => ({ ...r, actor: "test", decisionId: "expired", expiresAt: Date.now() - 1 });
  await expect(control.activate("expired", c.candidateId)).rejects.toMatchObject({ code: "AUTHORIZATION_EXPIRED" });
  expect(control.inspect().current?.revision).toBe(1);
});
it("rejects late authorization after control closure", async () => {
  const { control, options, next, prepare } = await setup(); const c = await prepare(control, next);
  let approve!: () => void;
  options.authorize = async r => { await new Promise<void>(resolve => { approve = resolve; }); return { ...r, actor: "test", decisionId: "late", expiresAt: Date.now() + 10000 }; };
  const activation = control.activate("closing", c.candidateId);
  await control.close(); approve();
  await expect(activation).rejects.toMatchObject({ code: "CLOSED" });
  expect(control.inspect().current?.revision).toBe(1);
});

it("keeps the current implementation usable when candidate initialization fails", async () => {
  const { control, artifact, prepare } = await setup(); const lease = await control.acquire("main");
  const broken = await artifact("broken", true);
  await expect(prepare(control, broken)).rejects.toMatchObject({ code: "PREPARE_FAILED" });
  expect(lease.getService<{read(): string}>("reader")!.read()).toBe("old");
  expect(control.inspect().current?.revision).toBe(1); expect(control.inspect().candidates).toHaveLength(0);
  await lease.release();
});
