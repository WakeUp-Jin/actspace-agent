import { describe, expect, it, vi } from "vitest";
import { CordisContextClass } from "@actspace/cordis-adapter";
import type { ContextSource } from "@actspace/context-engine";
import { AgentScope } from "@actspace/scope";
import { apply, ContextAssembly, publish, type ContextAssemblyService } from "../plugin.js";

function source(id: string): ContextSource {
  return { id, owner: `test.${id}`, order: 0, criticality: "required", fields: ["system"], get: () => undefined };
}
function options(scope: AgentScope) {
  return { scope, scopeId: scope.identity.scopeId } as unknown as Parameters<ContextAssemblyService["sourcesFor"]>[1];
}

describe("context assembly plugin lifecycle", () => {
  it("provides the registry with the configured required kinds and disposes it", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: inner => apply(inner as never, { required: ["system"] }) });
    expect((ctx.get("context.assembly") as ContextAssemblyService).requiredKinds).toEqual(["system"]);
    await ctx.fiber.dispose();
    expect(ctx.get("context.assembly")).toBeUndefined();
  });
  it("rejects a malformed required list", () => {
    expect(() => apply(new CordisContextClass() as never, { required: "system" })).toThrow(/config.required/);
  });
});

describe("context assembly", () => {
  it("builds one registry per agent from the registered kinds of its role and clears it with the scope", async () => {
    const assembly = new ContextAssembly(["system", "conversation"]);
    assembly.register({ kind: "system", create: () => source("context-system") });
    assembly.register({ kind: "conversation", create: () => source("context-conversation") });
    assembly.register({ kind: "subagents", roles: ["main"], create: () => source("context-subagents") });
    expect(assembly.kinds()).toEqual(["system", "conversation", "subagents"]);
    expect(assembly.kinds("subagent")).toEqual(["system", "conversation"]);
    const main = new AgentScope("main:test"), child = new AgentScope("child:test");
    const mainSources = assembly.sourcesFor("main", options(main));
    const childSources = assembly.sourcesFor("subagent", options(child));
    expect([...mainSources.owners()]).toEqual(["test.context-system", "test.context-conversation", "test.context-subagents"]);
    expect([...childSources.owners()]).toEqual(["test.context-system", "test.context-conversation"]);
    await main.dispose();
    expect([...mainSources.owners()]).toEqual([]);
    expect([...childSources.owners()]).toHaveLength(2);
    await child.dispose();
  });
  it("fails the agent when a required kind is missing for its role and rejects duplicate kinds", () => {
    const assembly = new ContextAssembly(["system"]);
    const remove = assembly.register({ kind: "system", roles: ["main"], create: () => source("context-system") });
    expect(() => assembly.register({ kind: "system", create: () => source("other") })).toThrow(/Duplicate context source system/);
    expect(() => assembly.sourcesFor("subagent", options(new AgentScope("child")))).toThrow(/Required context source system is unavailable/);
    remove();
    expect(assembly.kinds()).toEqual([]);
    expect(() => assembly.register({ kind: "x", roles: ["owner" as never], create: () => source("x") })).toThrow(/Unknown agent role/);
  });
  it("runs tool-result observers in registration order until one is removed", async () => {
    const assembly = new ContextAssembly([]);
    const seen: string[] = [];
    const removeFirst = assembly.registerToolResultObserver(() => { seen.push("first"); });
    assembly.registerToolResultObserver(async () => { seen.push("second"); });
    await assembly.observeToolResult({} as never, {} as never);
    removeFirst();
    await assembly.observeToolResult({} as never, {} as never);
    expect(seen).toEqual(["first", "second", "second"]);
  });
  it("publish registers with the assembly, provides context.source.<kind>, and undoes both on dispose", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: inner => apply(inner as never, { required: [] }) });
    const assembly = ctx.get("context.assembly") as ContextAssemblyService;
    const create = vi.fn(() => source("context-rules"));
    const fiber = ctx.plugin({ apply: inner => publish(inner as never, "rules", create, ["main", "fork"]) });
    await fiber;
    expect(ctx.get("context.source.rules")).toEqual({ create });
    expect(assembly.kinds("main")).toEqual(["rules"]);
    expect(assembly.kinds("subagent")).toEqual([]);
    await fiber.dispose();
    expect(assembly.kinds()).toEqual([]);
    expect(ctx.get("context.source.rules")).toBeUndefined();
    expect(() => publish(new CordisContextClass() as never, "rules", create)).toThrow(/requires context.assembly/);
  });
});
