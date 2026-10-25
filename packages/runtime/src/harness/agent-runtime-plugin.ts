import { PluginManager } from "@actspace/plugin-manager";
import { HarnessHmr } from "@actspace/harness-hmr";
import { EvolutionApproval } from "./evolution-approval.js";
import { join } from "node:path";
import { emitNotification, type CordisContext } from "@actspace/cordis-adapter";
import { HarnessControl, loadArtifact, type SelectionDescription } from "@actspace/harness-control";
import type { HarnessMountRequest } from "@actspace/boot";
import { canonical } from "@actspace/composition";
import type { AgentRegistry } from "@actspace/core-agent";
import { createBuiltInPresets, OneShotSubagentProvider } from "@actspace/subagent";
import type { RuntimeSessionController } from "../session/session-controller.js";
import type { AgentFactoryService } from "./agent-factory-plugin.js";
import { PinnedHarnessError, type AgentRuntimeHostPort, type PinnedHarness } from "./agent-host-port.js";
import type { RuntimeSessionHostPort } from "../session/session-plugin.js";
import { prepareDefaultHarnessArtifact, defaultHarnessSharedModules, DEFAULT_HARNESS_SHARED_SERVICES } from "./default-harness.js";
import { TaskLedger } from "@actspace/agent-service";
import { BackgroundTaskRegistry } from "@actspace/background-tasks";
import { ManagedRuns } from "./managed-runs.js";
import { SANDBOX_SERVICE_ID, type SandboxService } from "@actspace/sandbox/types";

export const inject = Object.freeze([...new Set([...DEFAULT_HARNESS_SHARED_SERVICES.filter(name => name !== "actspace.host.tools.browser"), "actspace.host.session"])]);

