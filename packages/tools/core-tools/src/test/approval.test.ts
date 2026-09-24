import { describe, expect, it } from "vitest";
import { ToolRuntime, type ToolPreparedEnvironment } from "@actspace/tools-runtime";
import { registerCoreTools } from "../plugin.js";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("default core tool approvals", () => {
  it("only asks for Bash while preserving path and argument guards", async () => {
    const tools = new ToolRuntime();
    const workspaceRoot = await mkdtemp(join(tmpdir(), "actspace-permission-"));
    await writeFile(join(workspaceRoot, "a"), "a");
    const called: string[] = [];
    const approvals: string[] = [];
    const ports = Object.fromEntries(["write_file", "edit_file", "delete_file", "bash"].map((name) => [name, async () => { called.push(name); return { status: "completed" as const, summary: "ok", modelOutput: [] }; }]));
    const registrations = registerCoreTools(tools, ports);
    const env: ToolPreparedEnvironment = {
      workspaceRoot, hostCapabilities: new Set(["filesystem.write", "process"]),
      capabilitySet: { ids: [], has: () => false, get: () => { throw Error("unused"); } },
      approvalBroker: { requestApproval: async (request) => { approvals.push(request.toolName); return { requestId: request.requestId, kind: "once", decidedAt: new Date().toISOString() }; } },
      journal: { recordDispatch: async () => {}, checkpointBeforeBody: async () => {}, commitResult: async () => {} },
      createArtifact: async () => { throw Error("unused"); },
    };
    let id = 0;
    const run = async (name: string, args: unknown) => (await tools.executeBatch([{ callId: String(++id), name, arguments: args, sessionId: "s", agentRunId: "r", turnId: "t", stepId: "step" }], env))[0];
    try {
      expect((await run("write_file", { path: "a", content: "a" }))?.status).toBe("completed");
      expect((await run("edit_file", { path: "a", old_string: "a", new_string: "b" }))?.status).toBe("completed");
      expect((await run("delete_file", { path: "a" }))?.status).toBe("completed");
      expect(approvals).toEqual(["delete_file"]);
      expect((await run("bash", { command: "pwd", intent: "Inspect directory" }))?.status).toBe("completed");
      expect(approvals).toEqual(["delete_file", "bash"]);
      expect((await run("write_file", { path: "../outside", content: "a" }))?.status).toBe("completed");
      expect((await run("write_file", { path: "a" }))?.status).toBe("failed");
      expect(approvals).toEqual(["delete_file", "bash", "write_file"]);
      expect(called).toEqual(["write_file", "edit_file", "delete_file", "bash", "write_file"]);
    } finally { for (const item of registrations) await item.handle.dispose(); }
  });
});
