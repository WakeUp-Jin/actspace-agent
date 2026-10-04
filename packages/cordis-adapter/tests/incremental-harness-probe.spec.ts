import { Context, type Plugin } from "@deepseek-ai/cordis";
import type { Loader } from "@deepseek-ai/cordis-plugin-loader";
import { afterEach, expect, it } from "vitest";
import { createCordisRoot } from "../src/cordis-root.js";
import { mountIsolatedCordisTree } from "../src/cordis-tree.js";

// Feasibility probes against the installed Cordis family, not a production patch manager.
const roots: Awaited<ReturnType<typeof createCordisRoot>>[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await root.dispose(); });
async function host() {
  const root = await createCordisRoot(); roots.push(root);
  return { ctx: root.context as Context, loader: root.context.get!("loader") as Loader };
}
type Value = { label: string; closed: boolean };
function provider(label: string, stopped: string[] = []): Plugin {
  return { apply(ctx: Context) {
    const value: Value = { label, closed: false };
    ctx.provide("probe.value", value);
    ctx.effect(() => () => { value.closed = true; stopped.push(label); });
  } };
}

it("native replacement reuses unrelated entries but invalidates a dependent old handle", async () => {
  const { ctx, loader } = await host();
  const stopped: string[] = []; const consumers: Value[] = [];
  loader.builtins.old = provider("old", stopped);
  loader.builtins.new = provider("new", stopped);
  loader.builtins.stable = { apply(inner: Context) { inner.provide("probe.stable", {}); } };
  loader.builtins.consumer = { inject: ["probe.value"], apply(inner: Context) {
    const value = inner.get("probe.value") as Value; consumers.push(value);
    inner.provide("probe.reader", { read: () => value });
  } };
  const rows = [{ id: "provider", name: "cordis:old" }, { id: "stable", name: "cordis:stable" }, { id: "consumer", name: "cordis:consumer" }];
  await loader.root.update(rows); await loader.await();
  const stable = ctx.get("probe.stable"); const stableFiber = loader.resolve("stable").fiber;
  const oldReader = ctx.get("probe.reader") as { read(): Value };
  await loader.root.update(rows.map(row => row.id === "provider" ? { ...row, name: "cordis:new" } : row));
  await loader.await();
  expect(ctx.get("probe.stable")).toBe(stable);
  expect(loader.resolve("stable").fiber).toBe(stableFiber);
  expect(consumers.map(value => value.label)).toEqual(["old", "new"]);
  expect(oldReader.read()).toEqual({ label: "old", closed: true });
  expect((ctx.get("probe.reader") as { read(): Value }).read()).toEqual({ label: "new", closed: false });
  expect(stopped).toEqual(["old"]);
});

it("an internal/update handler retains the instance but changes what old callers observe", async () => {
  const { ctx, loader } = await host(); let starts = 0;
  loader.builtins.mutable = { apply(inner: Context, config: { label: string }) {
    starts++; const state = { ...config }; inner.provide("probe.mutable", state);
    inner.on("internal/update", (next: { label: string }) => { state.label = next.label; });
  } };
  await loader.create({ id: "mutable", name: "cordis:mutable", config: { label: "old" } });
  const held = ctx.get("probe.mutable");
  await loader.resolve("mutable").update({ config: { label: "new" } }); await loader.await();
  expect(ctx.get("probe.mutable")).toBe(held); expect(starts).toBe(1);
  expect(held).toEqual({ label: "new" });
});

it("named realms share a provider but do not retain it on behalf of live consumers", async () => {
  const { loader } = await host(); const stopped: string[] = [];
  loader.builtins.shared = provider("shared", stopped);
  loader.builtins.consumer = { inject: ["probe.value"], apply(inner: Context) {
    inner.provide("probe.reader", { value: inner.get("probe.value") });
  } };
  await loader.create({ id: "shared", name: "cordis:shared", isolate: { "probe.value": "common" } });
  for (const id of ["a", "b"]) await loader.create({ id, name: "cordis:consumer", isolate: { "probe.value": "common", "probe.reader": true } });
  await loader.await();
  const a = loader.resolve("a").ctx.get("probe.reader") as { value: Value };
  const b = loader.resolve("b").ctx.get("probe.reader") as { value: Value };
  expect(a.value).toBe(b.value);
  await loader.root.remove("a"); expect(stopped).toEqual([]);
  expect(loader.resolve("b").fiber!.state).toBe(2);
  await loader.root.remove("shared"); await loader.await();
  expect(stopped).toEqual(["shared"]); expect(b.value.closed).toBe(true);
  expect(loader.resolve("b").fiber!.state).not.toBe(2);
});

it("service isolation alone does not isolate notification delivery", async () => {
  const { ctx, loader } = await host(); const heard: string[] = [];
  loader.builtins.listener = { apply(inner: Context, config: { id: string }) {
    inner.provide("probe.value", config.id);
    inner.on("probe/notice" as never, (() => heard.push(config.id)) as never);
  } };
  for (const id of ["a", "b"]) await loader.create({ id, name: "cordis:listener", config: { id }, isolate: { "probe.value": true } });
  loader.resolve("a").ctx.emit("probe/notice" as never);
  expect(heard).toEqual(["a", "b"]); heard.length = 0;
  const a = loader.resolve("a").ctx;
  const target = { [Context.filter](listener: Context) { return listener.get("probe.value") === a.get("probe.value"); } };
  ctx.emit(target as never, "probe/notice" as never);
  expect(heard).toEqual(["a"]); heard.length = 0;
  await loader.root.remove("a"); ctx.emit("probe/notice" as never);
  expect(heard).toEqual(["b"]);
});

