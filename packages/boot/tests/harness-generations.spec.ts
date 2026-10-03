import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createCordisRoot, type CordisRootHandle } from "@actspace/cordis-adapter";
import { HarnessGenerations } from "../src/harness-generations.js";
import { harnessFixture } from "./fixtures/harness.js";
const directories: string[] = [];
const roots: CordisRootHandle[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await root.dispose(); for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
async function fixture(...args: Parameters<typeof harnessFixture>) { const value = await harnessFixture(...args); directories.push(value.root); return value; }
async function setup(gate?: Promise<void>) {
  const root = await createCordisRoot(); roots.push(root);
  const disposed: string[] = [];
  await root.mount("host", ctx => ctx.provide("host", { disposed, gate }), { provides: ["host"] });
  return { manager: new HarnessGenerations(root.context), disposed, root };
}
type Reader = { read(): Promise<string>; count(): number };
it("keeps fixed old resources across failed and successful candidate activation and retires on last release", async () => {
  const { manager, disposed } = await setup();
  const old = await fixture("old"); const next = await fixture("new"); const broken = await fixture("broken", { failApply: true });
  manager.activate(await manager.prepare("main", 0, old.request));
  const a = manager.acquire("main"); const b = manager.acquire("main");
  await writeFile(join(old.sourceRoot, "prompt.txt"), "edited");
  await expect(manager.prepare("main", 1, broken.request)).rejects.toMatchObject({ code: "PREPARE_FAILED" });
  const stillOld = manager.acquire("main");
  expect(await stillOld.getService<Reader>("reader")!.read()).toBe("old:old");
  const candidate = await manager.prepare("main", 1, next.request);
  expect(candidate.executionDigest).not.toBe((await manager.prepare("other", 0, old.request)).executionDigest);
  manager.activate(candidate); const fresh = manager.acquire("main");
  expect(await fresh.getService<Reader>("reader")!.read()).toBe("new:new");
  expect(await a.getService<Reader>("reader")!.read()).toBe("old:old");
  await a.release(); await b.release(); expect(disposed).toEqual([]);
  await stillOld.release(); await stillOld.release(); expect(disposed).toEqual(["old"]);
  await fresh.release(); expect(disposed).toEqual(["old"]);
  await manager.close(); expect(disposed.filter(x => x === "new")).toHaveLength(1);
});
it("serializes revision commits, rejects foreign/reused candidates and detects ABA", async () => {
  const { manager, root } = await setup(); const a = await fixture("a"); const b = await fixture("b");
  const first = await manager.prepare("main", 0, a.request); manager.activate(first);
  const [second, stale] = await Promise.all([manager.prepare("main", 1, b.request), manager.prepare("main", 1, a.request)]);
  const before = manager.acquire("main"); manager.activate(second); const after = manager.acquire("main");
  expect(before.revision).toBe(1); expect(after.revision).toBe(2);
  manager.activate(await manager.prepare("main", 2, a.request));
  expect(() => manager.activate(stale)).toThrow("baseline");
  expect(() => manager.activate(first)).toThrow("consumed");
  const foreign = new HarnessGenerations(root.context);
  expect(() => foreign.activate(stale)).toThrow("another manager");
  await manager.discard(stale); await before.release(); await after.release(); await manager.close(); await foreign.close();
});
it("keeps committed selection when old cleanup fails and reports failure at close", async () => {
  const { manager } = await setup(); const old = await fixture("old", { failDispose: true }); const next = await fixture("new");
  manager.activate(await manager.prepare("main", 0, old.request)); const lease = manager.acquire("main");
  manager.activate(await manager.prepare("main", 1, next.request));
  await expect(lease.release()).rejects.toThrow("cleanup");
  const fresh = manager.acquire("main"); expect(await fresh.getService<Reader>("reader")!.read()).toBe("new:new");
  expect(manager.inspect().some(row => row.state === "cleanup-failed")).toBe(true);
  await fresh.release(); await expect(manager.close()).rejects.toThrow("cleanup");
});
it("closes against an in-flight prepare and waits for active holders", async () => {
  let unblock!: () => void; const gate = new Promise<void>(resolve => { unblock = resolve; });
  const { manager } = await setup(gate); const old = await fixture("old"); const pending = await fixture("pending", { gate: true });
  manager.activate(await manager.prepare("main", 0, old.request)); const holder = manager.acquire("main");
  const preparation = manager.prepare("main", 1, pending.request);
  const observed = preparation.catch(error => error);
  const closing = manager.close(); expect(manager.close()).toBe(closing);
  expect(() => manager.acquire("main")).toThrow("closed");
  unblock(); expect(await observed).toMatchObject({ code: "CLOSED" });
  let finished = false; void closing.then(() => { finished = true; });
  await Promise.resolve(); expect(finished).toBe(false);
  await holder.release(); await closing; expect(finished).toBe(true);
});
it("rejects missing codecs before behavior activation", async () => {
  const { manager, disposed } = await setup(); const bad = await fixture("bad", { badCodec: true });
  await expect(manager.prepare("main", 0, bad.request)).rejects.toMatchObject({ code: "PREPARE_FAILED", cause: { message: "Missing Harness codec: plugin/fixture.harness/state" } });
  expect(disposed).toEqual([]); expect(() => manager.acquire("main")).toThrow("No active"); await manager.close();
});
it("documents that module globals are shared even across isolated instances of the same artifact", async () => {
  const { manager } = await setup(); const artifact = await fixture("shared");
  manager.activate(await manager.prepare("a", 0, artifact.request)); manager.activate(await manager.prepare("b", 0, artifact.request));
  const a = manager.acquire("a"); const b = manager.acquire("b");
  expect(a.getService<Reader>("reader")!.count()).toBe(1); expect(b.getService<Reader>("reader")!.count()).toBe(2);
  await a.release(); await b.release(); await manager.close();
});
it("isolates inherited registrations between lease scopes and removes them on release", async () => {
  const { manager } = await setup(); const a = await fixture("a"); const b = await fixture("b");
  manager.activate(await manager.prepare("a", 0, a.request)); manager.activate(await manager.prepare("b", 0, b.request));
  const first = manager.acquire("a"); const second = manager.acquire("b");
  expect(first.scope.scopeKey).not.toBe(second.scope.scopeKey);
  first.scope.tools.register({ id: "search", owner: "fixture", value: "old-tool" });
  second.scope.tools.register({ id: "search", owner: "fixture", value: "new-tool" });
  expect(first.scope.tools.get("search")?.value).toBe("old-tool");
  expect(second.scope.tools.get("search")?.value).toBe("new-tool");
  await first.release(); expect(() => first.getService("reader")).toThrow("disposed");
  expect(first.scope.tools.localEntries()).toEqual([]);
  expect(second.scope.tools.get("search")?.value).toBe("new-tool");
  expect(await second.getService<Reader>("reader")!.read()).toBe("b:b");
  await second.release(); await manager.close(); expect(manager.inspect()).toEqual([]);
});
it("rejects invalid artifacts before mounting and lets the current generation serve another holder", async () => {
  const { manager } = await setup(); const old = await fixture("old"); const invalid = await fixture("invalid");
  manager.activate(await manager.prepare("main", 0, old.request));
  await writeFile(join(invalid.artifact.root, "dep.mjs"), 'export const label = "corrupt";');
  await expect(manager.prepare("main", 1, invalid.request)).rejects.toMatchObject({ code: "PREPARE_FAILED" });
  const holder = manager.acquire("main"); expect(await holder.getService<Reader>("reader")!.read()).toBe("old:old");
  await holder.release(); await manager.close();
});
it("retains the current selection after an import error or missing Host capability", async () => {
  const { manager } = await setup(); const old = await fixture("old"); const broken = await fixture("broken", { failImport: true });
  manager.activate(await manager.prepare("main", 0, old.request));
  await expect(manager.prepare("main", 1, broken.request)).rejects.toMatchObject({ cause: { message: "fixture import failed" } });
  const composition = { ...old.request.composition, entries: old.request.composition.entries.map(entry => ({ ...entry, requiredCapabilities: ["missing-capability"] })) };
  await expect(manager.prepare("main", 1, { ...old.request, composition })).rejects.toMatchObject({ cause: { message: "Missing Harness Host capability: reader/missing-capability" } });
  const holder = manager.acquire("main"); expect(await holder.getService<Reader>("reader")!.read()).toBe("old:old");
  await holder.release(); await manager.close();
});

it("derives execution identity from actual configuration rather than a caller-supplied composition digest", async () => {
  const { manager } = await setup(); const value = await fixture("identity");
  const first = await manager.prepare("main", 0, value.request);
  const changed = await manager.prepare("main", 0, { ...value.request, composition: { ...value.request.composition, entries: value.request.composition.entries.map(e => ({ ...e, config: { setting: "changed" } })) } });
  expect(first.executionDigest).not.toBe(changed.executionDigest);
  await manager.close();
});
