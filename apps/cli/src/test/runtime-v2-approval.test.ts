import type { ApprovalRequest } from "@actspace/approval";
import { describe, expect, it } from "vitest";
import { CliApprovalBroker } from "../runtime-v2/approval";

describe("Runtime v2 CLI approval broker", () => {
  it("fails closed and records the request so the run result can report APPROVAL_REQUIRED", async () => {
    const broker = new CliApprovalBroker();
    const decision = await broker.requestApproval(request());

    expect(decision).toMatchObject({ requestId: "approval-1", kind: "deny", code: "broker-unavailable" });
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
    pluginId: "actspace.filesystem-read",
    toolName: "write_file",
    definitionDigest: "definition-digest",
    normalizedArgsDigest: "arguments-digest",
    reasons: [{ code: "TEST", message: "Write a workspace file.", risk: "medium" }],
    resources: [{ kind: "file", access: "write", path: "fixture.txt", targetKind: "file" }],
    requestedAt: "2026-09-23T00:00:00.000Z",
    expiresAt: "2026-09-23T00:10:00.000Z",
  });
}
