import type { ToolApprovalRequest } from "@actspace/agent-core";
import { describe, expect, it } from "vitest";
import { TerminalApprovalBroker } from "../terminal-approval";
import { ScriptedLineInput } from "./terminal-test-input";

describe("TerminalApprovalBroker", () => {
  it("maps terminal decisions and hides allow-similar for delete", async () => {
    const input = new ScriptedLineInput(["y", "a", "n"]);
    let output = "";
    const broker = new TerminalApprovalBroker("default", "/tmp/work", input, (text) => { output += text; });
    broker.setCurrentTurn("session-1", "turn-1");

    await expect(broker.waitForDecision(request("request-1", "write_file"))).resolves.toMatchObject({
      decision: "approve_once",
    });
    await expect(broker.waitForDecision(request("request-2", "write_file"))).resolves.toMatchObject({
      decision: "allow_similar",
    });
    await expect(broker.waitForDecision(request("request-3", "delete_file"))).resolves.toMatchObject({
      decision: "deny",
    });
    expect(output).toContain("Tool: delete_file");
    expect(input.prompts.at(-1)).not.toContain("similar");
  });

  it("resolves a pending approval when the turn aborts", async () => {
    const input = new ScriptedLineInput([]);
    const broker = new TerminalApprovalBroker("default", "/tmp/work", input, () => {});
    broker.setCurrentTurn("session-1", "turn-1");
    const pending = broker.waitForDecision(request("request-1", "write_file"));
    await Promise.resolve();
    expect(broker.abortTurn("session-1", "turn-1")).toBe(1);
    await expect(pending).resolves.toMatchObject({ decision: "abort" });
  });
});

function request(id: string, toolName: string): ToolApprovalRequest {
  return {
    id,
    toolName,
    args: { path: "README.md" },
    summary: `Run ${toolName}`,
    reason: "Needs approval",
    sessionId: "session-1",
    turnId: "turn-1",
    createdAt: Date.now(),
  };
}
