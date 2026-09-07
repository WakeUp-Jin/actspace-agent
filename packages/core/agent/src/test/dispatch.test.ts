import { describe, expect, it } from "vitest";
import { AgentScope, carrierKeyOf, scopeContext } from "@actspace/core-scope";
import { createCordisRoot } from "@actspace/cordis-adapter";
import { createAgentEventDispatcher } from "../dispatch.js";

describe("Agent event dispatcher", () => {
  it("fuses one live subject with one opaque scope carrier", async () => {
    const scope = new AgentScope("child-agent", undefined, "scope-child");
    const subject = Object.freeze({ agentId: "child-agent", scopeId: "scope-child" });
    const dispatcher = createAgentEventDispatcher(undefined, scope, subject);
    expect(dispatcher.subject).toBe(subject);
    expect(dispatcher.scopeKey).toBe(scope.scopeKey);
    expect(carrierKeyOf(dispatcher.carrier)).toBe(scope.scopeKey);
    await dispatcher.emit("agent/status", { status: "started" });
    await scope.dispose();
  });

  it("rejects a payload carrying a different Agent subject", async () => {
    const scope = new AgentScope("agent-a", undefined, "scope-a");
    const dispatcher = createAgentEventDispatcher(undefined, scope);
    await expect(dispatcher.emit("agent/status", { agent: { agentId: "agent-b" }, status: "started" })).rejects.toThrow("does not match");
    await scope.dispose();
  });

  it("rejects a subject whose diagnostic identity belongs to another Scope", async () => {
    const scope = new AgentScope("agent-a", undefined, "scope-a");
    expect(() => createAgentEventDispatcher(undefined, scope, Object.freeze({ agentId: "agent-b", scopeId: "scope-a" }))).toThrow("does not match");
    expect(() => createAgentEventDispatcher(undefined, scope, Object.freeze({ agentId: "agent-a", scopeId: "scope-b" }))).toThrow("does not match");
    await scope.dispose();
  });

  it("fails closed after the scope starts disposal", async () => {
    const scope = new AgentScope("agent-a", undefined, "scope-a");
    const dispatcher = createAgentEventDispatcher(undefined, scope);
    const disposal = scope.dispose();
    await expect(dispatcher.serial("agent/turn-stopping", { reason: "completed" })).rejects.toThrow("disposed");
    await disposal;
  });

  it("admits parent and child listeners while excluding siblings", async () => {
    const root = await createCordisRoot();
    const parent = new AgentScope("parent");
    const child = parent.child("child");
    const sibling = parent.child("sibling");
    const seen: string[] = [];
    root.context.on?.("agent/status", () => { seen.push("global"); });
    scopeContext(root.context, parent.scopeKey).on?.("agent/status", (payload) => { if ((payload as { agent?: { agentId?: string } }).agent?.agentId === "child") seen.push("parent"); });
    scopeContext(root.context, child.scopeKey).on?.("agent/status", () => { seen.push("child"); });
    scopeContext(root.context, sibling.scopeKey).on?.("agent/status", () => { seen.push("sibling"); });
    const dispatcher = createAgentEventDispatcher(root.context, child, Object.freeze({ agentId: "child", scopeId: child.identity.scopeId }));
    await dispatcher.emit("agent/status", { status: "started" });
    expect(seen.sort()).toEqual(["child", "global", "parent"]);
    await root.dispose();
    await parent.dispose();
  });

  it("keeps same-descriptor live Agents on separate carriers", async () => {
    const root = await createCordisRoot();
    const first = new AgentScope("main:first");
    const second = new AgentScope("main:second");
    const seen: string[] = [];
    scopeContext(root.context, first.scopeKey).on?.("agent/status", (payload) => { seen.push(`first:${(payload as { agent: { agentId: string } }).agent.agentId}`); });
    scopeContext(root.context, second.scopeKey).on?.("agent/status", (payload) => { seen.push(`second:${(payload as { agent: { agentId: string } }).agent.agentId}`); });
    await createAgentEventDispatcher(root.context, first, Object.freeze({ agentId: "main:first", scopeId: first.identity.scopeId })).emit("agent/status", { status: "started" });
    await createAgentEventDispatcher(root.context, second, Object.freeze({ agentId: "main:second", scopeId: second.identity.scopeId })).emit("agent/status", { status: "started" });
    expect(seen).toEqual(["first:main:first", "second:main:second"]);
    await root.dispose();
    await Promise.all([first.dispose(), second.dispose()]);
  });

  it("waits for an in-flight Agent notification before scope disposal settles", async () => {
    const root = await createCordisRoot();
    const scope = new AgentScope("agent-a");
    let release!: () => void;
    const listenerDone = new Promise<void>((resolve) => { release = resolve; });
    scopeContext(root.context, scope.scopeKey).on?.("agent/status", async () => { await listenerDone; });
    const dispatch = createAgentEventDispatcher(root.context, scope);
    const notification = dispatch.emit("agent/status", { status: "started" });
    const disposal = scope.dispose();
    let disposed = false;
    void disposal.then(() => { disposed = true; });
    await Promise.resolve();
    expect(disposed).toBe(false);
    release();
    await Promise.all([notification, disposal]);
    expect(disposed).toBe(true);
    await root.dispose();
  });

  it("preserves continuation-based waterfall semantics on a scoped carrier", async () => {
    const root = await createCordisRoot();
    const scope = new AgentScope("agent-a");
    const context = scopeContext(root.context, scope.scopeKey);
    const order: string[] = [];
    context.on?.("agent/request", async (payload, next) => {
      order.push(`outer:${(payload as { value: string }).value}`);
      const result = await next();
      return { ...(result as object), outer: true };
    });
    context.on?.("agent/request", async (_payload, next) => {
      order.push("inner");
      return { ...(await next() as object), inner: true };
    });
    const result = await createAgentEventDispatcher(root.context, scope).waterfall("agent/request", { value: "input" }, () => ({ value: "built-in" }));
    expect(order).toEqual(["outer:input", "inner"]);
    expect(result).toMatchObject({ value: "built-in", outer: true, inner: true });
    await scope.dispose();
    await root.dispose();
  });
});
