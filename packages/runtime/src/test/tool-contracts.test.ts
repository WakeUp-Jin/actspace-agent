import { expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ToolRuntime, type ToolPreparedEnvironment, type ToolBodyResult, type ToolExecutionContext, type ToolDefinition } from "@actspace/tools-runtime";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";

const args: Readonly<Record<string, Record<string, RuntimeV2JsonValue>>> = {
  read_file: { path: "file.txt" }, list_directory: { path: "." }, grep: { pattern: "x" }, glob: { pattern: "*" },
  edit_file: { path: "file.txt", old_string: "x", new_string: "y" }, write_file: { path: "file.txt", content: "x" }, delete_file: { path: "file.txt" },
  bash: { command: "printf x", intent: "test" }, bash_output: { taskId: "task" }, bash_kill: { taskId: "task" },
  web: { action: "search", query: "test" }, web_search: { query: "test" }, web_fetch: { url: "https://example.com" },
  generate_image: { prompt: "test" }, inspect_image: { artifact_id: "image", question: "test" },
};

it.each(["filesystem-read", "filesystem-search", "filesystem-write", "shell-tools", "web-tools", "image-generation", "image-inspection"])(
  "%s enforces schema, capability and scope before Host invocation and contains executor failure", async slug => {
    const plugin = await import(`@actspace/tools-${slug}`) as {
      TOOL_DEFINITIONS: readonly { localName: string; definition: ToolDefinition }[];
      registerTools(runtime: ToolRuntime, ports: Record<string, (args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>>): readonly { handle: { dispose(): Promise<void> } }[];
    };
    const root = await mkdtemp(join(tmpdir(), "tool-contract-"));
    await writeFile(join(root, "file.txt"), "x");
    const runtime = new ToolRuntime();
    let invoked = 0;
    const registrations = plugin.registerTools(runtime, Object.fromEntries(plugin.TOOL_DEFINITIONS.map(item => [item.localName, async () => { invoked++; throw new Error("Host execution failed"); }])));
    const env: ToolPreparedEnvironment = {
      workspaceRoot: root, permissionMode: "full-access", hostCapabilities: new Set(["filesystem.read", "filesystem.write", "network", "process"]),
      capabilitySet: { ids: [], has: () => true, get: <T>() => ({}) as T },
      journal: { recordDispatch: async () => {}, checkpointBeforeBody: async () => {}, commitResult: async () => {} }, createArtifact: async () => { throw new Error("unused"); },
      approvalBroker: { requestApproval: async request => ({ requestId: request.requestId, kind: "once", decidedAt: new Date().toISOString() }) },
    };
    try {
      for (const item of plugin.TOOL_DEFINITIONS) {
        const run = (arguments_: unknown, environment = env) => runtime.executeBatch([{ name: item.localName, callId: item.localName, arguments: arguments_, sessionId: "s", agentRunId: "r", turnId: "t", stepId: "step" }], environment);
        const before = invoked;
        expect((await run({}))[0]).toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS" } });
        expect((await run(args[item.localName], { ...env, hostCapabilities: new Set() }))[0]?.status).toBe("denied");
        expect((await run(args[item.localName], { ...env, allowedToolNames: new Set() }))[0]).toMatchObject({ status: "denied", failure: { code: "TOOL_SCOPE_DENIED" } });
        expect(invoked).toBe(before);
        const result = (await run(args[item.localName]))[0];
        if (item.localName === "bash" && result?.status === "denied") {
          expect(result.failure?.code).toBe("APPROVAL_REQUIRED");
          expect(invoked).toBe(before);
        } else {
          expect(result).toMatchObject({ status: "failed", failure: { code: "TOOL_EXECUTION_FAILED" } });
          expect(invoked).toBe(before + 1);
        }
      }
    } finally {
      await Promise.all(registrations.map(item => item.handle.dispose()));
      await rm(root, { recursive: true, force: true });
    }
  },
);
