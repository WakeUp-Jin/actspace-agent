import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { ToolRuntime } from "@actspace/tools-runtime";
import { inspectCordisAdmission } from "@actspace/cordis-adapter";
import { createProfileComposition, RUNTIME_PROFILE_IDS, TOOL_PLUGIN_TRANSPORT } from "../profiles/composition.js";
import { runtimeCordisConfigPath } from "../config-path.js";
import { bootProfileRuntime } from "./profile-runtime.js";
import { createRuntimeHostServices } from "./host-services.js";

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
    profile = await bootProfileRuntime({ host, dataRoot: root, toolEnvironment: env, composition,
      hostServices: createRuntimeHostServices({ descriptor: host, dataRoot: root, workspaceRoot: root, toolEnvironment: env, services: {
        ...ports, "actspace.host.llm": { credentials: { resolve: async () => ({}) }, routes: [{ routeId: "test", providerId: "test", modelPattern: "*", credentialRef: "test", defaults: {}, adapter: { adapterVersion: "test", dispatch: async () => { throw new Error("No model calls in this test."); } } }] },
      } }),
      cordis: { configPath: runtimeCordisConfigPath(), admission: await inspectCordisAdmission() },
    });
    const tools = profile.context.get!("tools.runtime") as ToolRuntime;
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
    await profile.shutdown();
    profile = undefined;
    expect(() => tools.registry.capture("read_file")).toThrow(/not active/);
  } finally {
    await profile?.shutdown();
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);
