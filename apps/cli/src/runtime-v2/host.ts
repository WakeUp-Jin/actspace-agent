import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadRuntimeV2 } from "./loader";
import type { HostConfig } from "@actspace/agent-host";
import type { AgentApplicationContract, AgentService } from "@actspace/agent-service";
import { CliV2ArtifactStore } from "./artifact-store";
import { HostModelRouter } from "@actspace/agent-host/node-ports";
import { createCliToolHostServices } from "./tool-host-services";
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@actspace/agent-host")>;

export async function startRemoteHost(config: HostConfig, options: { mock?: boolean; forceExit?: () => void } = {}) {
  const [runtime, hostModule] = await Promise.all([loadRuntimeV2(), dynamicImport("@actspace/agent-host")]);
  let adminDispatch: (request: import("@actspace/agent-host").AdminRequest) => Promise<unknown> = async () => ({ state: "starting" });
  const admin = new hostModule.HostAdmin(config.dataRoot, request => adminDispatch(request));
  await admin.open();
  const cleanup: (() => Promise<unknown>)[] = [];
  try {
  const capabilities = ["filesystem.read", "filesystem.write", "network", "approval", "credential", "process"] as const;
  const host = { hostKind: "host" as const, runtimeContract: "actspace.runtime.v2" as const, invocationId: randomUUID(), workspaceRef: config.workspaces[0]!.path, capabilityCeiling: capabilities };
  const capabilitySet = { ids: capabilities, has: (id: string) => (capabilities as readonly string[]).includes(id), get: <T>(id: string): T => { throw new Error(`Unavailable capability ${id}`); } };
  const artifacts = new CliV2ArtifactStore(config.dataRoot);
  const approvals = new hostModule.HostApprovalBroker();
  const auth = new hostModule.HostAuth(join(config.dataRoot, "host-auth"), Date.now, () => admin.assertOwned()); await auth.open();
  const uploads = new hostModule.HostUploads(join(config.dataRoot, "host-uploads")); await uploads.cleanup();
  const readArtifact = async (sessionId: string, artifactId: string) => {
    try { return await uploads.readForSession(sessionId, artifactId); }
    catch (error) { if (!(error instanceof hostModule.HostError) || error.kind !== "NOT_FOUND") throw error; return artifacts.readForSession(sessionId, artifactId); }
  };
  const resolveArtifact = async (sessionId: string, artifactId: string) => {
    try { return await uploads.resolve(sessionId, artifactId); }
    catch (error) { if (!(error instanceof hostModule.HostError) || error.kind !== "NOT_FOUND") throw error; return artifacts.resolveForSession(sessionId, artifactId); }
  };
  const router = new HostModelRouter(config, { mock: options.mock, readArtifact });
  const routes = [{ routeId: "default", providerId: "host", modelPattern: "*", credentialRef: "host-router", defaults: {}, adapter: router }];
  const credentials = { resolve: async () => ({}) };
  let state: "ready" | "draining" | "blocked" = "ready";
  let rpc: InstanceType<typeof hostModule.HostRpc> | undefined;
  const gateway = new hostModule.HostGateway({ auth, address: config.listen.address, port: config.listen.port,
    ...(config.tls ? { tls: { cert: await readFile(config.tls.cert, "utf8"), key: await readFile(config.tls.key, "utf8") } } : {}), allowedOrigins: config.allowedOrigins, state: () => state,
    dispatch: async (method, params, context) => { await admin.assertOwned(); if (!rpc) throw new Error("Host starting"); return rpc.dispatch(method, params, context); },
  });
  cleanup.push(() => gateway.close());
  const output = new hostModule.HostLiveOutput();
  const observations = new hostModule.HostObservations(gateway.epoch);
  const workspaceRoot = config.workspaces[0]!.path;
  const hostServices = runtime.createRuntimeHostServices({ descriptor: host, dataRoot: config.dataRoot, workspaceRoot, toolEnvironment: { hostCapabilities: new Set(capabilities), capabilitySet }, services: {
    "actspace.host.remote": {}, "host.approval": approvals, "host.artifacts": artifacts,
    [runtime.LLM_HOST_PORT_ID]: { credentials, routes },
    [runtime.HEADLESS_HOST_PORT_ID]: { enabled: false },
    [runtime.PROMPT_HOST_PORT_ID]: { workspaceRoot, resolveUserSource: () => runtime.prepareUserPromptSource(config.dataRoot), resolveSource: (root: string) => runtime.prepareRuntimePromptSource({ dataRoot: config.dataRoot, workspaceRoot: root }) },
    ...createCliToolHostServices({ workspaceRoot, tmpRoot: join(config.dataRoot, "runtime/tmp"), model: config.defaultModel, readArtifact, resolveArtifact }),
  } });
  const profile = await runtime.bootProfileRuntime({ host, dataRoot: config.dataRoot, hostServices, gracefulShutdownMs: 10000, finalShutdownMs: 4000,
    composition: runtime.createProfileComposition(runtime.RUNTIME_PROFILE_IDS.host, host),
    toolEnvironment: { workspaceRoot, permissionMode: "default", hostCapabilities: new Set(capabilities), capabilitySet, approvalBroker: approvals, createArtifact: input => artifacts.create(input), resolveArtifact },
    cordis: { configPath: runtime.runtimeCordisConfigPath(), admission: await runtime.inspectCordisAdmission() },
    onLiveEvent: event => { output.accept(event); observations.publish(event.sessionId, { kind: "live", event }); },
  });
  cleanup.push(() => profile.shutdown());
  const application = profile.context.get?.("host.application") as AgentApplicationContract | undefined;
  if (!application) { await profile.shutdown(); throw new Error("Host application plugin unavailable"); }
  const agentRuntime = profile.context.get?.("agent.runtime") as { runs: { service: AgentService; inspectCapability<T, R>(name: string, read: (service: T | undefined) => R): R | Promise<R> }; subagents: { activeCount: number }; harnesses: { inspect(): { blocked: string; instances: readonly { state: string }[] } } };
  const service = agentRuntime.runs.service;
  if (agentRuntime.harnesses.inspect().blocked) state = "blocked";
  rpc = new hostModule.HostRpc({ application, config, approvals, observations, uploads, output, artifacts: new hostModule.HostArtifacts(uploads, artifacts), state: () => state });
  const stopTasks = profile.context.on?.("agent/tasks-updated", (snapshot: import("@actspace/shared/runtime-v2").TaskSnapshot) => {
    // Completed output is already durable in the Session journal. Only active Runs need replay memory.
    for (const run of snapshot.runs) if (run.state !== "running") output.clear(snapshot.sessionId, run.runId);
    observations.publish(snapshot.sessionId, { kind: "tasks", snapshot }); observations.publish("host", { kind: "sessions-changed" });
  }) as (() => void) | undefined;
  const unsubscribe = application.subscribeSessionProjection(update => { observations.publish(update.sessionId, { kind: "projection", update }); observations.publish("host", { kind: "sessions-changed" }); });
  const unapprove = approvals.subscribe((sessionId, settled) => { const value = { kind: "approvals", sessionId, requests: approvals.list(sessionId), ...(settled ? { settled } : {}) }; observations.publish(sessionId, value); observations.publish("host", value); });
  if (state === "ready") await uploads.reconcilePins(async (sessionId, submissionId) => {
    const snapshot = (await application.taskCommand({ sessionId, op: "snapshot" })).snapshot;
    return snapshot.tasks.some(task => task.submissionId === submissionId);
  });
  const port = await gateway.listen();
  let cleaningUploads = false;
  const uploadCleanup = setInterval(() => {
    if (cleaningUploads) return;
    cleaningUploads = true;
    void uploads.cleanup().catch(() => {
      state = "blocked";
      service.beginDrain();
      observations.publish("host", { kind: "state", state });
      process.stderr.write("Host upload maintenance failed; inspect storage and restart.\n");
    }).finally(() => { cleaningUploads = false; });
  }, 60_000);
  uploadCleanup.unref();
  cleanup.push(async () => { clearInterval(uploadCleanup); });
  let stopping: Promise<void> | undefined, forceStopping: Promise<void> | undefined;
  let finishClosing: Promise<void> | undefined;
  const close = () => finishClosing ??= (async () => { clearInterval(uploadCleanup); unsubscribe(); unapprove(); stopTasks?.(); observations.dispose(); await gateway.close(); await admin.close(); })();
  const waitForResources = async () => {
    const recovery = agentRuntime.harnesses.inspect();
    // No executable generation exists after failed recovery. Shutdown still owns cleanup.
    if (recovery.blocked && recovery.instances.length === 0) return;
    for (;;) {
      let busy = agentRuntime.subagents.activeCount > 0;
      for (const session of await application.listSessions()) {
        busy ||= await agentRuntime.runs.inspectCapability<{ hasRunningBackgroundTask?: (id: string) => boolean }, boolean>("tools.shell-tools", tools => tools?.hasRunningBackgroundTask?.(session.sessionId) ?? false);
      }
      if (!busy) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  const handle = { auth, port, hostId: auth.hostId, state: () => state, application,
    stop(force = false): Promise<void> {
      state = "draining"; service.beginDrain(); observations.publish("host", { kind: "state", state });
      if (force) {
        return forceStopping ??= (async () => {
          const deadline = setTimeout(() => options.forceExit?.(), 15000);
          try { await profile.shutdown(); await close(); clearTimeout(deadline); }
          catch (error) { if (!options.forceExit) clearTimeout(deadline); throw error; }
        })();
      }
      return stopping ??= (async () => { await service.waitForOwnedRuns(); await waitForResources(); await profile.shutdown(); await close(); })();
    },
  };
  adminDispatch = async request => {
    switch (request.command) {
      case "status": {
        // Diagnostics must remain available when a Session or capability cannot recover.
        const diagnostics: { sessionId?: string; component: string; reason?: string }[] = [];
        const blocked = agentRuntime.harnesses.inspect().blocked;
        if (blocked) diagnostics.push({ component: "harness-recovery", reason: blocked });
        let sessions: Awaited<ReturnType<AgentApplicationContract["listSessions"]>> = [];
        try { sessions = await application.listSessions(); }
        catch { diagnostics.push({ component: "session-list" }); }
        const waiting: { sessionId: string; runs: string[]; background: boolean | null }[] = [];
        for (const session of sessions) {
          let runs: string[] = [], background: boolean | null = null;
          try {
            const snapshot = await application.taskCommand({ sessionId: session.sessionId, op: "snapshot" });
            runs = snapshot.snapshot.runs.filter(run => run.state === "running").map(run => run.runId);
          } catch { diagnostics.push({ sessionId: session.sessionId, component: "tasks" }); }
          try {
            background = await agentRuntime.runs.inspectCapability<{ hasRunningBackgroundTask?: (id: string) => boolean }, boolean>("tools.shell-tools", tools => tools?.hasRunningBackgroundTask?.(session.sessionId) ?? false);
          } catch { diagnostics.push({ sessionId: session.sessionId, component: "shell-capability" }); }
          if (runs.length || background !== false) waiting.push({ sessionId: session.sessionId, runs, background });
        }
        return { hostId: auth.hostId, state, port, approvals: approvals.list().length, subagents: agentRuntime.subagents.activeCount, waiting, diagnostics };
      }
      case "pair": return auth.createPairCode();
      case "devices": return auth.list();
      case "revoke": if (!request.deviceId) throw new Error("deviceId required"); await auth.revoke(request.deviceId); return { revoked: true };
      case "stop": setTimeout(() => { void handle.stop(request.force).catch(error => { process.stderr.write(`Host shutdown failed: ${String(error)}\n`); }); }, 200); return { state: "draining", force: request.force === true };
    }
  };
  admin.start();
  return handle;
  } catch (error) { for (const dispose of cleanup.reverse()) await dispose().catch(() => undefined); await admin.close(); throw error; }
}
