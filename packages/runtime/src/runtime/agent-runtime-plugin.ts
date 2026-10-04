import { join } from "node:path";
import { emitContained, type CordisContext } from "@actspace/cordis-adapter";
import { HarnessControl } from "@actspace/harness-control";
import type { AgentRegistry } from "@actspace/core-agent";
import { createBuiltInPresets, OneShotSubagentProvider } from "@actspace/subagent";
import type { RuntimeSessionController } from "./session-controller.js";
import type { AgentFactoryService } from "./agent-factory-plugin.js";
import type { AgentRuntimeHostPort } from "./agent-host-port.js";
import type { RuntimeSessionHostPort } from "./session-plugin.js";
import { prepareDefaultHarnessArtifact, defaultHarnessSharedModules, DEFAULT_HARNESS_SHARED_SERVICES } from "./default-harness.js";
import { TaskLedger } from "@actspace/agent-service";
import { ManagedRuns } from "./managed-runs.js";

export const inject = Object.freeze([...new Set([...DEFAULT_HARNESS_SHARED_SERVICES.filter(name => name !== "actspace.host.tools.browser"), "actspace.host.session"])]);

/** Host owns scheduling and lifetime; execution services live in isolated Harness trees. */
export class AgentRuntimeService {
  readonly runs: ManagedRuns;
  readonly subagents: OneShotSubagentProvider;
  harnesses!: HarnessControl;
  readonly registry: AgentRegistry;
  constructor(ctx: CordisContext) {
    const host = get<AgentRuntimeHostPort>(ctx, "actspace.host.agent");
    const sessions = get<RuntimeSessionController>(ctx, "session.runtime");
    this.registry = get(ctx, "agent.registry");
    this.runs = new ManagedRuns(sessions, { acquire: (id, signal) => this.harnesses.acquire(id, signal) }, snapshot => { void emitContained(ctx, "agent/tasks-updated", snapshot); });
    this.subagents = new OneShotSubagentProvider({
      store: sessions.store, presets: createBuiltInPresets(["read_file", "list_directory", "grep", "glob"]),
      manifestDigest: host.compositionDigest, plugins: host.plugins,
      createLoop: () => { throw new Error("A child Run requires a Harness lease"); },
      acquireRun: async (preset, signal) => {
        const lease = await this.harnesses.acquire("main", signal);
        const factory = lease.getService<AgentFactoryService>("actspace.agent.factory");
        if (!factory) { void lease.release(); throw new Error("Harness has no child factory"); }
        let ledger: TaskLedger | undefined;
        let runId: string | undefined;
        return {
          scope: lease.scope, createLoop: factory.createSubagentLoop, release: lease.release,
          start: async (session, content, id) => {
            ledger = await TaskLedger.open(session);
            const receipt = await ledger.submit(id, content);
            await ledger.start(receipt.task.taskId, id, { harnessId: lease.harnessId, generationId: lease.generationId, revision: lease.revision }, JSON.parse(JSON.stringify({ harnessExecutionDigest: lease.executionDigest, presetId: preset.id, model: preset.model, routeId: preset.routeId, maxSteps: preset.maxSteps, durationMs: preset.maxDurationMs })));
            runId = id;
            return { messageId: receipt.task.taskId };
          },
          finish: async (outcome, value) => { if (ledger && runId) await ledger.finish(runId, outcome, value); },
        };
      },
    });
  }
  async initialize(ctx: CordisContext): Promise<void> {
    const host = get<AgentRuntimeHostPort>(ctx, "actspace.host.agent");
    const sessionHost = get<RuntimeSessionHostPort>(ctx, "actspace.host.session");
    const sharedModules = await defaultHarnessSharedModules();
    this.harnesses = new HarnessControl({ context: ctx, dataRoot: sessionHost.dataRoot,
      artifactRoot: join(sessionHost.dataRoot, "harness-artifacts"), runtimeId: sessionHost.runtimeId,
      builtin: () => prepareDefaultHarnessArtifact({ artifactRoot: join(sessionHost.dataRoot, "harness-artifacts"), hostCapabilities: host.host.capabilityCeiling, disabledEntries: host.disabledHarnessEntries ?? [] }), sharedServices: DEFAULT_HARNESS_SHARED_SERVICES,
      compatibility: { capabilities: host.host.capabilityCeiling, requiredServices: [{ id: "agent.run-factory", version: 1 }, { id: "actspace.agent.factory", version: 1 }], services: DEFAULT_HARNESS_SHARED_SERVICES.map(id => ({ id, version: 1 })), events: [{ id: "session/checkpoint", version: 1, mode: "emit" }],
        sharedModules, codecArtifacts: [] },
      authorize: host.authorizeHarness,
      onSelection: record => { void emitContained(ctx, "harness/selection-updated", record); },
      onDiagnostic: error => { host.onHarnessDiagnostic?.(error); },
    });
    await this.harnesses.initialize();
    ctx.provide?.("harness.control", this.harnesses);
  }
  async dispose(): Promise<void> {
    this.runs.quiesce();
    await this.subagents.dispose();
    await this.runs.dispose();
    await this.harnesses?.close();
  }
}

export async function apply(ctx: CordisContext): Promise<void> {
  const runtime = new AgentRuntimeService(ctx);
  try { await runtime.initialize(ctx); }
  catch (error) { await runtime.dispose(); throw error; }
  ctx.provide?.("agent.runtime", runtime);
  ctx.provide?.("agent.service", runtime.runs.service);
  ctx.effect?.(() => () => runtime.dispose(), "agent.runtime");
}
function get<T>(ctx: CordisContext, id: string): T {
  const value = ctx.get?.(id) as T | undefined;
  if (value === undefined) throw new Error(`Agent runtime plugin requires ${id}.`);
  return value;
}
