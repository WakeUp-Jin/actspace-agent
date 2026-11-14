import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CordisContextClass } from "@actspace/cordis-adapter";
import type { SandboxService } from "@actspace/sandbox/types";
import {
  materializeToolArguments,
  PROCESS_HOST_PORT_ID,
  ToolRuntime,
  type ProcessHostGrant,
} from "@actspace/tool-runtime";
import { describe, expect, it, vi } from "vitest";
import { manifest } from "../manifest.js";
import { apply, registerTools, TOOL_DEFINITIONS, type ShellToolsService } from "../plugin.js";

/** Only `status` matters for permissions; running is covered in node-ports.test.ts. */
function sandboxWithStatus(available: boolean): SandboxService {
  return {
    register: () => () => undefined,
    status: async () => ({ available, isolation: "sandboxed", reasons: available ? [] : ["no backend"] }),
    run: () => {
      throw new Error("unused");
    },
  };
}

describe("shell-tools lifecycle", () => {
  it("allows full-access Bash after hard guards while default mode still asks", async () => {
    const runtime = new ToolRuntime();
    const registrations = registerTools(runtime, {});
    const policy = runtime.registry.capture("bash").permission;
    const context = { workspaceRoot: "/workspace", hostCapabilities: ["process"] };
    for (const args of [
      { command: "ls -la pi/.pi" },
      { command: "git status --short", sandbox_permissions: "require_escalated", justification: "Needs the keychain." },
    ]) {
      expect(await policy.evaluate(args, [], { ...context, mode: "full-access" })).toMatchObject({ kind: "allow" });
      expect(await policy.evaluate(args, [], { ...context, mode: "default" })).toMatchObject({ kind: "ask" });
    }
    for (const mode of ["default", "full-access"] as const) {
      expect(await policy.evaluate({ command: "rm -rf /" }, [], { ...context, mode })).toMatchObject({ kind: "deny" });
    }
    for (const item of registrations) await item.handle.dispose();
  });
  it.each([
    ["no sandbox service", undefined],
    ["an unavailable sandbox", sandboxWithStatus(false)],
  ] as const)("asks to run outside the sandbox with %s", async (_label, sandbox) => {
    const dir = await mkdtemp(join(tmpdir(), "bash-nosandbox-"));
    try {
      const root = await realpath(dir);
      const runtime = new ToolRuntime();
      registerTools(runtime, {}, sandbox);
      const policy = runtime.registry.capture("bash").permission;
      const args = { command: "pnpm test" };
      const resources = await policy.extractResources(args, {
        mode: "default",
        workspaceRoot: root,
        canonicalizeFile: async () => {
          throw new Error("unused");
        },
      });
      expect(resources).toMatchObject([{ kind: "process", noSandbox: true }]);
      expect(resources[0]).not.toHaveProperty("grantPrefix");
      const permissionContext = { workspaceRoot: root, hostCapabilities: ["process"] };
      expect(await policy.evaluate(args, resources, { ...permissionContext, mode: "default" })).toMatchObject({
        kind: "ask",
        reusable: false,
      });
      expect(await policy.evaluate(args, resources, { ...permissionContext, mode: "full-access" })).toMatchObject({
        kind: "allow",
      });
      expect(await policy.suggestGrants!(args, resources, { ...permissionContext, mode: "default" })).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("attaches script metadata to the process resource for inline bodies and script files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bash-script-"));
    try {
      const root = await realpath(dir);
      const runtime = new ToolRuntime();
      registerTools(runtime, {}, undefined);
      const policy = runtime.registry.capture("bash").permission;
      const context = {
        mode: "default" as const,
        workspaceRoot: root,
        canonicalizeFile: async () => {
          throw new Error("unused");
        },
      };
      expect(await policy.extractResources({ command: "actspace-python -c 'print(1)'" }, context)).toMatchObject([
        { kind: "process", script: { language: "python", source: "print(1)" } },
      ]);
      expect(
        await policy.extractResources({ command: 'actspace-python "$ACTSPACE_SCRATCH/run.py"' }, context),
      ).toMatchObject([{ kind: "process", script: { language: "python", path: "$ACTSPACE_SCRATCH/run.py" } }]);
      expect((await policy.extractResources({ command: "ls -la" }, context))[0]).not.toHaveProperty("script");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("escalates out of the sandbox only with a justification, once, and never in full-access", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bash-escalate-"));
    try {
      const root = await realpath(dir);
      const runtime = new ToolRuntime();
      registerTools(runtime, {}, sandboxWithStatus(true));
      const policy = runtime.registry.capture("bash").permission;
      const extract = (args: Record<string, string>, mode: "default" | "full-access") =>
        policy.extractResources(args, {
          mode,
          workspaceRoot: root,
          canonicalizeFile: async () => {
            throw new Error("unused");
          },
        });
      const permissionContext = { workspaceRoot: root, hostCapabilities: ["process"] };
      const escalated = {
        command: "pnpm test",
        sandbox_permissions: "require_escalated",
        justification: "Writes the global pnpm store.",
      };
      const resources = await extract(escalated, "default");
      expect(resources).toMatchObject([{ kind: "process", noSandbox: true }]);
      expect(resources[0]).not.toHaveProperty("grantPrefix");
      expect(await policy.evaluate(escalated, resources, { ...permissionContext, mode: "default" })).toEqual({
        kind: "ask",
        reason: "Writes the global pnpm store.",
        risk: "high",
        reusable: false,
      });
      expect(await policy.suggestGrants!(escalated, resources, { ...permissionContext, mode: "default" })).toEqual([]);
      // full-access runs every command outside the sandbox, so the parameters change nothing.
      for (const args of [{ command: "pnpm test" }, escalated]) {
        const unsandboxed = await extract(args, "full-access");
        expect(unsandboxed).toMatchObject([{ noSandbox: true }]);
        expect(await policy.evaluate(args, unsandboxed, { ...permissionContext, mode: "full-access" })).toEqual({
          kind: "allow",
        });
      }
      expect(await extract({ command: "pnpm test" }, "default")).toMatchObject([{ noSandbox: false }]);
      for (const args of [
        { command: "pnpm test", sandbox_permissions: "require_escalated" },
        { command: "pnpm test", justification: "Why." },
        { command: "pnpm test", sandbox_permissions: "require_escalated", justification: "  " },
      ]) {
        for (const mode of ["default", "full-access"] as const) {
          expect(await policy.evaluate(args, await extract(args, mode), { ...permissionContext, mode })).toMatchObject({
            kind: "deny",
            code: "BASH_ESCALATION_INVALID",
          });
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("rejects the removed no_sandbox parameter and an overlong justification in the schema", () => {
    const schema = TOOL_DEFINITIONS.find((item) => item.localName === "bash")!.definition.inputSchema;
    expect(() =>
      materializeToolArguments(schema, { command: "ls", intent: "list", requiredPermissions: ["no_sandbox"] }),
    ).toThrow(/Unknown property/);
    expect(() =>
      materializeToolArguments(schema, {
        command: "ls",
        intent: "list",
        sandbox_permissions: "no_sandbox",
        justification: "x",
      }),
    ).toThrow();
    expect(() =>
      materializeToolArguments(schema, {
        command: "ls",
        intent: "list",
        sandbox_permissions: "require_escalated",
        justification: "x".repeat(201),
      }),
    ).toThrow(/too long/);
    expect(
      materializeToolArguments(schema, {
        command: "ls",
        intent: "list",
        sandbox_permissions: "require_escalated",
        justification: "Reads the keychain.",
      }),
    ).toMatchObject({ sandbox_permissions: "require_escalated" });
  });
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
  it("rejects a tree without tools.runtime or actspace.host.session before registering", async () => {
    const runtime = new ToolRuntime();
    await expect(
      apply({ get: (id: string) => (id === "tools.runtime" ? runtime : undefined) } as never),
    ).rejects.toThrow(/requires tools.runtime and actspace.host.session/);
    expect(runtime.registry.listDefinitions()).toEqual([]);
  });
  it("registers an unavailable bash without the process grant and hands the Host process control with it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bash-grant-"));
    try {
      const root = await realpath(dir);
      const onProcesses = vi.fn();
      for (const grant of [
        undefined,
        { workspaceRoot: root, tmpRoot: join(root, "tmp"), onProcesses } satisfies ProcessHostGrant | undefined,
      ]) {
        const ctx = new CordisContextClass();
        const runtime = new ToolRuntime();
        ctx.provide("tools.runtime", runtime);
        ctx.provide("actspace.host.session", { dataRoot: join(root, "data") });
        if (grant) ctx.provide(PROCESS_HOST_PORT_ID, grant);
        await ctx.plugin({ apply: (inner) => apply(inner as never) });
        expect(runtime.registry.listDefinitions().map((item) => item.name)).toEqual(["bash"]);
        const service = ctx.get("tools.shell-tools") as ShellToolsService;
        expect(service.hasRunningBackgroundTask("s")).toBe(false);
        if (grant) {
          // A forked subagent keeps its parent's system prompt, so its scratch directory has to be the parent's.
          const own = service.scratchDirectory?.("fork");
          const stop = service.shareScratchDirectory?.("fork", "parent");
          expect(service.scratchDirectory?.("fork")).toBe(service.scratchDirectory?.("parent"));
          stop?.();
          expect(service.scratchDirectory?.("fork")).toBe(own);
          expect(own).not.toBe(service.scratchDirectory?.("parent"));
        } else expect(service.scratchDirectory).toBeUndefined();
        if (grant)
          expect(onProcesses).toHaveBeenCalledWith(expect.objectContaining({ forceTerminate: expect.any(Function) }));
        else {
          expect(onProcesses).not.toHaveBeenCalled();
          const context = {
            pluginId: manifest.pluginId,
            name: "bash",
            callId: "c",
            sessionId: "s",
            workspaceRoot: root,
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
          expect(await runtime.registry.capture("bash").executor.execute({ command: "true" }, context)).toMatchObject({
            status: "failed",
            failure: { code: "CAPABILITY_UNAVAILABLE" },
          });
        }
        await ctx.fiber.dispose();
        expect(runtime.registry.listDefinitions()).toEqual([]);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

it("offers grants only for canonical in-workspace literal commands and retains hard denial", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bash-prefix-"));
  try {
    const root = join(dir, "workspace");
    const outside = join(dir, "outside");
    await mkdir(root);
    await mkdir(outside);
    await symlink(outside, join(root, "escape"));
    const runtime = new ToolRuntime();
    registerTools(runtime, {}, sandboxWithStatus(true));
    const policy = runtime.registry.capture("bash").permission;
    const context = {
      mode: "default" as const,
      workspaceRoot: root,
      canonicalizeFile: async () => {
        throw new Error("unused");
      },
    };
    const permissionContext = { workspaceRoot: root, mode: "default" as const, hostCapabilities: ["process"] };
    for (const args of [
      { command: "pnpm test" },
      { command: "pnpm test", cwd: "escape" },
      { command: "pnpm test", sandbox_permissions: "require_escalated", justification: "Writes the global store." },
      { command: "pnpm test && pnpm build" },
      { command: "pnpm dlx x" },
    ]) {
      const resources = await policy.extractResources(args, context);
      expect(resources).toMatchObject([{ noSandbox: "sandbox_permissions" in args }]);
      const suggestions = await policy.suggestGrants!(args, resources, permissionContext);
      expect(suggestions.length).toBe(Object.keys(args).length === 1 && args.command === "pnpm test" ? 1 : 0);
      if (suggestions.length) expect(suggestions[0]?.selector).toMatchObject({ cwdRoot: await realpath(root) });
    }
    for (const [command, count] of [
      ["ls -la .", 1],
      ["ls escape", 0],
      ["git -C . status", 1],
      ["git -C escape status", 0],
      ["node --version", 1],
      ["node -e code", 0],
      ["rg --pre script needle", 0],
    ] as const) {
      const args = { command };
      const resources = await policy.extractResources(args, context);
      expect((await policy.suggestGrants!(args, resources, permissionContext)).length, command).toBe(count);
    }
    for (const [command, kind] of [
      ["pnpm test | cat", "ask"],
      ["python3 run.py", "ask"],
      ["pnpm test $(id)", "deny"],
    ] as const) {
      const args = { command };
      expect(
        await policy.evaluate(args, await policy.extractResources(args, context), permissionContext),
        command,
      ).toMatchObject({ kind });
    }
    expect(
      (
        await policy.suggestGrants!(
          { command: "pnpm test | cat" },
          await policy.extractResources({ command: "pnpm test | cat" }, context),
          permissionContext,
        )
      ).length,
    ).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
