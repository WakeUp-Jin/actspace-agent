import { describe, expect, it } from "vitest";
import { AgentScope } from "@actspace/core-scope";
import type { ToolRuntime } from "@actspace/tools-runtime";
import { activateMainAgentFormTools, mainAgentFormComposition, MAIN_AGENT_FORM } from "../agent-form.js";
import { AGENT_MODE_TOOLS, allowedAgentModeTools } from "../agent-mode-policy.js";

function runtime(missing: readonly string[] = []): ToolRuntime {
  return { registry: { listDefinitions: () => MAIN_AGENT_FORM.members.flatMap(member => member.toolNames
    .filter(name => !missing.includes(name))
    .map(name => ({ name, pluginId: member.id }))) } } as unknown as ToolRuntime;
}

describe("main Agent form", () => {
  it("binds each member to its own scope and releases contributions independently", async () => {
    const first = new AgentScope("first");
    const second = new AgentScope("second");
    const formed = activateMainAgentFormTools(first, runtime(MAIN_AGENT_FORM.members.at(-1)!.toolNames));
    activateMainAgentFormTools(second, runtime());
    expect(formed.members.map(member => member.id)).not.toContain("actspace.browser-tools");
    expect(first.tools.get("read_file")?.owner).toBe("actspace.filesystem-read");
    expect(first.tools.get("browser_help")).toBeUndefined();
    expect(second.tools.get("browser_help")?.owner).toBe("actspace.browser-tools");
    await first.dispose();
    await first.dispose();
    expect(first.tools.entries()).toEqual([]);
    expect(second.tools.get("read_file")).toBeDefined();
    await second.dispose();
  });

  it("fails closed and cleans registered members when required activation is incomplete", async () => {
    const scope = new AgentScope("failed");
    expect(() => activateMainAgentFormTools(scope, runtime(["todo_write"]))).toThrow(/actspace.todo/);
    await scope.dispose();
    expect(scope.tools.entries()).toEqual([]);
  });

  it("keeps Chat at exactly two tools and never auto-admits new registrations", () => {
    expect(AGENT_MODE_TOOLS.chat).toEqual(["web", "generate_image"]);
    expect([...allowedAgentModeTools("chat", ["web", "generate_image", "new_tool"])]).toEqual(["web", "generate_image"]);
    expect(AGENT_MODE_TOOLS.plan).not.toContain("bash");
    expect(AGENT_MODE_TOOLS.plan).not.toContain("write_file");
  });

  it("records a stable member digest separate from Host plugin provenance", () => {
    const required = mainAgentFormComposition([]);
    const browser = mainAgentFormComposition([{ id: "actspace.browser-tools", version: "2.0.0" }]);
    expect(required.members).toHaveLength(11);
    expect(browser.members).toHaveLength(12);
    expect(browser.digest).not.toBe(required.digest);
    expect(mainAgentFormComposition([{ id: "unrelated.host-plugin", version: "1.0.0" }]).digest).toBe(required.digest);
  });
});
