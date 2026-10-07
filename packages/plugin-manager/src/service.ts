import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, realpath, lstat } from "node:fs/promises";
import { join, relative } from "node:path";
import { pluginDevelopmentRoot } from "@actspace/official-skills";
import { verifyPluginArtifact, type PluginArtifact, type PluginArtifactManifest } from "@actspace/cordis-adapter";
import { atomicJson, readJson, type HarnessHmr, type SessionHarnessBinding } from "@actspace/harness-hmr";
import type { HarnessControl, SelectionRecord, AuthorizationRequest } from "@actspace/harness-control";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import type { Patch } from "@actspace/bundle";
import { buildTool, readSource, sourceDigest } from "./build.js";
export type EvolutionAuthorization = { phase: "initialize" | "activate"; purpose: string; artifactId?: string; executionDigest?: string; candidate?: AuthorizationRequest };
export type PluginManagerOptions = {
  dataRoot: string; artifactRoot: string; control: HarnessControl; hmr: HarnessHmr;
  source(context: ToolExecutionContext): Promise<SelectionRecord>;
  authorize(request: EvolutionAuthorization, context: ToolExecutionContext): Promise<unknown>;
};
type Workspace = { schemaVersion: 1; workspaceId: string; sessionId: string; purpose: string; directory: string; toolName: string; entryId?: string; source: { harnessId: string; revision: number; executionDigest: string }; binding: SessionHarnessBinding; artifactId?: string; sourceDigest?: string; candidate?: { candidateId: string; harnessId: string; expectedRevision: number; executionDigest: string }; changeId?: string; state: "editable" | "built" | "ready" | "bound" | "discarded" };
export class PluginManager {
  readonly #gates = new Map<string, Promise<unknown>>();
  #closed = false;
  constructor(private readonly options: PluginManagerOptions) {}
  execute(args: Readonly<Record<string, unknown>>, context: ToolExecutionContext): Promise<unknown> {
    if (this.#closed) return Promise.reject(new Error("Plugin Manager is closed"));
    const next = (this.#gates.get(context.sessionId) ?? Promise.resolve()).then(() => this.#execute(args, context));
    const settled = next.catch(() => undefined); this.#gates.set(context.sessionId, settled);
    void settled.then(() => { if (this.#gates.get(context.sessionId) === settled) this.#gates.delete(context.sessionId); });
    return next;
  }
  async inspect(context: ToolExecutionContext) {
    const source = await this.options.source(context);
    return { run: { harnessId: source.harnessId, revision: source.revision, executionDigest: source.executionDigest }, selected: await this.options.hmr.inspect(context.sessionId), versionRef: { executionDigest: source.executionDigest, artifactIds: source.description.artifactIds }, versions: this.options.control.inspect(source.harnessId).history.map(r => ({ revision: r.revision, executionDigest: r.executionDigest })), resources: { skill: join(pluginDevelopmentRoot, "SKILL.md"), contract: join(pluginDevelopmentRoot, "references/contract.md"), template: join(pluginDevelopmentRoot, "templates"), sourceContract: "json-tool-v1" }, entries: source.description.composition.entries.map(e => ({ entryId: e.entryId, pluginId: e.pluginId, artifactId: e.artifactId, enabled: e.enabled, editable: e.pluginId.startsWith("actspace.evolved."), reason: e.pluginId.startsWith("actspace.evolved.") ? "fixed source included" : "No supported editable source contract; Host and management plugins are not editable", provides: e.provides, injects: e.injects })), actions: ["create", "build", "prepare", "apply", "status", "discard", "rollback"], timing: "Current Run keeps its lease. After bound, the next user message uses the selected version." };
  }
  async #execute(args: Readonly<Record<string, unknown>>, context: ToolExecutionContext): Promise<unknown> {
    context.signal.throwIfAborted();
    const action = args.action;
    if (action === "create") return this.#create(args, context);
    const id = String(args.workspaceId ?? "");
    const workspace = await this.#read(id, context.sessionId);
    // Resolve a lost apply response before allowing edits or discard.
    if (workspace.candidate && workspace.changeId && this.options.control.inspect(workspace.candidate.harnessId).history.some(r => r.activationId === workspace.changeId)) {
      await this.options.hmr.inspect(context.sessionId);
      workspace.state = "bound";
      await this.#save(workspace);
    }
    if (workspace.state === "ready" && workspace.candidate && !this.options.control.inspect(workspace.candidate.harnessId).candidates.some(c => c.candidateId === workspace.candidate!.candidateId)) {
      delete workspace.candidate; delete workspace.changeId;
      workspace.state = "built";
      await this.#save(workspace);
    }
    if (action === "status") return { ...workspace, selected: await this.options.hmr.inspect(context.sessionId) };
    if (action === "discard") {
      if (workspace.state === "bound") throw new Error("Cannot discard an applied version; use rollback");
      await this.#discard(workspace); workspace.state = "discarded"; await this.#save(workspace); return workspace;
    }
    if (action === "build") {
      if (workspace.state === "bound" || workspace.state === "discarded") throw new Error("Create a source copy before changing a published workspace");
      await this.#discard(workspace);
      delete workspace.artifactId; delete workspace.sourceDigest;
      workspace.state = "editable";
      await this.#save(workspace);
      const source = await readSource(await this.#directory(workspace));
      if (source.metadata.name !== workspace.toolName) throw new Error("Tool name is fixed; create another tool to rename");
      const artifact = await buildTool(source, this.options.artifactRoot);
      Object.assign(workspace, { artifactId: artifact.artifactId, sourceDigest: sourceDigest(source), state: "built" });
      await this.#save(workspace); return workspace;
    }
    if (action === "prepare") {
      if (workspace.state !== "built" && workspace.state !== "ready") throw new Error("Build the workspace first");
      await this.#assertBaseline(workspace);
      if (workspace.candidate && this.options.control.inspect(workspace.candidate.harnessId).candidates.some(c => c.candidateId === workspace.candidate!.candidateId)) return workspace;
      const artifact = await this.#artifact(workspace.artifactId!);
      await this.options.authorize({ phase: "initialize", purpose: workspace.purpose, artifactId: artifact.artifactId }, context);
      context.signal.throwIfAborted();
      const patch = patchFor(workspace, artifact);
      const harnessId = this.options.hmr.branchId(context.sessionId);
      const input = { harnessId, expectedRevision: workspace.binding.revision === 0 ? 0 : workspace.binding.selectionRevision, baseExecutionDigest: workspace.source.executionDigest, artifactIds: [artifact.artifactId], patch };
      const candidate = workspace.binding.revision === 0 ? await this.options.control.prepareBranch({ ...input, sourceHarnessId: workspace.source.harnessId, sourceRevision: workspace.source.revision }) : await this.options.control.prepare(input);
      if (context.signal.aborted) { await this.options.control.discard(candidate.candidateId); context.signal.throwIfAborted(); }
      workspace.candidate = candidate; workspace.changeId = `evolution:${randomUUID()}`; workspace.state = "ready";
      try { await this.#save(workspace); } catch (error) { await this.options.control.discard(candidate.candidateId); throw error; }
      return workspace;
    }
    if (action === "apply") {
      if (!workspace.candidate || !workspace.changeId) throw new Error("Prepare a candidate first");
      if (workspace.state === "bound") return { ...workspace, selected: await this.options.hmr.inspect(context.sessionId) };
      // Recovery may already have completed a durable selection whose response was lost.
      const committed = this.options.control.inspect(workspace.candidate.harnessId).history.some(r => r.activationId === workspace.changeId);
      if (!committed) await this.#assertBaseline(workspace);
      const request = { ...workspace.candidate, activationId: workspace.changeId };
      const authority = committed ? undefined : await this.options.authorize({ phase: "activate", purpose: workspace.purpose, artifactId: workspace.artifactId, candidate: request }, context);
      const binding = await this.options.hmr.apply({ schemaVersion: 1, sessionId: context.sessionId, changeId: workspace.changeId, candidateId: workspace.candidate.candidateId, harnessId: workspace.candidate.harnessId, executionDigest: workspace.candidate.executionDigest, expectedBindingRevision: workspace.binding.revision }, authority, context.signal);
      workspace.state = "bound"; await this.#save(workspace); return { ...workspace, selected: binding, currentRunUnchanged: true };
    }
    if (action === "rollback") {
      const binding = await this.options.hmr.inspect(context.sessionId);
      if (binding.revision === 0) throw new Error("Session has no local version to roll back");
      const digest = String(args.executionDigest ?? "");
      const history = this.options.control.inspect(binding.harnessId).history;
      const source = !history.some(r => r.executionDigest === digest) && digest === workspace.source.executionDigest ? workspace.source : undefined;
      if (!source && !history.some(r => r.executionDigest === digest)) throw new Error("Historical local or workspace source version not found");
      await this.options.authorize({ phase: "initialize", purpose: `Rollback: ${workspace.purpose}`, executionDigest: digest }, context);
      context.signal.throwIfAborted();
      const candidate = await this.options.control.prepareRollback(binding.harnessId, binding.selectionRevision, digest, source);
      const changeId = `rollback:${randomUUID()}`;
      try {
        const authority = await this.options.authorize({ phase: "activate", purpose: "Restore the selected historical Harness", candidate: { ...candidate, activationId: changeId } }, context);
        return await this.options.hmr.apply({ schemaVersion: 1, sessionId: context.sessionId, changeId, candidateId: candidate.candidateId, harnessId: binding.harnessId, executionDigest: candidate.executionDigest, expectedBindingRevision: binding.revision }, authority, context.signal);
      } finally {
        if (this.options.control.inspect(binding.harnessId).candidates.some(c => c.candidateId === candidate.candidateId)) await this.options.control.discard(candidate.candidateId);
      }
    }
    throw new Error("Unknown plugin_manager action");
  }
  async #create(args: Readonly<Record<string, unknown>>, context: ToolExecutionContext) {
    const purpose = typeof args.purpose === "string" ? args.purpose.trim() : "";
    if (!purpose || purpose.length > 4096) throw new Error("Provide the user's explicit modification request as purpose");
    const source = await this.options.source(context);
    const binding = await this.options.hmr.inspect(context.sessionId);
    if (binding.executionDigest !== source.executionDigest || binding.selectionRevision !== source.revision || binding.harnessId !== source.harnessId) throw new Error("The current Run uses an older Harness; send a new message before another change");
    let original = pluginDevelopmentRoot + "/templates";
    let toolName = String(args.toolName ?? "");
    const target = typeof args.entryId === "string" ? source.description.composition.entries.find(e => e.entryId === args.entryId) : undefined;
    if (args.entryId !== undefined) {
      if (!target?.pluginId.startsWith("actspace.evolved.") || !target.artifactId) throw new Error("This entry does not include supported editable source");
      original = (await this.#artifact(target.artifactId)).root; toolName = target.pluginId.slice("actspace.evolved.".length);
    }
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(toolName) || ["plugin_manager", "harness_inspect"].includes(toolName)) throw new Error("Invalid or reserved tool name");
    const workspaceId = randomUUID();
    const root = await realpath(context.workspaceRoot);
    let parent = root;
    for (const part of [".actspace", "evolution"]) {
      parent = join(parent, part);
      await mkdir(parent).catch(error => { if (error.code !== "EEXIST") throw error; });
      if ((await lstat(parent)).isSymbolicLink() || await realpath(parent) !== parent) throw new Error("Workspace directory escapes project root");
    }
    const directory = join(parent, workspaceId);
    await mkdir(directory);
    const resolved = await realpath(directory);
    if (relative(await realpath(context.workspaceRoot), resolved).startsWith("..")) throw new Error("Workspace directory escapes project root");
    const initial = await readSource(original); initial.metadata.name = toolName;
    await writeFile(join(directory, "tool.json"), JSON.stringify(initial.metadata, null, 2) + "\n", { flag: "wx" });
    await writeFile(join(directory, "implementation.ts"), initial.implementation, { flag: "wx" });
    const workspace: Workspace = { schemaVersion: 1, workspaceId, sessionId: context.sessionId, purpose, directory: resolved, toolName, ...(target ? { entryId: target.entryId } : {}), source: { harnessId: source.harnessId, revision: source.revision, executionDigest: source.executionDigest }, binding, state: "editable" };
    await this.#save(workspace); return workspace;
  }
  async #directory(workspace: Workspace): Promise<string> { if ((await lstat(workspace.directory)).isSymbolicLink() || await realpath(workspace.directory) !== workspace.directory) throw new Error("Workspace path changed"); return workspace.directory; }
  async #artifact(id: string): Promise<PluginArtifact> {
    if (!/^sha256-[a-f0-9]{64}$/.test(id)) throw new Error("Invalid artifact identity");
    const root = join(this.options.artifactRoot, id);
    const manifest = JSON.parse(await readFile(join(root, "artifact.json"), "utf8")) as PluginArtifactManifest;
    return verifyPluginArtifact({ artifactId: id, root, manifest });
  }
  async #assertBaseline(workspace: Workspace) {
    const binding = await this.options.hmr.inspect(workspace.sessionId);
    if (JSON.stringify(binding) !== JSON.stringify(workspace.binding)) throw new Error("Session baseline changed; create a fresh source copy");
  }
  async #discard(workspace: Workspace) {
    if (workspace.candidate && this.options.control.inspect(workspace.candidate.harnessId).candidates.some(c => c.candidateId === workspace.candidate!.candidateId)) await this.options.control.discard(workspace.candidate.candidateId);
    delete workspace.candidate; delete workspace.changeId;
  }
  #path(id: string) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid workspace identity"); return join(this.options.dataRoot, "evolution", "workspaces", id + ".json"); }
  async #read(id: string, sessionId: string): Promise<Workspace> { const workspace = await readJson<Workspace>(this.#path(id)); if (!workspace || workspace.schemaVersion !== 1 || workspace.workspaceId !== id || workspace.sessionId !== sessionId) throw new Error("Workspace not found for this session"); return workspace; }
  #save(workspace: Workspace) { return atomicJson(this.#path(workspace.workspaceId), workspace); }
  async close() { this.#closed = true; await Promise.allSettled(this.#gates.values()); }
}
function patchFor(workspace: Workspace, artifact: PluginArtifact): Patch {
  const row = artifact.manifest.plugin.behaviors[0]!;
  return { id: `evolution-${workspace.workspaceId}`, provenance: `source:${workspace.sourceDigest}`, operations: [workspace.entryId ? { id: "replace", kind: "replace", target: workspace.entryId, artifactId: artifact.artifactId, manifestEntryId: row.entryId } : { id: "insert", kind: "insert", entry: { entryId: row.entryId, artifactId: artifact.artifactId, manifestEntryId: row.entryId, pluginId: artifact.manifest.plugin.pluginId, pluginVersion: artifact.manifest.plugin.version, module: row.module, required: true, enabled: true, config: {}, requiredCapabilities: ["process"], optionalCapabilities: [], provides: row.provides ?? [], injects: row.injects ?? [], frontendRequired: false, provenance: artifact.manifest.plugin.source.reference, state: "candidate" } }] };
}
