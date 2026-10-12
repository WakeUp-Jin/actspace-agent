import { mkdtemp, mkdir, realpath, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { describe, expect, it } from "vitest";
import { ToolRuntime } from "@actspace/tools-runtime";
import { apply, registerTools, TOOL_DEFINITIONS } from "../plugin.js";
import { manifest } from "../manifest.js";

describe("shell-tools lifecycle", () => {
  it("owns its manifest, registers exactly its tools, rejects duplicates and disposes", async () => {
    const runtime = new ToolRuntime();
    const registrations = registerTools(runtime, {});
    expect(runtime.registry.listDefinitions().map(item => item.pluginId)).toEqual(TOOL_DEFINITIONS.map(() => manifest.pluginId));
    expect(() => registerTools(runtime, {})).toThrow();
    for (const item of registrations) await item.handle.dispose();
    for (const item of TOOL_DEFINITIONS) expect(() => runtime.registry.capture(item.localName)).toThrow(/not active/);
  });
  it("rejects a missing Host port before registering", async () => {
    const runtime = new ToolRuntime();
    await expect(apply({ get: (id: string) => id === "tools.runtime" ? runtime : undefined } as never)).rejects.toThrow(/requires/);
    expect(runtime.registry.listDefinitions()).toEqual([]);
  });
});

it("offers grants only for canonical in-workspace literal commands and retains hard denial", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bash-prefix-"));
  try {
    const root = join(dir, "workspace");
    const outside = join(dir, "outside");
    await mkdir(root); await mkdir(outside); await symlink(outside, join(root, "escape"));
    const runtime = new ToolRuntime(); registerTools(runtime, {});
    const policy = runtime.registry.capture("bash").permission;
    const context = { workspaceRoot: root, canonicalizeFile: async () => { throw new Error("unused"); } };
    const permissionContext = { workspaceRoot: root, mode: "default" as const, hostCapabilities: ["process"] };
    for (const args of [{ command: "pnpm test" }, { command: "pnpm test", cwd: "escape" }, { command: "pnpm test", requiredPermissions: ["no_sandbox"] }, { command: "pnpm test && pnpm build" }, { command: "pnpm dlx x" }]) {
      const resources = await policy.extractResources(args, context);
      const suggestions = await policy.suggestGrants!(args, resources, permissionContext);
      expect(suggestions.length).toBe(Object.keys(args).length === 1 && args.command === "pnpm test" ? 1 : 0);
      if (suggestions.length) expect(suggestions[0]?.selector).toMatchObject({ cwdRoot: await realpath(root) });
    }
    const args = { command: "pnpm test | cat" };
    expect(await policy.evaluate(args, await policy.extractResources(args, context), permissionContext)).toMatchObject({ kind: "deny" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
