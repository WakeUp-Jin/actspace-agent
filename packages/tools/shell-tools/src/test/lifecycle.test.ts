import { mkdtemp, mkdir, realpath, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { describe, expect, it } from "vitest";
import { ToolRuntime } from "@actspace/tools-runtime";
import type { SandboxService } from "@actspace/sandbox/types";
import { apply, registerTools, TOOL_DEFINITIONS } from "../plugin.js";
import { manifest } from "../manifest.js";

/** Only `status` matters for permissions; running is covered in node-ports.test.ts. */
function sandboxWithStatus(available: boolean): SandboxService {
  return { register: () => () => undefined, status: async () => ({ available, isolation: "sandboxed", reasons: available ? [] : ["no backend"] }), run: () => { throw new Error("unused"); } };
}

describe("shell-tools lifecycle", () => {
  it("allows full-access Bash after hard guards while default mode still asks", async () => {
    const runtime = new ToolRuntime(); const registrations = registerTools(runtime, {});
    const policy = runtime.registry.capture("bash").permission;
    const context = { workspaceRoot: "/workspace", hostCapabilities: ["process"] };
    for (const args of [{ command: "ls -la pi/.pi" }, { command: "git status --short", requiredPermissions: ["no_sandbox"] }]) {
      expect(await policy.evaluate(args, [], { ...context, mode: "full-access" })).toMatchObject({ kind: "allow" });
      expect(await policy.evaluate(args, [], { ...context, mode: "default" })).toMatchObject({ kind: "ask" });
    }
    for (const mode of ["default", "full-access"] as const) {
      expect(await policy.evaluate({ command: "rm -rf /" }, [], { ...context, mode })).toMatchObject({ kind: "deny" });
    }
    for (const item of registrations) await item.handle.dispose();
  });
  it.each([["no sandbox service", undefined], ["an unavailable sandbox", sandboxWithStatus(false)]] as const)("asks to run outside the sandbox with %s", async (_label, sandbox) => {
    const dir = await mkdtemp(join(tmpdir(), "bash-nosandbox-"));
    try {
      const root = await realpath(dir);
      const runtime = new ToolRuntime(); registerTools(runtime, {}, sandbox);
      const policy = runtime.registry.capture("bash").permission;
      const args = { command: "pnpm test" };
      const resources = await policy.extractResources(args, { mode: "default", workspaceRoot: root, canonicalizeFile: async () => { throw new Error("unused"); } });
      expect(resources).toMatchObject([{ kind: "process", noSandbox: true }]);
      expect(resources[0]).not.toHaveProperty("grantPrefix");
      const permissionContext = { workspaceRoot: root, hostCapabilities: ["process"] };
      expect(await policy.evaluate(args, resources, { ...permissionContext, mode: "default" })).toMatchObject({ kind: "ask", reusable: false });
      expect(await policy.evaluate(args, resources, { ...permissionContext, mode: "full-access" })).toMatchObject({ kind: "allow" });
      expect(await policy.suggestGrants!(args, resources, { ...permissionContext, mode: "default" })).toEqual([]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
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
    const runtime = new ToolRuntime(); registerTools(runtime, {}, sandboxWithStatus(true));
    const policy = runtime.registry.capture("bash").permission;
    const context = { mode: "default" as const, workspaceRoot: root, canonicalizeFile: async () => { throw new Error("unused"); } };
    const permissionContext = { workspaceRoot: root, mode: "default" as const, hostCapabilities: ["process"] };
    for (const args of [{ command: "pnpm test" }, { command: "pnpm test", cwd: "escape" }, { command: "pnpm test", requiredPermissions: ["no_sandbox"] }, { command: "pnpm test && pnpm build" }, { command: "pnpm dlx x" }]) {
      const resources = await policy.extractResources(args, context);
      expect(resources).toMatchObject([{ noSandbox: "requiredPermissions" in args }]);
      const suggestions = await policy.suggestGrants!(args, resources, permissionContext);
      expect(suggestions.length).toBe(Object.keys(args).length === 1 && args.command === "pnpm test" ? 1 : 0);
      if (suggestions.length) expect(suggestions[0]?.selector).toMatchObject({ cwdRoot: await realpath(root) });
    }
    for (const [command, count] of [["ls -la .", 1], ["ls escape", 0], ["git -C . status", 1], ["git -C escape status", 0], ["node --version", 1], ["node -e code", 0], ["rg --pre script needle", 0]] as const) {
      const args = { command };
      const resources = await policy.extractResources(args, context);
      expect((await policy.suggestGrants!(args, resources, permissionContext)).length, command).toBe(count);
    }
    const args = { command: "pnpm test | cat" };
    expect(await policy.evaluate(args, await policy.extractResources(args, context), permissionContext)).toMatchObject({ kind: "deny" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
