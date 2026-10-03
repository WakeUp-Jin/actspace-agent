import { afterEach, expect, it } from "vitest";
import { createCordisRoot, mountIsolatedCordisTree, type CordisRootHandle } from "@actspace/cordis-adapter";
import { AgentScope, scopeContext, scopeTarget } from "@actspace/core-scope";
const roots: CordisRootHandle[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await root.dispose(); });
async function host() { const root = await createCordisRoot(); roots.push(root); await root.mount("host", ctx => ctx.provide("hostValue", { value: "host" }), { provides: ["hostValue"] }); return root; }
it("isolates normal service injection and retires only its own provider", async () => {
  const root = await host(); const disposed: string[] = [];
  const mount = (value: string) => mountIsolatedCordisTree({ parent: root.context, sharedServices: ["hostValue"], entries: [
    { id: "provider", provides: ["value"], injects: [], config: {}, module: { apply: (ctx: any) => { ctx.provide("value", { read: () => value }); return () => { disposed.push(value); }; } } },
    { id: "consumer", provides: ["reader"], injects: ["value", "hostValue"], config: {}, module: { apply: (ctx: any) => { ctx.provide("reader", { read: () => ctx.get("value").read() + ctx.get("hostValue").value }); } } },
  ] });
  const baseUrl = root.context.baseUrl;
  const a = await mount("old"); const b = await mount("new");
  expect(a.getService<{ read(): string }>("reader")!.read()).toBe("oldhost");
  expect(b.getService<{ read(): string }>("reader")!.read()).toBe("newhost");
  expect(root.getService("reader")).toBeUndefined();
  await a.dispose(); expect(disposed).toEqual(["old"]);
  expect(b.getService<{ read(): string }>("reader")!.read()).toBe("newhost");
  expect(root.getService("hostValue")).toMatchObject({ value: "host" });
  expect(root.context.baseUrl).toBe(baseUrl); await b.dispose();
});
it("routes listeners by scope and disposes registrations", async () => {
  const root = await host(); const heard: string[] = [];
  let observed = 0;
  root.context.on!("probe", () => { observed++; });
  const scopes = [new AgentScope("a"), new AgentScope("b")];
  const trees = [];
  for (const scope of scopes) trees.push(await mountIsolatedCordisTree({ parent: root.context, sharedServices: [], decorate: ctx => scopeContext(ctx, scope.scopeKey, scope.disposer), entries: [{ id: "listener", provides: [], injects: [], config: {}, module: { apply: (ctx: any) => { ctx.on("probe", () => { heard.push(scope.agentId); }); } } }] }));
  root.context.emit!(scopeTarget(root.context, scopes[0]!.scopeKey), "probe");
  expect(heard).toEqual(["a"]);
  expect(observed).toBe(1);
  for (let i = 0; i < trees.length; i++) { await trees[i]!.dispose(); await scopes[i]!.dispose(); }
});
it("rejects missing dependencies and undeclared service publication without disposing Host", async () => {
  const root = await host();
  await expect(mountIsolatedCordisTree({ parent: root.context, sharedServices: [], entries: [{ id: "bad", config: {}, provides: [], injects: ["absent"], module: { apply() {} } }] })).rejects.toThrow("dependency");
  let failure = "";
  try { await mountIsolatedCordisTree({ parent: root.context, sharedServices: [], entries: [{ id: "bad", config: {}, provides: [], injects: [], module: { apply(ctx: any) { ctx.provide("leaked", {}); } } }] }); } catch (error) { failure = String(error); }
  expect(failure).toContain("Undeclared");
  expect(root.getService("leaked")).toBeUndefined(); expect(root.getService("hostValue")).toBeDefined();
  await expect(mountIsolatedCordisTree({ parent: root.context, sharedServices: [], entries: [{ id: "missing-provider", config: {}, provides: ["absent"], injects: [], module: { apply() {} } }] })).rejects.toThrow("service missing");
  await expect(mountIsolatedCordisTree({ parent: root.context, sharedServices: [], entries: [{ id: "harness", config: {}, provides: [], injects: [], module: { apply() {} } }] })).rejects.toThrow("entry id");
});
it("keeps parallel, serial and waterfall dispatch scoped with their original semantics", async () => {
  const root = await host(); const heard: string[] = [];
  const scopes = [new AgentScope("a"), new AgentScope("b")];
  const trees = [];
  for (const scope of scopes) trees.push(await mountIsolatedCordisTree({ parent: root.context, sharedServices: [], decorate: ctx => scopeContext(ctx, scope.scopeKey, scope.disposer), entries: [{ id: "listener", provides: [], injects: [], config: {}, module: { apply: (ctx: any) => {
    ctx.on("probe/parallel", async () => { heard.push(scope.agentId); });
    ctx.on("probe/serial", () => scope.agentId);
    ctx.on("probe/waterfall", async (next: () => Promise<string>) => scope.agentId + await next());
  } } }] }));
  const target = scopeTarget(root.context, scopes[0]!.scopeKey);
  await root.context.parallel!(target, "probe/parallel"); expect(heard).toEqual(["a"]);
  expect(await root.context.serial!(target, "probe/serial")).toBe("a");
  expect(await root.context.waterfall!(target, "probe/waterfall", async () => "end")).toBe("aend");
  await trees[0]!.dispose(); await scopes[0]!.dispose();
  const b = scopeTarget(root.context, scopes[1]!.scopeKey);
  expect(await root.context.serial!(b, "probe/serial")).toBe("b");
  await trees[1]!.dispose(); await scopes[1]!.dispose();
});
