import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { loadRuntimeV2 } from "./loader";
import type { HostConfig } from "@actspace/agent-host";
import type { AgentApplicationContract, AgentService } from "@actspace/agent-service";
import { HostModelRouter, createNodeToolHostServices } from "@actspace/agent-host/node-ports";
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@actspace/agent-host")>;

export async function startRemoteHost(config: HostConfig, options: { mock?: boolean; forceExit?: () => void } = {}) {
  const [runtime, hostModule] = await Promise.all([loadRuntimeV2(), dynamicImport("@actspace/agent-host")]);
  return hostModule.bootstrapHost(config, {
    forceExit: options.forceExit,
    log: message => { process.stderr.write(`${message}\n`); },
    bootRuntime: async ({ artifacts, approvals, readArtifact, resolveArtifact, onLiveEvent }) => {
      const capabilities = ["filesystem.read", "filesystem.write", "network", "approval", "credential", "process"] as const;
      const workspaceRoot = config.workspaces[0]!.path;
      const host = { hostKind: "host" as const, runtimeContract: "actspace.runtime.v2" as const, invocationId: randomUUID(), workspaceRef: workspaceRoot, capabilityCeiling: capabilities };
      const capabilitySet = { ids: capabilities, has: (id: string) => (capabilities as readonly string[]).includes(id), get: <T>(id: string): T => { throw new Error(`Unavailable capability ${id}`); } };
      const router = new HostModelRouter(config, { mock: options.mock, readArtifact });
      const routes = [{ routeId: "default", providerId: "host", modelPattern: "*", credentialRef: "host-router", defaults: {}, adapter: router }];
      const credentials = { resolve: async () => ({}) };
      const hostServices = runtime.createRuntimeHostServices({ descriptor: host, dataRoot: config.dataRoot, workspaceRoot, toolEnvironment: { hostCapabilities: new Set(capabilities), capabilitySet }, services: {
        "actspace.host.remote": {}, "host.approval": approvals, "host.artifacts": artifacts,
        [runtime.LLM_HOST_PORT_ID]: { credentials, routes },
        [runtime.HEADLESS_HOST_PORT_ID]: { enabled: false },
        [runtime.PROMPT_HOST_PORT_ID]: { workspaceRoot, resolveUserSource: () => runtime.prepareUserPromptSource(config.dataRoot), resolveSource: (root: string) => runtime.prepareRuntimePromptSource({ dataRoot: config.dataRoot, workspaceRoot: root }) },
        ...createNodeToolHostServices({ workspaceRoot, tmpRoot: join(config.dataRoot, "runtime/tmp"), model: config.defaultModel, readArtifact, resolveArtifact }),
      } });
      const profile = await runtime.bootProfileRuntime({ host, dataRoot: config.dataRoot, hostServices, gracefulShutdownMs: 10000, finalShutdownMs: 4000,
        composition: runtime.createProfileComposition(runtime.RUNTIME_PROFILE_IDS.host, host),
        toolEnvironment: { workspaceRoot, permissionMode: "default", hostCapabilities: new Set(capabilities), capabilitySet, approvalBroker: approvals, createArtifact: input => artifacts.create(input), resolveArtifact },
        cordis: { configPath: runtime.runtimeCordisConfigPath(), admission: await runtime.inspectCordisAdmission() },
        onLiveEvent,
      });
      try {
        const application = profile.context.get?.("host.application") as AgentApplicationContract | undefined;
        if (!application) throw new Error("Host application plugin unavailable");
        const agentRuntime = profile.context.get?.("agent.runtime") as { runs: { service: AgentService; inspectCapability<T, R>(name: string, read: (service: T | undefined) => R): R | Promise<R> }; subagents: { activeCount: number }; backgroundTasks: { hasRunning(sessionId?: string): boolean }; harnesses: { inspect(): { blocked: string; instances: readonly { state: string }[] } } };
        return {
          application,
          beginDrain: () => agentRuntime.runs.service.beginDrain(),
          waitForOwnedRuns: () => agentRuntime.runs.service.waitForOwnedRuns(),
          backgroundTask: async sessionId => agentRuntime.backgroundTasks.hasRunning(sessionId),
          activeSubagents: () => agentRuntime.subagents.activeCount,
          recovery: () => agentRuntime.harnesses.inspect(),
          subscribeTasks: listener => {
            const remove = profile.context.on?.("agent/tasks-updated", listener);
            return typeof remove === "function" ? remove as () => void : () => {};
          },
          shutdown: () => profile.shutdown(),
        };
      } catch (error) {
        try { await profile.shutdown(); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], "Host Runtime assembly failed"); }
        throw error;
      }
    },
  });
}
