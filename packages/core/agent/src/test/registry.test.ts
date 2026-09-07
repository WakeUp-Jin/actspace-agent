import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../registry.js";

describe("AgentRegistry", () => {
  it("publishes and unpublishes handles with conflict protection", async () => {
    const registry = new AgentRegistry();
    const agent = { agentId: "a", descriptor: {} as never, scope: {} as never, session: {} as never, subject: { agentId: "a", scopeId: "scope-a" }, dispose: async () => undefined };
    const remove = registry.publish(agent);
    expect(registry.get("a")).toBe(agent);
    expect(() => registry.publish(agent)).toThrow("already exists");
    remove();
    expect(registry.list()).toEqual([]);
  });
});