/** Host owns scheduling and lifetime; execution services live in isolated Harness trees. */
export class AgentRuntimeService {
  readonly runs: ManagedRuns;
  readonly subagents: OneShotSubagentProvider;
  readonly backgroundTasks: BackgroundTaskRegistry;
  harnesses!: HarnessControl;
  hmr!: HarnessHmr;
  evolution!: PluginManager;
  readonly registry: AgentRegistry;
  constructor(ctx: CordisContext) {
    const host = get<AgentRuntimeHostPort>(ctx, "actspace.host.agent");
    const sessions = get<RuntimeSessionController>(ctx, "session.runtime");
    this.registry = get(ctx, "agent.registry");
    this.backgroundTasks = new BackgroundTaskRegistry({ openSession: async id => sessions.getOpen(id) ?? await sessions.resume(id), wake: id => this.runs.service.wake(id), onError: error => host.onHarnessDiagnostic?.(error) });
    this.runs = new ManagedRuns(sessions, { acquire: (id, signal) => this.harnesses.acquire(id, signal), acquireSession: (id, signal) => this.hmr.acquire(id, signal), acquireVersion: (id, generationId) => this.harnesses.acquire(id, undefined, generationId) }, snapshot => { emitNotification(ctx, "agent/tasks-updated", snapshot); }, this.backgroundTasks);
    this.subagents = new OneShotSubagentProvider({
      store: sessions.store, presets: createBuiltInPresets(["read_file", "list_directory", "grep", "glob"]),
      manifestDigest: host.compositionDigest, plugins: host.plugins,
      createLoop: () => { throw new Error("A child Run requires a Harness lease"); },
      acquireRun: async (preset, signal, invocation) => {
        if (!invocation) throw new Error("Child Run requires its parent invocation");
        const lease = await this.harnesses.acquireForScope(invocation.parentScope, signal);
        const factory = lease.getService<AgentFactoryService>("actspace.agent.factory");
        if (!factory) { void lease.release(); throw new Error("Harness has no child factory"); }
        let ledger: TaskLedger | undefined;
        let runId: string | undefined;
        let releaseLedger: (() => void) | undefined;
        return {
          scope: lease.scope, createLoop: factory.createSubagentLoop,
          release: async () => { releaseLedger?.(); await lease.release(); },
          start: async (session, content, id) => {
            ledger = await TaskLedger.open(session);
            releaseLedger = this.runs.service.registerExternalLedger(ledger);
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
    const sessions = get<RuntimeSessionController>(ctx, "session.runtime");
    const approval = new EvolutionApproval(host, sessions);
    const artifactRoot = join(sessionHost.dataRoot, "harness-artifacts");
    const pinned = host.pinnedHarness;
    this.harnesses = new HarnessControl({ context: ctx, dataRoot: sessionHost.dataRoot,
      artifactRoot, runtimeId: sessionHost.runtimeId,
      // A pinned selection takes the bootstrap path of a fresh data root: mounted as "main", validated like any candidate.
      builtin: pinned ? () => pinnedMount(artifactRoot, pinned.description) : () => prepareDefaultHarnessArtifact({ artifactRoot, hostCapabilities: host.host.capabilityCeiling, disabledEntries: host.disabledHarnessEntries ?? [] }), sharedServices: DEFAULT_HARNESS_SHARED_SERVICES,
      compatibility: { capabilities: host.host.capabilityCeiling, requiredServices: [{ id: "agent.run-factory", version: 1 }, { id: "actspace.agent.factory", version: 1 }], services: DEFAULT_HARNESS_SHARED_SERVICES.map(id => ({ id, version: 1 })), events: [],
        sharedModules, codecArtifacts: [] },
      ...(pinned ? {} : { upgradePristineBuiltin: (record: import("@actspace/harness-control").SelectionRecord) => record.description.composition.entries.every(entry => entry.pluginId === "actspace.default-harness") }),
      authorize: approval.authorize,
      onSelection: record => { emitNotification(ctx, "harness/selection-updated", record); },
      onDiagnostic: error => { host.onHarnessDiagnostic?.(error); },
    });
    await this.harnesses.initialize();
    if (pinned) assertPinned(this.harnesses.inspect("main"), pinned);
    void this.reportSandboxStatus(host);
    ctx.provide?.("harness.control", this.harnesses);
    this.hmr = new HarnessHmr({ dataRoot: sessionHost.dataRoot, control: this.harnesses });
    this.evolution = new PluginManager({ dataRoot: sessionHost.dataRoot, artifactRoot: join(sessionHost.dataRoot, "harness-artifacts"), control: this.harnesses, hmr: this.hmr,
      source: async context => {
        const state = await this.runs.service.snapshot(context.sessionId);
        const run = state.runs.find(r => r.runId === context.agentRunId && r.state === "running");
        if (!run) throw new Error("Evolution requires the calling active Run");
        const record = this.harnesses.inspect(run.harness.harnessId).history.find(r => r.revision === run.harness.revision);
        if (!record) throw new Error("Calling Run version is unavailable");
        return record;
      },
      authorize: (request, context) => approval.request(request, context),
    });
    ctx.provide?.("harness.hmr", this.hmr);
    ctx.provide?.("harness.plugin-manager", this.evolution);
  }
  /** Probing runs the backends, so it stays off the startup path; a blocked Harness is already reported. */
  private async reportSandboxStatus(host: AgentRuntimeHostPort): Promise<void> {
    if (!host.onSandboxStatus) return;
    let lease;
    try { lease = await this.harnesses.acquire("main"); } catch { return; }
    try { host.onSandboxStatus(await lease.getService<SandboxService>(SANDBOX_SERVICE_ID)?.status("tool")); }
    catch (error) { host.onHarnessDiagnostic?.(error); }
    finally { await lease.release().catch(() => undefined); }
  }
  async dispose(): Promise<void> {
    this.runs.quiesce();
    await this.backgroundTasks.dispose();
    await this.subagents.dispose();
    await this.runs.dispose();
    await this.evolution?.close();
    await this.hmr?.close();
    await this.harnesses?.close();
  }
}

async function pinnedMount(artifactRoot: string, description: SelectionDescription): Promise<HarnessMountRequest> {
  const artifacts = await Promise.all(description.artifactIds.map(id => loadArtifact(artifactRoot, id)));
  return { hostContractDigest: description.hostContractDigest, composition: description.composition, artifacts: new Map(artifacts.map(a => [a.manifest.plugin.pluginId, a])), sharedServices: description.sharedServices };
}
/** Startup never falls back to the built-in Harness when a pinned selection cannot run. */
function assertPinned(state: ReturnType<HarnessControl["inspect"]>, pinned: PinnedHarness): void {
  if (state.blocked) throw new PinnedHarnessError(`Pinned Harness cannot mount: ${state.blocked}`);
  const current = state.current;
  const expected = pinned.description;
  if (!current || canonical(current.description.composition) !== canonical(expected.composition) || canonical([...current.description.artifactIds].sort()) !== canonical([...expected.artifactIds].sort()))
    throw new PinnedHarnessError("Harness state already holds another selection; pinned runs need a fresh data root.");
  if (pinned.executionDigest !== undefined && current.executionDigest !== pinned.executionDigest)
    throw new PinnedHarnessError(`Pinned Harness execution digest differs: expected ${pinned.executionDigest}, mounted ${current.executionDigest}.`);
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