it("explicit owners allow an unchanged instance to coexist with old and new tool bindings", async () => {
  const { loader } = await host(); const stopped: string[] = []; let sharedStarts = 0;
  loader.builtins.common = { apply(inner: Context) {
    sharedStarts++; inner.provide("probe.common", {});
    inner.effect(() => () => { stopped.push("common"); });
  } };
  loader.builtins.old = provider("old", stopped); loader.builtins.new = provider("new", stopped);
  loader.builtins.reader = { inject: ["probe.common", "probe.value"], apply(inner: Context) {
    inner.provide("probe.reader", { common: inner.get("probe.common"), tool: inner.get("probe.value") });
  } };
  await loader.create({ id: "common", name: "cordis:common", isolate: { "probe.common": "shared-owner" } });
  for (const [id, name] of [["a", "old"], ["b", "new"]]) {
    await loader.create({ id: `${id}-tool`, name: `cordis:${name}`, isolate: { "probe.value": id } });
    await loader.create({ id: `${id}-reader`, name: "cordis:reader", isolate: { "probe.common": "shared-owner", "probe.value": id, "probe.reader": true } });
  }
  await loader.await();
  type Reader = { common: object; tool: Value };
  const a = loader.resolve("a-reader").ctx.get("probe.reader") as Reader;
  const b = loader.resolve("b-reader").ctx.get("probe.reader") as Reader;
  expect(sharedStarts).toBe(1); expect(a.common).toBe(b.common);
  expect(a.tool).toEqual({ label: "old", closed: false });
  expect(b.tool).toEqual({ label: "new", closed: false });
  // The fixture explicitly owns retirement; Cordis does not count Run leases.
  await loader.root.remove("a-reader"); await loader.root.remove("a-tool");
  expect(stopped).toEqual(["old"]); expect(b.tool.closed).toBe(false);
  expect(loader.resolve("b-reader").fiber!.state).toBe(2);
  await loader.root.remove("b-reader"); await loader.root.remove("b-tool");
  expect(stopped).toEqual(["old", "new"]);
  await loader.root.remove("common"); expect(stopped).toEqual(["old", "new", "common"]);
});

it("failed in-place replacement restores a new old implementation, not the held instance", async () => {
  const { ctx, loader } = await host(); const stopped: string[] = [];
  loader.builtins.old = provider("old", stopped);
  loader.builtins.broken = { apply() { throw new Error("candidate failed"); } };
  await loader.create({ id: "provider", name: "cordis:old" });
  const held = ctx.get("probe.value") as Value;
  await expect(loader.resolve("provider").update({ name: "cordis:broken" })).rejects.toThrow();
  await loader.await();
  expect(held.closed).toBe(true);
  expect(ctx.get("probe.value")).toEqual({ label: "old", closed: false });
  expect(ctx.get("probe.value")).not.toBe(held); expect(stopped).toEqual(["old"]);
});

it("independent current Harness trees preserve old state but duplicate unchanged instances", async () => {
  const { ctx } = await host(); let starts = 0; const stopped: string[] = [];
  const unchanged = { apply(inner: Context) {
    starts++; inner.provide("stable", {});
    inner.effect(() => () => { stopped.push("stable"); });
  } };
  const mount = (label: string) => mountIsolatedCordisTree({ parent: ctx, sharedServices: [], entries: [
    { id: "stable", module: unchanged, config: {}, provides: ["stable"], injects: [] },
    { id: "tool", module: provider(label, stopped), config: {}, provides: ["probe.value"], injects: [] },
  ] });
  const a = await mount("old"); const b = await mount("new");
  expect(starts).toBe(2); expect(a.getService("stable")).not.toBe(b.getService("stable"));
  expect(a.getService("probe.value")).toEqual({ label: "old", closed: false });
  await a.dispose();
  expect(stopped).toContain("old"); expect(stopped).not.toContain("new");
  expect(b.getService("probe.value")).toEqual({ label: "new", closed: false });
  await b.dispose(); expect(stopped.filter(value => value === "stable")).toHaveLength(2);
});

it("disposal awaits registered async cleanup and removes listeners", async () => {
  const { ctx, loader } = await host(); let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let notices = 0; let cleaned = false;
  loader.builtins.resource = { apply(inner: Context) {
    inner.on("probe/notice" as never, (() => { notices++; }) as never);
    inner.effect(() => async () => { entered(); await gate; cleaned = true; });
  } };
  await loader.create({ id: "resource", name: "cordis:resource" });
  ctx.emit("probe/notice" as never); expect(notices).toBe(1);
  let finished = false; const pending = loader.root.remove("resource").then(() => { finished = true; });
  try { await started; expect(finished).toBe(false); expect(cleaned).toBe(false); }
  finally { release(); await pending; }
  expect(cleaned).toBe(true); ctx.emit("probe/notice" as never); expect(notices).toBe(1);
});
