import { describe, expect, it } from "vitest";
import { createApprovalGate } from "../permission";

describe("createApprovalGate", () => {
  it("returns undefined for default mode", () => {
    expect(createApprovalGate("default", "/tmp/workspace")).toBeUndefined();
  });

  it("auto-approves workspace local yolo requests", async () => {
    const gate = createApprovalGate("yolo", "/tmp/workspace");
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
    const gate = createApprovalGate("yolo", "/tmp/workspace");
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
});
