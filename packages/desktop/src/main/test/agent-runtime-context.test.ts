// @vitest-environment node
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadMainAgentRuntimeContext } from "../agent-runtime-context";

describe("loadMainAgentRuntimeContext", () => {
  it("injects the Main Agent Kairos handoff segment with an absolute writable inbox path", async () => {
    const dataRoot = "/tmp/actspace-user-data";
    const workspaceRoot = "/tmp/workspace";
    const inboxRoot = join(dataRoot, "kairos", "inbox");
    const inboxPath = join(inboxRoot, "main-agent.md");

    const context = await loadMainAgentRuntimeContext({
      dataRoot,
      workspaceRoot,
      readPromptFile: async () => ({
        path: join(dataRoot, "prompts", "main-agent.md"),
        content: "CUSTOM_MAIN_PROMPT",
      }),
    });

    expect(context.systemPrompt).toBe("CUSTOM_MAIN_PROMPT");
    expect(context.additionalWritableRoots).toEqual([inboxRoot]);

    const handoff = context.systemPromptSegments?.find((segment) => segment.id === "main_agent_kairos_handoff");
    expect(handoff).toBeDefined();
    expect(handoff?.content).toContain(inboxPath);
    expect(handoff?.content).toContain("append-only");
    expect(handoff?.content).toContain("Do not mark entries as Processed");
  });
});
