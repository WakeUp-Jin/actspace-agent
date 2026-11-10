import { describe, expect, it } from "vitest";
import { AgentScope } from "@actspace/scope";
import type { ToolRuntime } from "@actspace/tool-runtime";
import { activateAgentFormTools, agentFormComposition, defineMainAgentForm, type AgentFormMember } from "../agent-form.js";
import { allowedAgentModeTools, type ModeVisibleTool } from "../agent-mode-policy.js";

const MEMBERS: readonly AgentFormMember[] = [
  { id: "test.read", version: 2, required: true, toolNames: ["read_file", "list_directory"] },
  { id: "test.todo", version: 1, required: true, toolNames: ["todo_read", "todo_write"] },
  { id: "test.browser", version: 2, required: false, toolNames: ["browser_help"] },
];
const FORM = defineMainAgentForm(MEMBERS);

function runtime(missing: readonly string[] = []): ToolRuntime {
  return { registry: { listDefinitions: () => MEMBERS.flatMap(member => member.toolNames
    .filter(name => !missing.includes(name))
    .map(name => ({ name, pluginId: member.id }))) } } as unknown as ToolRuntime;
}

describe("main Agent form", () => {
  it("binds each member to its own scope and releases contributions independently", async () => {
    const first = new AgentScope("first");
    const second = new AgentScope("second");
    const formed = activateAgentFormTools(FORM, first, runtime(["browser_help"]));
    activateAgentFormTools(FORM, second, runtime());
    expect(formed.members.map(member => member.id)).toEqual(["test.read", "test.todo"]);
    expect(first.tools.get("read_file")?.owner).toBe("test.read");
    expect(first.tools.get("browser_help")).toBeUndefined();
    expect(second.tools.get("browser_help")?.owner).toBe("test.browser");
    await first.dispose();
    await first.dispose();
    expect(first.tools.entries()).toEqual([]);
    expect(second.tools.get("read_file")).toBeDefined();
    await second.dispose();
  });

  it("fails closed and cleans registered members when required activation is incomplete", async () => {
    const scope = new AgentScope("failed");
    expect(() => activateAgentFormTools(FORM, scope, runtime(["todo_write"]))).toThrow(/test.todo/);
    await scope.dispose();
    expect(scope.tools.entries()).toEqual([]);
  });

  it("rejects duplicate members, shared tool names, toolless members and zero versions", () => {
    expect(() => defineMainAgentForm([MEMBERS[0]!, MEMBERS[0]!])).toThrow(/listed twice/);
    expect(() => defineMainAgentForm([MEMBERS[0]!, { id: "test.other", version: 1, required: true, toolNames: ["read_file"] }])).toThrow(/claimed by both/);
    expect(() => defineMainAgentForm([{ id: "test.empty", version: 1, required: true, toolNames: [] }])).toThrow(/contributes no tools/);
    expect(() => defineMainAgentForm([{ id: "test.zero", version: 0, required: true, toolNames: ["x"] }])).toThrow(/positive version/);
  });

  it("records a stable member digest separate from Host plugin provenance", () => {
    const required = agentFormComposition(FORM, []);
    const browser = agentFormComposition(FORM, [{ id: "test.browser", version: "2.0.0" }]);
    expect(required.members).toHaveLength(2);
    expect(browser.members).toHaveLength(3);
    expect(browser.digest).not.toBe(required.digest);
    expect(agentFormComposition(FORM, [{ id: "unrelated.host-plugin", version: "1.0.0" }]).digest).toBe(required.digest);
  });
});

describe("mode policy", () => {
  const tool = (name: string, modes: ModeVisibleTool["modes"], pluginId = "test.tools"): ModeVisibleTool => ({ name, pluginId, modes });
  const definitions = [tool("web", ["chat"]), tool("read_file", ["plan", "agent"]), tool("bash", ["agent"]), tool("hidden", [])];

  it("shows a tool only in the modes its definition declares", () => {
    expect([...allowedAgentModeTools("chat", definitions)]).toEqual(["web"]);
    expect([...allowedAgentModeTools("plan", definitions)]).toEqual(["read_file"]);
    expect([...allowedAgentModeTools("agent", definitions)]).toEqual(["read_file", "bash"]);
    expect(() => allowedAgentModeTools("other" as never, definitions)).toThrow(/Unsupported Agent mode/);
  });

  it("admits evolved tools only in Agent mode whatever they declare", () => {
    const evolved = tool("custom_echo", ["chat", "plan", "agent"], "actspace.evolved.custom_echo");
    for (const mode of ["chat", "plan"] as const) expect([...allowedAgentModeTools(mode, [evolved])]).toEqual([]);
    expect([...allowedAgentModeTools("agent", [evolved])]).toEqual(["custom_echo"]);
  });
});
