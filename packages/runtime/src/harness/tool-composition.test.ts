import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { ToolRuntime } from "@actspace/tools-runtime";
import { inspectCordisAdmission } from "@actspace/cordis-adapter";
import { createProfileComposition, RUNTIME_PROFILE_IDS, TOOL_PLUGIN_TRANSPORT } from "../profiles/composition.js";
import { runtimeCordisConfigPath } from "../config-path.js";
import { bootProfileRuntime } from "../startup/boot.js";
import { createRuntimeHostServices } from "../startup/host-services.js";

it("boots the checked-in tree with shell and Todo disabled, leaves file tools available, and requires restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "tool-composition-"));
  const host = { hostKind: "cli-run" as const, capabilityCeiling: ["filesystem.read", "filesystem.write", "network", "approval", "credential", "process"] as const, runtimeContract: "actspace.runtime.v2" as const, invocationId: "test" };
  const composition = createProfileComposition(RUNTIME_PROFILE_IDS.headless, host, { invocationPatch: {
    id: "tools-disabled", provenance: "test", operations: [
      { id: "shell", kind: "disable", target: "tools.shell-tools" },
      { id: "todo", kind: "disable", target: "tools.todo" },
    ],
  } });
  const env = { workspaceRoot: root, hostCapabilities: new Set<string>(host.capabilityCeiling), capabilitySet: { ids: host.capabilityCeiling, has: () => true, get: <T>() => ({}) as T }, createArtifact: async () => { throw new Error("unused"); } };
  const mounted: string[] = [];
  const ports = Object.fromEntries(TOOL_PLUGIN_TRANSPORT.filter(item => item.id !== "todo-tools").map(item => [
    `actspace.host.tools.${item.id}`, { createPorts: () => { mounted.push(item.id); return {}; } },
  ]));
  let profile: Awaited<ReturnType<typeof bootProfileRuntime>> | undefined;
  try {
    const cleanup = vi.fn(async () => {});
    const options: Parameters<typeof bootProfileRuntime>[0] = { host, dataRoot: root, toolEnvironment: env, composition, disposePlugins: cleanup,
      hostServices: createRuntimeHostServices({ descriptor: host, dataRoot: root, workspaceRoot: root, toolEnvironment: env, services: {
        ...ports, "actspace.host.llm": { credentials: { resolve: async () => ({}) }, routes: [{ routeId: "test", providerId: "test", modelPattern: "*", credentialRef: "test", defaults: {}, adapter: { adapterVersion: "test", dispatch: async () => { throw new Error("No model calls in this test."); } } }] },
      } }),
      cordis: { configPath: runtimeCordisConfigPath(), admission: await inspectCordisAdmission() },
    };
    profile = await bootProfileRuntime(options);
    expect(profile.context.get!("tools.runtime")).toBeUndefined();
    const runtime = profile.context.get!("agent.runtime") as import("./agent-runtime-plugin.js").AgentRuntimeService;
    const lease = await runtime.harnesses.acquire("main");
    const previousDigest = lease.executionDigest;
    const tools = lease.getService<ToolRuntime>("tools.runtime")!;
    const names = tools.registry.listDefinitions().map(item => item.name);
    expect(names).toContain("read_file");
    expect(names).not.toContain("bash");
    expect(names).not.toContain("todo_read");
    expect(mounted).not.toContain("shell-tools");
    expect(profile.context.get!("session.journal")).toMatchObject({ registry: expect.objectContaining({ digest: expect.any(String) }) });
    const journal = profile.context.get!("session.journal") as { registry: { list(): readonly { type: string }[] } };
    expect(journal.registry.list().some(codec => codec.type === "plugin/actspace.todo/todo-write")).toBe(false);
    profile.requestRestart("Tool composition changed", "profile", "next-digest");
    expect(profile.getState().restart).toMatchObject({ required: true, candidateDigest: "next-digest" });
    expect(tools.registry.listDefinitions().map(item => item.name)).toEqual(names);
    await lease.release();
    cleanup.mockRejectedValueOnce(new Error("cleanup failed once"));
    const first = profile.shutdown();
    expect(profile.shutdown()).toBe(first);
    await expect(first).rejects.toThrow("Runtime resource cleanup failed");
    await expect(profile.shutdown()).resolves.toMatchObject({ disposed: true });
    expect(cleanup).toHaveBeenCalledTimes(2);
    profile = undefined;
    expect(() => tools.registry.capture("read_file")).toThrow(/not active/);
    // A pristine builtin upgrades to the new Host ceiling; it must not reuse the old execution environment.
    profile = await bootProfileRuntime({ ...options, host: { ...host, capabilityCeiling: ["filesystem.read"] },
      authorizeHarness: async request => ({ ...request, actor: "maintenance-test", decisionId: "repair", expiresAt: Date.now() + 10000 }),
    });
    const restored = profile.context.get!("harness.control") as import("@actspace/harness-control").HarnessControl;
    expect(restored).toBeDefined();
    const upgraded = await restored.acquire("main");
    try {
      expect(upgraded.revision).toBe(2);
      expect(upgraded.executionDigest).not.toBe(previousDigest);
      expect(restored.inspect().current).toMatchObject({
        authorization: { actor: "Host", decisionId: "trusted-builtin-upgrade" },
        description: { composition: { hostCapabilities: ["filesystem.read"] } },
      });
      expect(restored.inspect().blocked).toBe("");
    } finally { await upgraded.release(); }

  } finally {
    await profile?.shutdown();
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);
