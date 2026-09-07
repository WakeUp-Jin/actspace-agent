import type { ApprovalRequest } from "@actspace/tools-approval";
import { describe, expect, it } from "vitest";
import { CliV2ApprovalBroker } from "../runtime-v2/approval";
import { ScriptedLineInput } from "./terminal-test-input";

describe("Runtime v2 CLI approval broker", () => {
  it("prompts an interactive host until it receives an explicit allow decision", async () => {
    const input = new ScriptedLineInput(["maybe", "y"]);
    let output = "";
    const decision = await new CliV2ApprovalBroker("default", input, (text) => { output += text; })
      .requestApproval(request(), new AbortController().signal);

    expect(decision).toMatchObject({ requestId: "approval-1", decision: "allow", reason: "user approved" });
    expect(input.prompts).toEqual([
      "Approve? [y] once / [n] deny: ",
      "Approve? [y] once / [n] deny: ",
    ]);
    expect(output).toContain("Approval required");
    expect(output).toContain("Please enter y or n.");
  });

  it("fails closed without an interactive input surface", async () => {
    const broker = new CliV2ApprovalBroker("default");
    const decision = await broker.requestApproval(request(), new AbortController().signal);

    expect(decision).toMatchObject({ decision: "deny", reason: "non-interactive host" });
    expect(broker.approvalRequired).toEqual(request());
  });
});

function request(): ApprovalRequest {
  return Object.freeze({
    requestId: "approval-1",
    callId: "call-1",
    sessionId: "session-1",
    agentRunId: "run-1",
    pluginId: "actspace.core-tools",
    name: "write_file",
    definitionDigest: "definition-digest",
    normalizedArgsDigest: "arguments-digest",
    requestedEffects: ["write"],
    reason: "Write a workspace file.",
    risk: "medium",
    argumentSummary: { path: "fixture.txt" },
  });
}
