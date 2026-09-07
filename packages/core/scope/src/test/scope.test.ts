import { describe, expect, it } from "vitest";
import { AgentScope, bindScopeParent, carrierKeyOf, scopeActiveOf, scopeChainOf, scopeContext, scopeParentOf, scopeTarget } from "../scope.js";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { ScopedRegistry } from "../layered-registry.js";

describe("AgentScope", () => {
  it("uses child-first shadowing and disposes registrations", async () => {
    const root = new AgentScope("main", undefined, "root");
    const child = root.child("explore", "child");
    let disposed = 0;
    root.contributors.register({ id: "plugin/context", owner: "plugin", value: "root" });
    child.contributors.register({ id: "plugin/context", owner: "plugin", value: "child" }, () => { disposed += 1; });
    child.contributors.register({ id: "plugin/extra", owner: "plugin", value: "extra" });
    expect(child.contributors.get("plugin/context")?.value).toBe("child");
    expect(child.contributors.entries().map((entry) => entry.id)).toEqual(["plugin/context", "plugin/extra"]);
    await child.dispose();
    expect(disposed).toBe(1);
    expect(() => child.assertActive()).toThrow("disposed");
    await root.dispose();
  });

  it("uses identity keys and an explicit parent chain", () => {
    const root = new AgentScope("root", undefined, "root");
    const child = root.child("child", "child");
    const sibling = root.child("sibling", "sibling");

    expect(child.scopeKey).not.toBe(root.scopeKey);
    expect(child.scopeKey).not.toBe(sibling.scopeKey);
    expect(scopeParentOf(child.scopeKey)).toBe(root.scopeKey);
    expect(scopeChainOf(child.scopeKey)).toEqual([child.scopeKey, root.scopeKey]);
    expect(scopeChainOf(sibling.scopeKey)).toEqual([sibling.scopeKey, root.scopeKey]);

    void root.dispose();
  });

  it("rejects cycles and duplicate parent binds", () => {
    const root = {};
    const child = {};
    const grandchild = {};
    bindScopeParent(child, root);
    bindScopeParent(grandchild, child);
    expect(() => bindScopeParent(child, root)).toThrow("already bound");
    expect(() => bindScopeParent(root, grandchild)).toThrow("cycle");
  });

  it("rebinds only through the original parent binding", () => {
    const first = {};
    const second = {};
    const child = {};
    const binding = bindScopeParent(child, first);
    binding.rebind(second);
    expect(scopeParentOf(child)).toBe(second);
    expect(scopeChainOf(child)).toEqual([child, second]);
  });

  it("preserves inherited insertion order while applying nearest shadow", () => {
    const root = new AgentScope("root", undefined, "root");
    const child = root.child("child", "child");
    root.contributors.register({ id: "root/first", owner: "plugin", value: "first" });
    root.contributors.register({ id: "shared", owner: "plugin", value: "root" });
    child.contributors.register({ id: "shared", owner: "plugin", value: "child" });
    child.contributors.register({ id: "child/last", owner: "plugin", value: "last" });

    expect(child.contributors.entries().map((entry) => [entry.id, entry.value])).toEqual([
      ["root/first", "first"],
      ["shared", "child"],
      ["child/last", "last"],
    ]);
    expect(root.contributors.get("shared")?.value).toBe("root");

    void root.dispose();
  });

  it("resolves a shared registry from the same key relation after rebind", () => {
    const registry = new ScopedRegistry<string>();
    const first = {};
    const second = {};
    const child = {};
    const binding = bindScopeParent(child, first);
    const firstView = registry.forScope(first);
    const secondView = registry.forScope(second);
    const childView = registry.forScope(child);
    registry.register({ id: "global", owner: "plugin", value: "global" });
    firstView.register({ id: "parent", owner: "plugin", value: "first" });
    secondView.register({ id: "parent", owner: "plugin", value: "second" });
    expect(childView.get("parent")?.value).toBe("first");
    binding.rebind(second);
    expect(childView.get("parent")?.value).toBe("second");
    expect(childView.entries().map((entry) => entry.id)).toEqual(["global", "parent"]);
  });

  it("supports an explicit isolated child without parent registry inheritance", async () => {
    const parent = new AgentScope("parent", undefined, "parent");
    const child = parent.isolatedChild("child", "child");
    parent.contributors.register({ id: "parent-only", owner: "plugin", value: true });
    expect(child.parent).toBeUndefined();
    expect(child.contributors.get("parent-only")).toBeUndefined();
    expect(scopeChainOf(child.scopeKey)).toEqual([child.scopeKey]);
    await child.dispose();
    await parent.dispose();
  });

  it("waits for child scope cleanup when the parent is disposed", async () => {
    const parent = new AgentScope("parent", undefined, "parent");
    const child = parent.child("child", "child");
    let childDisposed = false;
    child.disposer.add(async () => {
      await Promise.resolve();
      childDisposed = true;
    });
    await parent.dispose();
    expect(childDisposed).toBe(true);
    expect(child.disposer.state).toBe("disposed");
    expect(parent.disposer.state).toBe("disposed");
  });

  it("closes a scope carrier before asynchronous disposal completes", async () => {
    const scope = new AgentScope("root", undefined, "root");
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    scope.disposer.add(async () => pending);
    const disposal = scope.dispose();
    expect(scopeActiveOf(scope.scopeKey)).toBe(false);
    release();
    await disposal;
    expect(scopeActiveOf(scope.scopeKey)).toBe(false);
  });

  it("closes a scope carrier when its exposed disposer is used directly", async () => {
    const scope = new AgentScope("root", undefined, "root-direct-dispose");
    const carrier = scopeTarget({}, scope.scopeKey) as unknown as Record<PropertyKey, unknown>;
    const filter = carrier[CordisContextClass.filter] as (context: object) => boolean;
    const disposal = scope.disposer.dispose();
    expect(scopeActiveOf(scope.scopeKey)).toBe(false);
    expect(filter(taggedContext(scope.scopeKey))).toBe(false);
    await disposal;
  });

  it("admits only the target scope and its active ancestors", async () => {
    const root = new AgentScope("root", undefined, "root");
    const child = root.child("child", "child");
    const sibling = root.child("sibling", "sibling");
    const carrier = scopeTarget({}, child.scopeKey) as unknown as Record<PropertyKey, unknown>;
    const filter = carrier[CordisContextClass.filter] as (context: object) => boolean;

    expect(carrierKeyOf(carrier)).toBe(child.scopeKey);
    expect(filter(taggedContext(child.scopeKey))).toBe(true);
    expect(filter(taggedContext(root.scopeKey))).toBe(true);
    expect(filter(taggedContext(sibling.scopeKey))).toBe(false);
    expect(filter({})).toBe(true);

    await root.dispose();
    expect(filter(taggedContext(child.scopeKey))).toBe(false);
    expect(filter({})).toBe(false);
  });

  it("cancels an explicit registration disposer when the registration is removed", async () => {
    const scope = new AgentScope("root", undefined, "root");
    let disposed = 0;
    const remove = scope.contributors.register({ id: "owned", owner: "plugin", value: true }, () => { disposed += 1; });
    remove();
    await scope.dispose();
    expect(disposed).toBe(0);
  });

  it("owns Cordis listener registration through the Scope disposer", async () => {
    const { createCordisRoot } = await import("@actspace/cordis-adapter");
    const root = await createCordisRoot();
    const scope = new AgentScope("root");
    const seen: string[] = [];
    const scoped = scopeContext(root.context, scope.scopeKey, scope.disposer);
    scoped.on?.("agent/status", () => { seen.push("scoped"); });
    await root.context.emit?.("agent/status", { status: "before" });
    expect(seen).toEqual(["scoped"]);
    await scope.dispose();
    await root.context.emit?.("agent/status", { status: "after" });
    expect(seen).toEqual(["scoped"]);
    await root.dispose();
  });
});

function taggedContext(key: object) {
  return scopeContext({ extend: (meta: Record<PropertyKey, unknown>) => meta } as never, key as never);
}
