import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ToolRuntime } from "@actspace/tool-runtime";
import { inspectCordisAdmission } from "@actspace/cordis-adapter";
import { createProfileComposition, RUNTIME_PROFILE_IDS } from "../profiles/composition.js";
import { harnessEntriesMissingHostCapabilities, PLUGIN_CATALOG } from "../plugin-catalog.js";
import { runtimeCordisConfigPath } from "../config-path.js";
import { bootProfileRuntime } from "../startup/boot.js";
import { createRuntimeHostServices } from "../startup/host-services.js";

const BASE_CAPABILITIES = ["filesystem.read", "filesystem.write", "network", "approval", "credential", "process"] as const;

/**
 * Boot the checked-in tree and report the Harness's tool names. `browser-tools` needs the Host capability and an
 * enabled switch; a Host that passes no switches keeps every default-off plugin off.
 */
async function bootToolNames(capabilities: readonly string[], disabledPlugins?: readonly string[]): Promise<readonly string[]> {
  const root = await mkdtemp(join(tmpdir(), "browser-capability-"));
  const host = { hostKind: "cli-run" as const, capabilityCeiling: capabilities as typeof BASE_CAPABILITIES, runtimeContract: "actspace.runtime.v2" as const, invocationId: "test" };
  const composition = createProfileComposition(RUNTIME_PROFILE_IDS.headless, host);
  const env = { workspaceRoot: root, hostCapabilities: new Set<string>(capabilities), capabilitySet: { ids: capabilities, has: () => true, get: <T>() => ({}) as T }, createArtifact: async () => { throw new Error("unused"); } };
  const ports = Object.fromEntries(PLUGIN_CATALOG.filter(item => item.manifest.behaviors[0].injects?.some(id => String(id) === `actspace.host.tools.${item.id}`)).map(item => [`actspace.host.tools.${item.id}`, { createPorts: () => ({}) }]));
  let profile: Awaited<ReturnType<typeof bootProfileRuntime>> | undefined;
  try {
    profile = await bootProfileRuntime({
      host, dataRoot: root, toolEnvironment: env, composition, ...(disabledPlugins ? { disabledPlugins } : {}),
      hostServices: createRuntimeHostServices({ descriptor: host, dataRoot: root, workspaceRoot: root, toolEnvironment: env, services: {
        ...ports,
        "actspace.host.tools.browser": { ready: true, command: async () => { throw new Error("unused"); } },
        "actspace.host.llm": { credentials: { resolve: async () => ({}) }, routes: [{ routeId: "test", providerId: "test", modelPattern: "*", credentialRef: "test", defaults: {}, adapter: { adapterVersion: "test", dispatch: async () => { throw new Error("No model calls in this test."); } } }] },
      } }),
      cordis: { configPath: runtimeCordisConfigPath(), admission: await inspectCordisAdmission() },
    });
    const runtime = profile.context.get!("agent.runtime") as import("./agent-runtime-plugin.js").AgentRuntimeService;
    const lease = await runtime.harnesses.acquire("main");
    try {
      return lease.getService<ToolRuntime>("tools.runtime")!.registry.listDefinitions().map(item => item.name);
    } finally { await lease.release(); }
  } finally {
    await profile?.shutdown();
    await rm(root, { recursive: true, force: true });
  }
}

describe("Host capability rule for optional Harness entries", () => {
  it("lists only optional entries whose manifest requires a missing capability", () => {
    // The external subagents need `process`.
    expect(harnessEntriesMissingHostCapabilities(["filesystem.read"])).toEqual(["browser-tools", "subagent-codex", "subagent-claude-code"]);
    expect(harnessEntriesMissingHostCapabilities([...BASE_CAPABILITIES, "browser"])).toEqual([]);
  });

  it("does not load browser-tools when the Host has no browser capability", async () => {
    expect(await bootToolNames(BASE_CAPABILITIES)).not.toContain("browser_help");
  }, 15_000);

  it("loads browser-tools when the Host has the browser capability and the switch is on", async () => {
    expect(await bootToolNames([...BASE_CAPABILITIES, "browser"], [])).toContain("browser_help");
    // No switches at all: default-off plugins stay off.
    expect(await bootToolNames([...BASE_CAPABILITIES, "browser"])).not.toContain("browser_help");
  }, 15_000);

  it("keeps browser-tools out when the plugin switch is off, even with the browser capability", async () => {
    expect(await bootToolNames([...BASE_CAPABILITIES, "browser"], ["browser-tools"])).not.toContain("browser_help");
  }, 15_000);
});
