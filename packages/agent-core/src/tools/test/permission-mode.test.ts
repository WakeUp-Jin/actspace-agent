import { describe, expect, it } from "vitest";
import { createApprovalGateForPermissionMode } from "../permission-mode";

describe("createApprovalGateForPermissionMode", () => {
  it("returns undefined for default mode", () => {
    expect(createApprovalGateForPermissionMode("default", "/tmp/workspace")).toBeUndefined();
  });

  it("returns undefined for trusted mode", () => {
    expect(createApprovalGateForPermissionMode("trusted", "/tmp/workspace")).toBeUndefined();
  });

  it("auto-approves workspace local yolo requests", async () => {
    const gate = createApprovalGateForPermissionMode("yolo", "/tmp/workspace");
    const decision = await gate!.waitForDecision({
      id: "req1",
      toolName: "write_file",
      args: { path: "src/index.ts" },
      summary: "write",
      reason: "test",
      createdAt: 1,
    });
    expect(decision.decision).toBe("approve_once");
  });

  it("denies yolo requests that reference outside paths", async () => {
    const gate = createApprovalGateForPermissionMode("yolo", "/tmp/workspace");
    const decision = await gate!.waitForDecision({
      id: "req1",
      toolName: "write_file",
      args: { path: "/etc/passwd" },
      summary: "write",
      reason: "test",
      createdAt: 1,
    });
    expect(decision.decision).toBe("deny");
  });

  it("denies yolo requests when any nested path escapes the workspace", async () => {
    const gate = createApprovalGateForPermissionMode("yolo", "/tmp/workspace");
    const decision = await gate!.waitForDecision({
      id: "req1",
      toolName: "edit_file",
      args: {
        edits: [
          { filePath: "src/index.ts" },
          { filePath: "/etc/hosts" },
        ],
      },
      summary: "edit",
      reason: "test",
      createdAt: 1,
    });
    expect(decision.decision).toBe("deny");
  });
});
