import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CordisContextClass } from "@actspace/cordis-adapter";
import {
  FILESYSTEM_HOST_PORT_ID,
  ToolRuntime,
  type FilesystemHostGrant,
  type ToolExecutionContext,
} from "@actspace/tool-runtime";
import { apply, registerTools, TOOL_DEFINITIONS } from "../plugin.js";
import { manifest } from "../manifest.js";

describe("filesystem-search lifecycle", () => {
  it("owns its manifest, registers exactly its tools, rejects duplicates and disposes", async () => {
    const runtime = new ToolRuntime();
    const registrations = registerTools(runtime, {});
    expect(runtime.registry.listDefinitions().map((item) => item.pluginId)).toEqual(
      TOOL_DEFINITIONS.map(() => manifest.pluginId),
    );
    expect(() => registerTools(runtime, {})).toThrow();
    for (const item of registrations) await item.handle.dispose();
    for (const item of TOOL_DEFINITIONS) expect(() => runtime.registry.capture(item.localName)).toThrow(/not active/);
  });
  it("rejects a tree without tools.runtime before registering", async () => {
    const ctx = new CordisContextClass();
    await expect(ctx.plugin({ apply: (inner) => apply(inner as never) })).rejects.toThrow(/requires tools.runtime/);
  });
  it("registers unavailable handlers without the filesystem grant and real ones with it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "filesystem-search-grant-"));
    try {
      const root = await realpath(dir);
      await writeFile(join(root, "hello.txt"), "hello\n");
      for (const grant of [undefined, { workspaceRoot: root } satisfies FilesystemHostGrant | undefined]) {
        const ctx = new CordisContextClass();
        const runtime = new ToolRuntime();
        ctx.provide("tools.runtime", runtime);
        if (grant) ctx.provide(FILESYSTEM_HOST_PORT_ID, grant);
        await ctx.plugin({ apply: (inner) => apply(inner as never) });
        expect(
          runtime.registry
            .listDefinitions()
            .map((item) => item.name)
            .sort(),
        ).toEqual(TOOL_DEFINITIONS.map((item) => item.definition.name).sort());
        const result = await runtime.registry.capture("glob").executor.execute({ pattern: "*.txt" }, context(root));
        if (grant) expect(result).toMatchObject({ status: "completed" });
        else expect(result).toMatchObject({ status: "failed", failure: { code: "CAPABILITY_UNAVAILABLE" } });
        await ctx.fiber.dispose();
        expect(runtime.registry.listDefinitions()).toEqual([]);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function context(workspaceRoot: string): ToolExecutionContext {
  return {
    pluginId: manifest.pluginId,
    name: "t",
    callId: "c",
    sessionId: "s",
    workspaceRoot,
    agentRunId: "r",
    turnId: "t",
    stepId: "s",
    signal: new AbortController().signal,
    capabilities: { ids: [], has: () => true, get: () => undefined as never },
    reportProgress: () => undefined,
    createArtifact: async () => {
      throw new Error("unused");
    },
    defer: () => undefined,
  };
}
