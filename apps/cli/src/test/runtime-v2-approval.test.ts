import type { ApprovalRequest } from "@actspace/tools-approval";
import { describe, expect, it } from "vitest";
import { CliV2ApprovalBroker } from "../runtime-v2/approval";
import { ScriptedLineInput } from "./terminal-test-input";

describe("Runtime v2 CLI approval broker", () => {
  it("prompts an interactive host until it receives an explicit allow decision", async () => {
    const input = new ScriptedLineInput(["maybe", "y"]);
    let output = "";
    const decision = await new CliV2ApprovalBroker(input, (text) => { output += text; })
      .requestApproval(request(), new AbortController().signal);

    expect(decision).toMatchObject({ requestId: "approval-1", kind: "once" });
    expect(input.prompts).toEqual([
      "Approve? [y] once / [n] deny: ",
      "Approve? [y] once / [n] deny: ",
    ]);
    expect(output).toContain("Approval required");
    expect(output).toContain("Please enter y or n.");
  });

  it("fails closed without an interactive input surface", async () => {
    const broker = new CliV2ApprovalBroker();
    const decision = await broker.requestApproval(request(), new AbortController().signal);

    expect(decision).toMatchObject({ kind: "deny", code: "broker-unavailable" });
    expect(broker.approvalRequired).toEqual(request());
  });
});

function request(): ApprovalRequest {
  return Object.freeze({
    schemaVersion: 1,
    requestId: "approval-1",
    callId: "call-1",
    sessionId: "session-1",
    agentRunId: "run-1",
    agentId: "main:session-1",
    pluginId: "actspace.core-tools",
    toolName: "write_file",
    definitionDigest: "definition-digest",
    normalizedArgsDigest: "arguments-digest",
    reasons: [{ code: "TEST", message: "Write a workspace file.", risk: "medium" }],
    resources: [{ kind: "file", access: "write", path: "fixture.txt", targetKind: "file" }],
    requestedAt: "2026-09-23T00:00:00.000Z",
    expiresAt: "2026-09-23T00:10:00.000Z",
  });
}
