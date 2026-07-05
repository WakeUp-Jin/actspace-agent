import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

import { createToolManager } from "../index";
import type { ApprovalGate } from "../scheduler";
import { createEditPermissionChecker } from "../tools/edit-file-diff/permissions";
import { createWritePermissionChecker } from "../tools/write-file/permissions";
import { writeFileExecutor } from "../tools/write-file/executor";
import { editFileDiffExecutor } from "../tools/edit-file-diff/executor";
import { APPROVED_OUTSIDE_BOUNDARY_ARG } from "../workspace-guard";

function tempDir(): string {
  return join(tmpdir(), `actspace-boundary-${randomBytes(6).toString("hex")}`);
}

let workspace: string;
let outside: string;

beforeEach(async () => {
  workspace = tempDir();
  outside = tempDir();
  await mkdir(workspace, { recursive: true });
  await mkdir(outside, { recursive: true });
});

afterEach(async () => {
  await Promise.all([
    rm(workspace, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true }),
  ]);
});

describe("write/edit boundary permission checkers", () => {
  it("allows in-workspace paths without the approval flag", async () => {
    const check = createWritePermissionChecker(workspace);
    const result = await check({ path: "notes.md", content: "hi" });

    expect(result.decision).toBe("allow");
    expect(result.sanitizedArgs?.path).toBe(join(workspace, "notes.md"));
    expect(result.sanitizedArgs).not.toHaveProperty(APPROVED_OUTSIDE_BOUNDARY_ARG);
  });

  it("asks for approval on out-of-workspace paths instead of denying", async () => {
    const check = createEditPermissionChecker(workspace);
    const target = join(outside, "vocab.md");
    const result = await check({ path: target, old_string: "a", new_string: "b" });

    expect(result.decision).toBe("ask");
    expect(result.riskLevel).toBe("medium");
    expect(result.summary).toContain("(outside workspace)");
    expect(result.reason).toContain(target);
    expect(result.sanitizedArgs?.[APPROVED_OUTSIDE_BOUNDARY_ARG]).toBe(true);
    expect(result.sanitizedArgs?.path).toBe(target);
  });

  it("strips a model-supplied approval flag for in-workspace paths", async () => {
    const check = createWritePermissionChecker(workspace);
    const result = await check({
      path: "notes.md",
      content: "hi",
      [APPROVED_OUTSIDE_BOUNDARY_ARG]: true,
    });

    expect(result.decision).toBe("allow");
    expect(result.sanitizedArgs).not.toHaveProperty(APPROVED_OUTSIDE_BOUNDARY_ARG);
  });

  it("keeps additionalWritableRoots as allow (no approval needed)", async () => {
    const check = createWritePermissionChecker(workspace, [outside]);
    const result = await check({ path: join(outside, "inbox.md"), content: "hi" });

    expect(result.decision).toBe("allow");
    expect(result.sanitizedArgs).not.toHaveProperty(APPROVED_OUTSIDE_BOUNDARY_ARG);
  });
});

describe("write/edit executors honor the approval flag", () => {
  it("write executor still blocks out-of-workspace paths without the flag", async () => {
    const target = join(outside, "x.md");
    const result = await writeFileExecutor({ path: target, content: "hi" }, workspace);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Path escapes writable boundary");
    expect(existsSync(target)).toBe(false);
  });

  it("write executor writes out-of-workspace when the flag is set", async () => {
    const target = join(outside, "x.md");
    const result = await writeFileExecutor(
      { path: target, content: "hi", [APPROVED_OUTSIDE_BOUNDARY_ARG]: true },
      workspace,
    );

    expect(result.success).toBe(true);
    expect(await readFile(target, "utf-8")).toBe("hi");
  });

  it("edit executor creates out-of-workspace file when the flag is set", async () => {
    const target = join(outside, "new.md");
    const result = await editFileDiffExecutor(
      { path: target, old_string: "", new_string: "content", [APPROVED_OUTSIDE_BOUNDARY_ARG]: true },
      workspace,
    );

    expect(result.success).toBe(true);
    expect(await readFile(target, "utf-8")).toBe("content");
  });
});

function createGate(decision: "approve_once" | "deny"): ApprovalGate {
  return {
    waitForDecision: async (request) => ({
      requestId: request.id,
      decision,
      decidedAt: Date.now(),
    }),
  };
}

describe("out-of-workspace write via ToolManager approval flow", () => {
  it("executes the write after the user approves", async () => {
    const manager = createToolManager({ workspaceRoot: workspace, approvalGate: createGate("approve_once") });
    const target = join(outside, "approved.md");

    const result = await manager.execute("write_file", { path: target, content: "approved content" });

    expect(result.success).toBe(true);
    expect(await readFile(target, "utf-8")).toBe("approved content");
  });

  it("refuses the write when the user denies", async () => {
    const manager = createToolManager({ workspaceRoot: workspace, approvalGate: createGate("deny") });
    const target = join(outside, "denied.md");

    const result = await manager.execute("write_file", { path: target, content: "nope" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("User denied tool: write_file");
    expect(existsSync(target)).toBe(false);
  });

  it("does not ask for in-workspace writes", async () => {
    let asked = false;
    const gate: ApprovalGate = {
      waitForDecision: async (request) => {
        asked = true;
        return { requestId: request.id, decision: "deny", decidedAt: Date.now() };
      },
    };
    const manager = createToolManager({ workspaceRoot: workspace, approvalGate: gate });

    const result = await manager.execute("write_file", { path: "inside.md", content: "ok" });

    expect(asked).toBe(false);
    expect(result.success).toBe(true);
    expect(await readFile(join(workspace, "inside.md"), "utf-8")).toBe("ok");
  });
});
