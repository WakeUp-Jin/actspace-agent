import { describe, expect, it } from "vitest";
import { buildLabAgentSystemPrompt } from "../prompt";

describe("prompt assets", () => {
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
