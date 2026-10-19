import { paginateSessionSummaries } from "@actspace/shared/session-list-page";
import { fileReferenceBlocks, responseExcerptBlocks } from "@actspace/shared";
import { validateRunReferences } from "@actspace/shared/composer-reference-validation";
import { resolveWorkspaceFileReference } from "./node-ports/workspace-file-reference.js";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import type { AgentApplicationContract } from "@actspace/agent-service";
import type { RuntimeV2JsonValue, TaskCommand, TaskConfiguration } from "@actspace/shared/runtime-v2";
import { HostError, integerParam, isRecord, stringParam, type HostMethod } from "@actspace/shared/host-protocol";
import type { HostConfig } from "./config.js";
import type { HostRequestContext } from "./server.js";
import type { HostApprovalBroker } from "./approval.js";
import type { HostObservations } from "./observation.js";
import type { HostUploads } from "./uploads.js";

type Params = Readonly<Record<string, unknown>>;
function fields(input: Params, allowed: readonly string[]): void {
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new TypeError("Unexpected Host parameter");
}
function revision(input: Params) { return integerParam(input, "revision", Number.MAX_SAFE_INTEGER); }
function configuration(input: unknown, config: HostConfig): TaskConfiguration {
  if (!isRecord(input)) throw new TypeError("Invalid task configuration");
  fields(input, ["model", "durationMs", "deadline", "thinkingEnabled", "reasoningEffort", "selectedSkillIds"]);
  if (input.model !== undefined && (typeof input.model !== "string" || !config.providers.some(p => p.models.some(model => `${p.id}/${model}` === input.model)))) throw new TypeError("Model is not published by this Host");
  for (const key of ["durationMs", "deadline"]) if (input[key] !== undefined) integerParam(input, key, Number.MAX_SAFE_INTEGER);
  if (input.thinkingEnabled !== undefined && typeof input.thinkingEnabled !== "boolean") throw new TypeError("Invalid thinkingEnabled");
  if (input.reasoningEffort !== undefined && !["minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(String(input.reasoningEffort))) throw new TypeError("Invalid reasoningEffort");
  if (input.selectedSkillIds !== undefined && (!Array.isArray(input.selectedSkillIds) || input.selectedSkillIds.length > 100 || input.selectedSkillIds.some(id => typeof id !== "string" || !id.length || id.length > 256))) throw new TypeError("Invalid selectedSkillIds");
  return input as TaskConfiguration;
}
function taskCommand(params: Params, config: HostConfig): TaskCommand {
  const sessionId = stringParam(params, "sessionId", 128), op = stringParam(params, "op", 32);
  switch (op) {
    case "snapshot": fields(params, ["sessionId", "op"]); return { sessionId, op };
    case "configure": fields(params, ["sessionId", "op", "configuration"]); return { sessionId, op, configuration: configuration(params.configuration, config) };
    case "stop": fields(params, ["sessionId", "op", "runId"]); return { sessionId, op, runId: stringParam(params, "runId", 128) };
    case "resume": fields(params, ["sessionId", "op", "revision"]); return { sessionId, op, revision: revision(params) };
    case "cancel": fields(params, ["sessionId", "op", "taskId", "revision"]); return { sessionId, op, taskId: stringParam(params, "taskId", 128), revision: revision(params) };
    case "move": fields(params, ["sessionId", "op", "taskId", "beforeTaskId", "revision"]); return { sessionId, op, taskId: stringParam(params, "taskId", 128), beforeTaskId: stringParam(params, "beforeTaskId", 128), revision: revision(params) };
    case "designate": fields(params, ["sessionId", "op", "taskId", "runId", "revision"]); return { sessionId, op, taskId: stringParam(params, "taskId", 128), runId: params.runId === null ? null : stringParam(params, "runId", 128), revision: revision(params) };
    default: throw new TypeError("Invalid task command");
  }
}
export interface HostRpcOptions {
  application: AgentApplicationContract;
  config: HostConfig;
  approvals: HostApprovalBroker;
  observations: HostObservations;
  uploads: HostUploads;
  artifacts?: import("./artifacts.js").HostArtifacts;
  output: import("./live-output.js").HostLiveOutput;
  state(): "ready" | "draining" | "blocked";
  /** Sessions with a running Run; `activity` host events carry later changes. */
  runningSessions?(): readonly string[];
}
/** Wire validation and Host policy only; durable task ownership stays in AgentService. */
export class HostRpc {
  constructor(private readonly options: HostRpcOptions) {}
  async dispatch(method: HostMethod, params: Params, context: HostRequestContext): Promise<unknown> {
    const { application: app, config, approvals, observations, uploads } = this.options;
    const state = this.options.state();
    const mutating = ["sessions.create", "sessions.fork", "sessions.update", "tasks.submit", "uploads.begin", "uploads.write", "uploads.finish", "files.reference"].includes(method)
      || (method === "tasks.command" && !["snapshot", "stop", "cancel"].includes(String(params.op)));
    if (state !== "ready" && mutating) throw new HostError(state === "blocked" ? "RECOVERY_BLOCKED" : "MAINTENANCE", "Host is not accepting new work");
    switch (method) {
      case "host.describe": fields(params, []); return { state, workspaces: config.workspaces, models: config.providers.flatMap(provider => provider.models.map(model => ({ id: `${provider.id}/${model}`, provider: provider.id, name: model }))), defaultModel: config.defaultModel, capabilities: { terminal: false, gitReview: false, browser: false } };
      case "sessions.list": fields(params, []); return app.listSessions();
      case "sessions.browse": {
        fields(params, ["workspaceRoot", "pinned", "after"]);
        if (params.workspaceRoot !== undefined && typeof params.workspaceRoot !== "string" || params.pinned !== undefined && typeof params.pinned !== "boolean" || params.after !== undefined && typeof params.after !== "string") throw new TypeError("Invalid list cursor");
        return paginateSessionSummaries({ items: await app.listSessions(), indexing: false, failed: 0 }, params);
      }
      case "host.observe": fields(params, []); return observations.observe("host", async () => ({ approvals: approvals.list(), state: this.options.state(), running: this.options.runningSessions?.() ?? [] }), context);
      case "sessions.observe": {
        fields(params, ["sessionId"]); const sessionId = stringParam(params, "sessionId", 128);
        return observations.observe(sessionId, async () => ({ observation: await app.readSessionObservation({ sessionId, maxWindowEvents: 100, maxWindowBytes: 262144 }), tasks: (await app.taskCommand({ sessionId, op: "snapshot" })).snapshot, approvals: approvals.list(sessionId), output: this.options.output.describe(sessionId) }), context);
      }
      case "host.unobserve": case "sessions.unobserve": fields(params, ["subscriptionId"]); observations.unobserve(stringParam(params, "subscriptionId", 128), context.connectionId); return null;
      case "sessions.create": {
        fields(params, ["sessionId", "workspaceId", "agentForm"]);
        const workspace = config.workspaces.find(item => item.id === stringParam(params, "workspaceId", 128));
        if (!workspace) throw new HostError("NOT_FOUND", "Workspace not published by Host");
        if (params.agentForm !== undefined && params.agentForm !== "agent" && params.agentForm !== "chat") throw new TypeError("Invalid agent form");
        const result = await app.createMainSession(params.sessionId === undefined ? randomUUID() : stringParam(params, "sessionId", 128), workspace.path, params.agentForm ?? "agent");
        await app.taskCommand({ sessionId: result.sessionId, op: "configure", configuration: { model: config.defaultModel } });
        observations.publish("host", { kind: "sessions-changed" }); return result;
      }
      case "sessions.fork": fields(params, ["sessionId", "boundarySeq", "newSessionId"]); return app.forkMainSession(stringParam(params, "sessionId", 128), integerParam(params, "boundarySeq", Number.MAX_SAFE_INTEGER), stringParam(params, "newSessionId", 128));
      case "sessions.tool": fields(params, ["sessionId", "callId"]); return app.browseToolDetail(stringParam(params, "sessionId", 128), stringParam(params, "callId", 128));
      case "sessions.page": {
        fields(params, ["sessionId", "beforeSeq"]);
        return app.readSessionObservation({ sessionId: stringParam(params, "sessionId", 128), ...(params.beforeSeq === undefined ? {} : { beforeSeq: integerParam(params, "beforeSeq", Number.MAX_SAFE_INTEGER) }), maxWindowEvents: 100, maxWindowBytes: 262144 });
      }
      case "sessions.update": {
        fields(params, ["sessionId", "patch"]); const sessionId = stringParam(params, "sessionId", 128);
        if (!isRecord(params.patch)) throw new TypeError("Invalid session patch");
        const patch = params.patch; fields(patch, ["title", "pinned", "archived", "mode", "expectedRevision", "permissionMode"]);
        const modeChange = patch.mode !== undefined || patch.permissionMode !== undefined;
        if (modeChange && Object.keys(patch).some(key => !["mode", "permissionMode", "expectedRevision"].includes(key))) throw new TypeError("Separate mode and metadata changes");
        if (patch.mode !== undefined) {
          if (patch.permissionMode !== undefined || !["chat", "plan", "agent"].includes(String(patch.mode))) throw new TypeError("Invalid mode change");
          return app.updateSessionAgentMode(sessionId, patch.mode as "chat" | "plan" | "agent", integerParam(patch, "expectedRevision", Number.MAX_SAFE_INTEGER));
        }
        if (patch.permissionMode !== undefined) {
          if (patch.permissionMode !== "default" && patch.permissionMode !== "full-access" && patch.permissionMode !== "auto-review") throw new TypeError("Invalid permission mode");
          return app.updateSessionPermissionMode(sessionId, patch.permissionMode);
        }
        if (patch.title !== undefined && patch.title !== null && (typeof patch.title !== "string" || patch.title.length > 160)) throw new TypeError("Invalid title");
        for (const key of ["pinned", "archived"]) if (patch[key] !== undefined && typeof patch[key] !== "boolean") throw new TypeError(`Invalid ${key}`);
        return app.updateSessionMetadata(sessionId, patch as { title?: string | null; pinned?: boolean; archived?: boolean });
      }
      case "sessions.output": fields(params, ["sessionId", "runId", "offset"]); return this.options.output.page(stringParam(params, "sessionId", 128), stringParam(params, "runId", 128), integerParam(params, "offset", Number.MAX_SAFE_INTEGER));
      case "tasks.submit": {
        fields(params, ["sessionId", "submissionId", "content", "uploadIds", "fileReferences", "responseAnnotations"]);
        if (typeof params.content !== "string") throw new TypeError("Task content must be text");
        const sessionId = stringParam(params, "sessionId", 128), submissionId = stringParam(params, "submissionId", 128);
        const ids = params.uploadIds ?? [];
        if (!Array.isArray(ids) || ids.some(id => typeof id !== "string")) throw new TypeError("Invalid attachment list");
        const original = { userInput: params.content, uploadIds: ids as string[], fileReferences: params.fileReferences ?? [], responseAnnotations: params.responseAnnotations ?? [] };
        const previous = (await app.taskCommand({ sessionId, op: "snapshot" })).snapshot.tasks.find(task => task.submissionId === submissionId);
        if (previous) {
          const stored = previous.content;
          const matches = typeof stored === "string"
            ? stored === params.content && !ids.length && Array.isArray(original.fileReferences) && !original.fileReferences.length && Array.isArray(original.responseAnnotations) && !original.responseAnnotations.length
            : isRecord(stored) && stored.kind === "composer-task" && isRecord(stored.original) && isDeepStrictEqual({ fileReferences: [], responseAnnotations: [], ...stored.original }, original);
          if (!matches) throw new HostError("CONFLICT", "Submission identity already belongs to different content");
          return app.submitTask(sessionId, submissionId, stored);
        }
        const referencesInput = await validateRunReferences({ inspectSession: id => app.inspectSession(id), readSessionProjection: input => app.readSessionProjection(input), resolveFile: resolveWorkspaceFileReference }, { sessionId, fileReferences: params.fileReferences, responseAnnotations: params.responseAnnotations });
        if (!referencesInput.ok) throw new HostError("FORBIDDEN", `Invalid message reference: ${referencesInput.issue.code}`);
        const referenceBlocks: RuntimeV2JsonValue[] = [...fileReferenceBlocks(referencesInput.fileReferences), ...responseExcerptBlocks(referencesInput.responseAnnotations)];
        if (!params.content.trim() && ids.length === 0 && !referenceBlocks.length) throw new TypeError("Task content is empty");
        if (!ids.length && !referenceBlocks.length) return app.submitTask(sessionId, submissionId, params.content);
        const references = ids.length ? await uploads.pin(context.deviceId, sessionId, ids as string[], submissionId) : [];
        const blocks: RuntimeV2JsonValue[] = params.content ? [{ type: "text", text: params.content }, ...referenceBlocks] : [...referenceBlocks];
        for (const ref of references) {
          const stored = await uploads.resolve(sessionId, ref.id);
          blocks.push({ type: "artifact", artifact: { artifactId: ref.id, mediaType: stored.mediaType }, label: ref.name });
        }
        return app.submitTask(sessionId, submissionId, { kind: "composer-task", original: JSON.parse(JSON.stringify(original)), prepared: blocks });
      }
      case "tasks.lookup": {
        fields(params, ["sessionId", "submissionId"]); const submissionId = stringParam(params, "submissionId", 128);
        const result = await app.taskCommand({ sessionId: stringParam(params, "sessionId", 128), op: "snapshot" });
        return { task: result.snapshot.tasks.find(task => task.submissionId === submissionId) ?? null, revision: result.snapshot.revision };
      }
      case "tasks.command": return app.taskCommand(taskCommand(params, config));
      case "approvals.list": fields(params, ["sessionId"]); return approvals.list(params.sessionId === undefined ? undefined : stringParam(params, "sessionId", 128));
      case "approvals.decide": {
        fields(params, ["sessionId", "requestId", "kind", "suggestionId"]);
        if (params.kind !== "once" && params.kind !== "session" && params.kind !== "deny") throw new TypeError("Invalid approval decision");
        approvals.decide(stringParam(params, "sessionId", 128), stringParam(params, "requestId", 128), params.kind, params.suggestionId === undefined ? undefined : stringParam(params, "suggestionId", 128)); return null;
      }
      case "uploads.begin": {
        fields(params, ["sessionId", "name", "size", "sha256"]); const sessionId = stringParam(params, "sessionId", 128); await app.inspectSession(sessionId);
        return uploads.begin({ deviceId: context.deviceId, sessionId, name: stringParam(params, "name", 255), size: integerParam(params, "size", 20 * 1024 * 1024), sha256: stringParam(params, "sha256", 64) });
      }
      case "uploads.status": fields(params, ["sessionId", "uploadId"]); return uploads.status(context.deviceId, stringParam(params, "sessionId", 128), stringParam(params, "uploadId", 128));
      case "uploads.write": fields(params, ["sessionId", "uploadId", "offset", "data", "sha256"]); return uploads.write(context.deviceId, stringParam(params, "sessionId", 128), stringParam(params, "uploadId", 128), integerParam(params, "offset", 20 * 1024 * 1024), stringParam(params, "data", 350000), stringParam(params, "sha256", 64));
      case "uploads.finish": fields(params, ["sessionId", "uploadId"]); return uploads.finish(context.deviceId, stringParam(params, "sessionId", 128), stringParam(params, "uploadId", 128));
      case "uploads.abort": fields(params, ["sessionId", "uploadId"]); return uploads.abort(context.deviceId, stringParam(params, "sessionId", 128), stringParam(params, "uploadId", 128));
      case "files.reference": {
        fields(params, ["sessionId", "path"]);
        const sessionId = stringParam(params, "sessionId", 128), snapshot = await app.inspectSession(sessionId);
        if (!this.options.artifacts || !snapshot.workspaceRoot || !config.workspaces.some(workspace => workspace.path === snapshot.workspaceRoot)) throw new HostError("FORBIDDEN", "Session workspace is not published");
        return this.options.artifacts.reference(sessionId, snapshot.workspaceRoot, stringParam(params, "path", 4096));
      }
      case "artifacts.describe": fields(params, ["sessionId", "artifactId"]); return (this.options.artifacts ?? uploads).describe(stringParam(params, "sessionId", 128), stringParam(params, "artifactId", 128));
      case "artifacts.read": fields(params, ["sessionId", "artifactId", "offset", "length"]); return (this.options.artifacts ?? uploads).read(stringParam(params, "sessionId", 128), stringParam(params, "artifactId", 128), integerParam(params, "offset", Number.MAX_SAFE_INTEGER), integerParam(params, "length", 262144));
      default: throw new TypeError("Host method is not implemented");
    }
  }
}
