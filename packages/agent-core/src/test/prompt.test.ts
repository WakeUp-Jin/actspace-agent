import { describe, expect, it } from "vitest";
import { buildLabAgentSystemPrompt } from "../prompt";
import { MAIN_AGENT_SYSTEM_PROMPT } from "../prompt/main-agent";

describe("prompt assets", () => {
  it("defines AgentRun-scoped Todo usage rules", () => {
    expect(MAIN_AGENT_SYSTEM_PROMPT).toContain("at least three independent steps");
    expect(MAIN_AGENT_SYSTEM_PROMPT).toContain("at most one Todo in_progress");
    expect(MAIN_AGENT_SYSTEM_PROMPT).toContain("current main AgentRun execution list");
  });

  it("builds Lab Agent handoff instructions with the resolved inbox path", () => {
    const prompt = buildLabAgentSystemPrompt({
      labInboxPath: "/tmp/actspace/kairos/inbox/lab-agent.md",
    });

    expect(prompt).toContain("/tmp/actspace/kairos/inbox/lab-agent.md");
    expect(prompt).toContain("Lab handoff");
    expect(prompt).toContain("append-only");
    expect(prompt).toContain("Do not mark entries as Processed");
  });
});
