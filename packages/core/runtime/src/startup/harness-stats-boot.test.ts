import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { inspectCordisAdmission } from "@actspace/cordis-adapter";
import { createProfileComposition, RUNTIME_PROFILE_IDS } from "../profiles/composition.js";
import { runtimeCordisConfigPath } from "../config-path.js";
import { bootProfileRuntime, resetRuntimeProcessGuardForTest } from "./boot.js";
import { createRuntimeHostServices } from "./host-services.js";

const previous = process.env.ACTSPACE_HARNESS_STATS;
afterEach(() => { if (previous === undefined) delete process.env.ACTSPACE_HARNESS_STATS; else process.env.ACTSPACE_HARNESS_STATS = previous; resetRuntimeProcessGuardForTest(); });

async function bootAndStop(options: { readonly harnessStats?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-stats-boot-"));
  const host = { hostKind: "cli-run" as const, capabilityCeiling: ["filesystem.read", "filesystem.write", "network", "approval", "credential", "process"] as const, runtimeContract: "actspace.runtime.v2" as const, invocationId: "test" };
  const composition = createProfileComposition(RUNTIME_PROFILE_IDS.headless, host);
  const env = { workspaceRoot: root, hostCapabilities: new Set<string>(host.capabilityCeiling), capabilitySet: { ids: host.capabilityCeiling, has: () => true, get: <T>() => ({}) as T }, createArtifact: async () => { throw new Error("unused"); } };
  const ports = Object.fromEntries(["filesystem-read", "filesystem-search", "filesystem-write", "shell-tools", "web-tools", "image-generation", "image-inspection"].map(id => [`actspace.host.tools.${id}`, { createPorts: () => ({}) }]));
  const profile = await bootProfileRuntime({ host, dataRoot: root, toolEnvironment: env, composition,
    hostServices: createRuntimeHostServices({ descriptor: host, dataRoot: root, workspaceRoot: root, toolEnvironment: env, services: {
      ...ports, "actspace.host.llm": { credentials: { resolve: async () => ({}) }, routes: [{ routeId: "test", providerId: "test", modelPattern: "*", credentialRef: "test", defaults: {}, adapter: { adapterVersion: "test", dispatch: async () => { throw new Error("No model calls in this test."); } } }] },
    } }),
    cordis: { configPath: runtimeCordisConfigPath(), admission: await inspectCordisAdmission() },
    ...options,
  });
  await profile.shutdown();
  return root;
}

it("writes the Harness inventory and tool owners to <dataRoot>/harness-stats when the Host stops", async () => {
  delete process.env.ACTSPACE_HARNESS_STATS;
  const root = await bootAndStop();
  try {
    const files = await readdir(join(root, "harness-stats"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}\.jsonl$/);
    const lines = (await readFile(join(root, "harness-stats", files[0]!), "utf8")).trimEnd().split("\n").map(line => JSON.parse(line) as { t: string; plugin?: string; tool?: string; revision?: string; source?: string; ok?: boolean });
    const inventory = lines.filter(line => line.t === "inventory");
    expect(inventory.length).toBeGreaterThan(5);
    expect(inventory.every(line => line.revision === "main@1" && line.ok === true)).toBe(true);
    expect(inventory.every(line => line.source === "builtin")).toBe(true);
    expect(lines.filter(line => line.t === "tool-owner").map(line => line.tool)).toContain("read_file");
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("creates no statistics at all when ACTSPACE_HARNESS_STATS=0", async () => {
  process.env.ACTSPACE_HARNESS_STATS = "0";
  const root = await bootAndStop();
  try {
    await expect(readdir(join(root, "harness-stats"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("creates no statistics for an ephemeral boot (harnessStats: false)", async () => {
  delete process.env.ACTSPACE_HARNESS_STATS;
  const root = await bootAndStop({ harnessStats: false });
  try {
    await expect(readdir(join(root, "harness-stats"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
