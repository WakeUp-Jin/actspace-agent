import { desktopBridgeContract as contract, type InvokeSpec } from "@actspace/shared/desktop-bridge";
import { HOST_METHODS, isRecord } from "@actspace/shared/host-protocol";
import { HARNESS_STATS_QUERY_KINDS, MODEL_REASONING_EFFORTS, PROVIDER_IDS, PURPOSE_IDS, SEARCH_PROVIDER_IDS, THINKING_LEVELS } from "@actspace/shared";

/**
 * IPC 入参 guard：只校验类型和形状，不校验业务规则（路径是否注册、会话是否存在等仍由 handler 负责）。
 * 返回 `null` 表示通过，返回字符串表示拒绝原因；注册器会把原因和 channel 一起抛给 renderer。
 *
 * 契约里的每个 invoke 都必须在 `GUARDS` 里登记：无入参的用 `NO_INPUT`，其余写形状。
 * 注册器在 `handle()` 时查不到 guard 直接抛错，`ipc-guards.test.ts` 断言登记表与契约一致。
 */
export type IpcGuard = (input: unknown) => string | null;

type FieldTag = "string" | "string?" | "boolean" | "boolean?" | "number" | "number?" | "record" | "record?" | "string[]" | "string[]?" | "array" | "array?";
/** 字段规则：内置标签，或自定义谓词（谓词自己决定是否放行 undefined / null）。 */
type Field = FieldTag | ((value: unknown) => boolean);
type Fields = Readonly<Record<string, Field>>;

function fieldOk(value: unknown, field: Field): boolean {
  if (typeof field === "function") return field(value);
  // 可选字段放行 null：handler 一律用 `??` 兜底，renderer 偶尔会传 null。
  if (value === undefined || value === null) return field.endsWith("?");
  switch (field.replace("?", "")) {
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "record": return isRecord(value);
    case "string[]": return Array.isArray(value) && value.every(item => typeof item === "string");
    case "array": return Array.isArray(value);
    default: return false;
  }
}

function matches(input: unknown, fields: Fields): boolean {
  if (!isRecord(input)) return false;
  for (const [key, field] of Object.entries(fields)) if (!fieldOk(input[key], field)) return false;
  return true;
}

function check(input: unknown, fields: Fields, reason: string): string | null {
  return matches(input, fields) ? null : reason;
}

const shape = (fields: Fields, reason: string): IpcGuard => (input) => check(input, fields, reason);
const contextShape = (fields: Fields, reason: string): IpcGuard => input => {
  const invalid = check(input, fields, reason);
  if (invalid || !isRecord(input)) return invalid ?? reason;
  for (const [key, limit] of Object.entries({ sessionId: 128, consumerId: 256, versionToken: 256, revision: 256, cursor: 1024, key: 2048, bucket: 64 })) {
    const value = input[key];
    if (typeof value === "string" && (value.length === 0 || value.length > limit)) return reason;
  }
  return null;
};
const optionalShape = (fields: Fields, reason: string): IpcGuard => (input) => input === undefined ? null : check(input, fields, reason);

// 字段谓词
const oneOf = (values: readonly string[]) => (value: unknown): boolean => typeof value === "string" && values.includes(value);
const optional = (ok: (value: unknown) => boolean) => (value: unknown): boolean => value === undefined || value === null || ok(value);
const integer = (min: number) => (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) >= min;
const nested = (fields: Fields) => (value: unknown): boolean => matches(value, fields);
const listOf = (ok: (value: unknown) => boolean) => (value: unknown): boolean => Array.isArray(value) && value.every(ok);
const nullable = (ok: (value: unknown) => boolean) => (value: unknown): boolean => value === null || ok(value);
/** `${providerId}:${apiModel}`；具体 provider 由 ModelConnectionsService 解析。 */
const modelKey = (value: unknown): boolean => typeof value === "string" && value.includes(":") && value.length <= 300;

/** 无入参通道：renderer 不该夹带任何 payload。 */
export const NO_INPUT: IpcGuard = input => input === undefined ? null : "Unexpected input";

const connectionId: IpcGuard = (input) => typeof input === "string" ? null : "Invalid connection id";
const artifactRef = shape({ hostId: "string", sessionId: "string", artifactId: "string" }, "Invalid artifact reference");
const sessionRef = shape({ sessionId: "string" }, "Invalid session reference");
const projectionInput = shape({ sessionId: "string", beforeSeq: optional(integer(0)), afterSeq: optional(integer(0)), includeToolDetails: "boolean?", maxWindowEvents: optional(integer(1)), maxWindowBytes: optional(integer(1)) }, "Invalid session projection query");
const backgroundTask = shape({ sessionId: "string", taskId: "string" }, "Invalid background task");
const subagentRef = shape({ sessionId: "string", agentId: "string" }, "Invalid subagent reference");
const workspaceRootOnly = optionalShape({ workspaceRoot: "string?" }, "Invalid workspace");
const gitMutation = (fields: Fields) => shape({ workspaceRoot: "string?", ...fields }, "Invalid workspace Git operation");
const reviewWorkspace: Fields = { workspaceId: "string?", workspaceRoot: "string?", sessionId: "string?" };
const reviewSnapshotRef: Fields = { ...reviewWorkspace, snapshotId: "string", expectedGeneration: integer(0) };
const reviewSelection = nested({ kind: oneOf(["uncommitted", "unstaged", "staged", "commit", "branch"]), sha: "string?", branch: "string?" });
const connectionIdInput = shape({ connectionId: "string" }, "Invalid model connection");
const connectionDraft: Fields = { templateId: "string", apiKey: "string", label: "string?", protocol: optional(oneOf(["openai-completions", "openai-responses", "anthropic-messages"])), baseUrl: "string?", proxy: "record?" };
const connectionModels = listOf(nested({ apiModel: "string", providerFacts: "record?", overrides: "record?" }));
const SECRET_PROVIDER_IDS: readonly string[] = [...PROVIDER_IDS, ...SEARCH_PROVIDER_IDS, "image-generation", "speech-minimax"];
const providerInput = shape({ provider: oneOf(SECRET_PROVIDER_IDS) }, "Invalid provider");
/** 握手和配对只能由 main 自己发起，renderer 不能通过 `hosts.call` 调用。 */
const MAIN_ONLY_HOST_METHODS: readonly string[] = ["host.hello", "auth.pair", "auth.resume"];

const usageRequestId: IpcGuard = input => !isRecord(input) || typeof input.requestId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId) ? "Invalid Usage request id" : null;
const usageInput: IpcGuard = input => {
  if (!isRecord(input)) return "Invalid Usage query";
  if (input.requestId !== undefined && usageRequestId(input)) return "Invalid Usage request id";
  for (const [field, values] of Object.entries({ range: ["day","week","month","total"], scope: ["global","session"], kind: ["llm_request"], status: ["all","success","error","aborted","running","unknown"] })) if (input[field] !== undefined && (typeof input[field] !== "string" || !values.includes(input[field] as string))) return `Invalid Usage ${field}`;
  if (input.sessionId !== undefined && (typeof input.sessionId !== "string" || input.sessionId.length > 128)) return "Invalid Usage Session";
  if (input.search !== undefined && (typeof input.search !== "string" || input.search.length > 300)) return "Usage search exceeds 300 characters";
  for (const field of ["model", "providerId"]) if (input[field] !== undefined && (typeof input[field] !== "string" || (input[field] as string).length > 300)) return `Invalid Usage ${field}`;
  if (input.workspaceRoot !== undefined && (typeof input.workspaceRoot !== "string" || input.workspaceRoot.length > 4096)) return "Invalid Usage workspaceRoot";
  if (input.utcOffsetMinutes !== undefined && (typeof input.utcOffsetMinutes !== "number" || !Number.isInteger(input.utcOffsetMinutes) || Math.abs(input.utcOffsetMinutes) > 14 * 60)) return "Invalid Usage utcOffsetMinutes";
  if (input.requestRowsPage !== undefined) {
    if (!isRecord(input.requestRowsPage)) return "Invalid Usage page";
    const page = input.requestRowsPage;
    for (const field of ["limit","page"]) if (page[field] !== undefined && (typeof page[field] !== "number" || !Number.isSafeInteger(page[field]) || Number(page[field]) < 1)) return "Invalid Usage page number";
    if (page.cursor !== undefined && (typeof page.cursor !== "string" || page.cursor.length > 2048)) return "Invalid Usage cursor";
  }
  return null;
};
const HARNESS_STATS_KINDS: readonly string[] = HARNESS_STATS_QUERY_KINDS;
const harnessStatsInput: IpcGuard = input => {
  if (!isRecord(input) || usageRequestId(input)) return "Invalid Harness stats request id";
  if (typeof input.kind !== "string" || !HARNESS_STATS_KINDS.includes(input.kind)) return "Invalid Harness stats kind";
  const filter = input.filter;
  if (!isRecord(filter)) return "Invalid Harness stats filter";
  if (typeof filter.range !== "string" || !["day", "week", "month", "total"].includes(filter.range)) return "Invalid Harness stats range";
  if (typeof filter.sessionKind !== "string" || !["main", "child", "side", "all"].includes(filter.sessionKind)) return "Invalid Harness stats session kind";
  for (const field of ["mode", "model", "revision"]) if (filter[field] !== undefined && filter[field] !== null && (typeof filter[field] !== "string" || (filter[field] as string).length > 1024)) return `Invalid Harness stats ${field}`;
  if (input.compare !== undefined && input.compare !== null) {
    const compare = input.compare;
    if (!isRecord(compare) || typeof compare.from !== "string" || typeof compare.to !== "string" || compare.from.length > 256 || compare.to.length > 256) return "Invalid Harness stats compare";
  }
  return null;
};

const taskCommand: IpcGuard = input => {
  if (!matches(input, { sessionId: "string", op: oneOf(["snapshot", "configure", "designate", "cancel", "move", "resume", "stop"]) })) return "Invalid task command";
  const command = input as Record<string, unknown>;
  const byOp: Record<string, Fields> = {
    snapshot: {},
    configure: { configuration: nested({ durationMs: optional(integer(0)), deadline: optional(integer(0)), model: "string?", thinkingEnabled: "boolean?", reasoningEffort: optional(oneOf(MODEL_REASONING_EFFORTS)), selectedSkillIds: "string[]?" }) },
    designate: { taskId: "string", runId: nullable(value => typeof value === "string"), revision: integer(0) },
    cancel: { taskId: "string", revision: integer(0) },
    move: { taskId: "string", beforeTaskId: "string", revision: integer(0) },
    resume: { revision: integer(0) },
    stop: { runId: "string" },
  };
  return check(command, byOp[command.op as string], `Invalid task command (${command.op as string})`);
};

const GUARDS: ReadonlyArray<readonly [InvokeSpec<unknown, unknown>, IpcGuard]> = [
  // 无入参
  [contract.app.getBootstrapState, NO_INPUT],
  [contract.resourceMonitor.copySnapshot, NO_INPUT],
  [contract.dialogs.selectImages, NO_INPUT],
  [contract.workspaces.list, NO_INPUT],
  [contract.workspaces.listOpenTools, NO_INPUT],
  [contract.harnessStats.getStatus, NO_INPUT],
  [contract.settings.get, NO_INPUT],
  [contract.settings.getV4, NO_INPUT],
  [contract.settings.readSystemPrompt, NO_INPUT],
  [contract.settings.getSearchUsage, NO_INPUT],
  [contract.quickOpen.consume, NO_INPUT],
  [contract.quickOpen.getShortcutStatus, NO_INPUT],
  [contract.modelConnections.list, NO_INPUT],
  [contract.englishLearning.getState, NO_INPUT],
  [contract.englishLearning.stopSpeech, NO_INPUT],
  [contract.englishLearning.previewSpeech, NO_INPUT],
  [contract.browserBridge.getStatus, NO_INPUT],
  [contract.browserBridge.connect, NO_INPUT],
  [contract.browserBridge.prepareUpdate, NO_INPUT],
  [contract.browserBridge.disconnect, NO_INPUT],
  [contract.browserBridge.openExtensions, NO_INPUT],
  [contract.browserBridge.revealExtensionDirectory, NO_INPUT],
  [contract.browserBridge.installNativeHost, NO_INPUT],
  [contract.plugins.list, NO_INPUT],
  [contract.pythonRuntime.getStatus, NO_INPUT],
  [contract.pythonRuntime.installExtension, NO_INPUT],
  [contract.skills.install, NO_INPUT],
  [contract.updates.getState, NO_INPUT],
  [contract.updates.selectSource, NO_INPUT],
  [contract.updates.start, NO_INPUT],
  [contract.hosts.list, NO_INPUT],
  // 资源监控
  [contract.resourceMonitor.watch, input => typeof input === "boolean" ? null : "Invalid monitoring state"],
  // 任务与审批
  [contract.tasks.command, taskCommand],
  [contract.tasks.submit, shape({ sessionId: "string", submissionId: "string", userInput: "string", attachments: "array?", fileReferences: "array?", responseAnnotations: "array?", rewind: optional(nested({ runId: "string", expectedThroughSeq: integer(0) })), agentRunId: "string?" }, "Invalid task submission")],
  [contract.tasks.abort, shape({ sessionId: "string", agentRunId: "string" }, "Invalid agent run")],
  [contract.tasks.listBackground, sessionRef],
  [contract.tasks.readBackgroundOutput, backgroundTask],
  [contract.tasks.stopBackground, backgroundTask],
  [contract.approvals.submit, input => {
    if (check(input, { requestId: "string", hostId: "string?", decision: oneOf(["once", "deny", "session"]) }, "Invalid approval decision")) return "Invalid approval decision";
    const value = input as Record<string, unknown>;
    return value.decision !== "session" || typeof value.suggestionId === "string" ? null : "Invalid approval suggestion";
  }],
  [contract.approvals.listPending, optionalShape({ sessionId: "string?" }, "Invalid approval query")],
  // 会话
  [contract.sessions.listPage, input => {
    if (input === undefined) return null;
    if (check(input, { hostId: "string?", workspaceRoot: "string?", pinned: "boolean?", after: "string?", search: "string?" }, "Invalid Session query")) return "Invalid Session query";
    const value = input as Record<string, unknown>;
    if (typeof value.search === "string" && value.search.length > 300) return "Session search exceeds 300 characters";
    if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 500)) return "Invalid Session limit";
    return null;
  }],
  [contract.sessions.list, optionalShape({ archived: "boolean?" }, "Invalid Session query")],
  [contract.sessions.get, sessionRef],
  [contract.sessions.getPage, projectionInput],
  [contract.sessions.getProjectionSnapshot, projectionInput],
  [contract.sessions.getObservation, projectionInput],
  [contract.sessions.getToolDetail, shape({ sessionId: "string", callId: "string" }, "Invalid tool detail reference")],
  [contract.sessions.getPreview, sessionRef],
  [contract.sessions.getSubagents, sessionRef],
  [contract.sessions.getSubAgentTranscript, shape({ transcriptRef: nested({ kind: oneOf(["subagent_transcript"]), sessionId: "string", agentRunId: "string", runId: "string", path: "string?" }) }, "Invalid subagent transcript reference")],
  [contract.sessions.liveOutput, sessionRef],
  [contract.sessions.interruptSubagent, subagentRef],
  [contract.sessions.revealSubagentRecord, subagentRef],
  [contract.sessions.create, (input) => {
    const invalid = optionalShape({ hostId: "string?", workspaceId: "string?", workspaceRoot: "string?", title: "string?", branch: "string?" }, "Invalid session creation")(input);
    if (invalid || input === undefined) return invalid;
    const value = input as Record<string, unknown>;
    if (value.runLocation !== undefined && value.runLocation !== "this_mac" && value.runLocation !== "worktree") return "Invalid run location";
    if (value.agentForm !== undefined && value.agentForm !== "agent" && value.agentForm !== "chat") return "Invalid agent form";
    if (value.hostId && value.runLocation === "worktree") return "Remote worktree creation is not supported";
    return null;
  }],
  [contract.sessions.fork, shape({ sessionId: "string", turnId: "string?" }, "Invalid session fork")],
  [contract.sessions.openSideChat, shape({ parentSessionId: "string" }, "Invalid side chat parent")],
  [contract.sessions.listSideChats, shape({ parentSessionId: "string" }, "Invalid side chat parent")],
  [contract.sessions.pin, shape({ sessionId: "string", pinned: "boolean" }, "Invalid session pin")],
  [contract.sessions.rename, shape({ sessionId: "string", title: "string" }, "Invalid session title")],
  [contract.sessions.setWorkspace, shape({ sessionId: "string", workspaceId: "string?", workspaceRoot: "string?" }, "Invalid session workspace")],
  [contract.sessions.setPermissionMode, shape({ sessionId: "string", mode: oneOf(["default", "full-access", "auto-review"]) }, "Invalid permission mode")],
  [contract.sessions.setAgentMode, shape({ sessionId: "string", mode: oneOf(["chat", "plan", "agent"]), expectedRevision: optional(integer(0)) }, "Invalid agent mode")],
  [contract.sessions.archive, shape({ sessionId: "string", archived: "boolean" }, "Invalid session archive")],
  [contract.sessions.archiveMany, shape({ sessionIds: "string[]" }, "Invalid session archive")],
  [contract.sessions.describeContextPanel, contextShape({ sessionId: "string", versionToken: "string?", consumerId: "string?", release: "boolean?", retry: "boolean?" }, "Invalid Context panel query")],
  [contract.sessions.listContextPaths, input => {
    const invalid = contextShape({ sessionId: "string", revision: "string", visibility: "string", cursor: "string?", limit: "number?" }, "Invalid Context paths query")(input);
    if (invalid) return invalid;
    const value = input as { visibility: string; limit?: number };
    return (value.visibility === "active" || value.visibility === "sleeping") && (value.limit === undefined || (Number.isSafeInteger(value.limit) && value.limit > 0)) ? null : "Invalid Context paths query";
  }],
  [contract.sessions.listContextEntries, contextShape({ sessionId: "string", revision: "string", cursor: "string?", bucket: "string?", limit: "number?" }, "Invalid Context entries query")],
  [contract.sessions.readContextEntry, contextShape({ sessionId: "string", revision: "string", key: "string", offset: "number?" }, "Invalid Context entry query")],
  [contract.sessions.readArtifact, shape({ sessionId: "string", artifactPath: "string" }, "Invalid session artifact")],
  // 用量与 Harness 统计
  [contract.usage.getActivity, usageInput],
  [contract.usage.getStatus, usageRequestId],
  [contract.usage.cancel, usageRequestId],
  [contract.harnessStats.query, harnessStatsInput],
  [contract.harnessStats.cancel, usageRequestId],
  // 对话框
  [contract.dialogs.selectFiles, optionalShape({ remote: "boolean?" }, "Invalid file selection request")],
  [contract.dialogs.selectWorkspaceDirectory, optionalShape({ registerWorkspace: "boolean?" }, "Invalid directory request")],
  [contract.dialogs.importComposerImage, shape({ name: "string", mimeType: "string?", bytes: value => value instanceof Uint8Array }, "Invalid composer image")],
  [contract.dialogs.showArtifactContextMenu, input => {
    if (!matches(input, { kind: oneOf(["session_image", "workspace_file"]) })) return "Invalid artifact context menu target";
    const value = input as Record<string, unknown>;
    return check(value, value.kind === "session_image" ? { sessionId: "string", artifactPath: "string" } : { workspaceRoot: "string?", relativePath: "string" }, "Invalid artifact context menu target");
  }],
  // 工作区文件读取
  [contract.workspaces.readFile, shape({ workspaceRoot: "string?", relativePath: "string" }, "Invalid workspace file")],
  [contract.workspaces.statFile, shape({ workspaceRoot: "string?", relativePath: "string" }, "Invalid workspace file")],
  [contract.workspaces.listFileApplications, shape({ workspaceRoot: "string?", relativePath: "string" }, "Invalid workspace file")],
  [contract.workspaces.openFile, input => {
    if (check(input, { workspaceRoot: "string?", relativePath: "string", applicationId: "string?" }, "Invalid workspace file")) return "Invalid workspace file";
    const action = (input as Record<string, unknown>).action;
    return action === "open" || action === "reveal" ? null : "Invalid workspace file action";
  }],
  [contract.workspaces.listMarkdownFiles, shape({ workspaceRoot: "string", expanded: "boolean?" }, "Invalid workspace")],
  [contract.workspaces.writeMarkdownFile, shape({ workspaceRoot: "string", relativePath: "string", content: "string" }, "Invalid workspace Markdown file")],
  // 工作区路径与 Git
  [contract.workspaces.createFolder, shape({ parentRoot: "string", name: "string" }, "Invalid workspace folder")],
  [contract.workspaces.openInIde, shape({ workspaceId: "string" }, "Invalid workspace")],
  [contract.workspaces.setVisibility, shape({ workspaceId: "string", hidden: "boolean" }, "Invalid workspace visibility")],
  [contract.workspaces.getGitContext, workspaceRootOnly],
  [contract.workspaces.getEnvironment, workspaceRootOnly],
  [contract.workspaces.createBranch, gitMutation({ branchName: "string" })],
  [contract.workspaces.switchBranch, gitMutation({ branchName: "string" })],
  [contract.workspaces.commit, gitMutation({ message: "string?", includeUnstagedChanges: "boolean?", branchName: "string?" })],
  [contract.workspaces.push, gitMutation({ remote: "string?" })],
  [contract.workspaces.commitAndPush, gitMutation({ message: "string?", includeUnstagedChanges: "boolean?", branchName: "string?", remote: "string?" })],
  [contract.workspaces.openInTool, shape({ workspaceRoot: "string?", toolId: oneOf(["vscode", "cursor", "finder", "terminal", "iterm2"]), relativePath: "string?" }, "Invalid workspace open request")],
  // Review
  [contract.review.getSnapshot, shape({ ...reviewWorkspace, selection: reviewSelection, options: "record?" }, "Invalid review query")],
  [contract.review.refreshSnapshot, shape({ ...reviewWorkspace, selection: reviewSelection, options: "record?" }, "Invalid review query")],
  [contract.review.getFileDiffs, shape({ ...reviewSnapshotRef, requests: listOf(nested({ fileId: "string", contextLines: optional(integer(0)) })) }, "Invalid review diff query")],
  [contract.review.getFileContents, shape({ ...reviewSnapshotRef, fileIds: "string[]" }, "Invalid review contents query")],
  [contract.review.listBranches, shape(reviewWorkspace, "Invalid review workspace")],
  [contract.review.listCommits, shape(reviewWorkspace, "Invalid review workspace")],
  // 设置写入
  [contract.settings.update, shape({}, "Invalid settings update")],
  [contract.settings.updateV4, shape({ expectedRevision: "string", namespace: "string", patch: "record" }, "Invalid settings update")],
  [contract.settings.writeSystemPrompt, shape({ content: "string" }, "Invalid system prompt")],
  [contract.settings.updateImageGeneration, shape({ apiKey: "string?", baseUrl: "string", model: "string" }, "Invalid image generation settings")],
  [contract.quickOpen.updateShortcut, input => {
    // handler 会把整个 input spread 进持久化设置，所以这里拒绝未知键。
    if (check(input, { enabled: "boolean?", accelerator: "string?", target: optional(nested({ kind: oneOf(["automatic", "workspace", "session"]), workspaceId: "string?", sessionId: "string?" })) }, "Invalid shortcut update")) return "Invalid shortcut update";
    return Object.keys(input as Record<string, unknown>).every(key => key === "enabled" || key === "accelerator" || key === "target") ? null : "Invalid shortcut update";
  }],
  [contract.providers.setKey, shape({ provider: oneOf(SECRET_PROVIDER_IDS), apiKey: "string" }, "Invalid provider key")],
  [contract.providers.clearKey, providerInput],
  [contract.models.listUsable, shape({ purpose: oneOf(["chat", "utility", "vision"]) }, "Invalid model purpose")],
  // 模型连接（业务规则在 ModelConnectionsService）
  [contract.modelConnections.probe, input => {
    if (!matches(input, { kind: oneOf(["draft", "saved"]) })) return "Invalid connection probe";
    const value = input as Record<string, unknown>;
    return check(value, value.kind === "draft" ? { draft: nested(connectionDraft) } : { connectionId: "string" }, "Invalid connection probe");
  }],
  [contract.modelConnections.create, shape({ ...connectionDraft, multiplier: "number?", resolvedAuth: optional(oneOf(["x-api-key", "bearer"])), models: connectionModels }, "Invalid model connection")],
  [contract.modelConnections.update, shape({ connectionId: "string", label: "string?", protocol: optional(oneOf(["openai-completions", "openai-responses", "anthropic-messages"])), baseUrl: "string?", apiKey: "string?", proxy: "record?", multiplier: "number?", enabled: "boolean?", managementKey: "string?" }, "Invalid model connection")],
  [contract.modelConnections.remove, connectionIdInput],
  [contract.modelConnections.addModels, shape({ connectionId: "string", models: connectionModels }, "Invalid connection models")],
  [contract.modelConnections.updateModel, shape({ key: modelKey, overrides: nullable(isRecord) }, "Invalid model patch")],
  [contract.modelConnections.removeModel, shape({ key: modelKey }, "Invalid model key")],
  [contract.modelConnections.preview, shape({ apiModel: "string", connectionId: "string?", templateId: "string?", protocol: optional(oneOf(["openai-completions", "openai-responses", "anthropic-messages"])), multiplier: "number?", overrides: "record?" }, "Invalid model preview")],
  [contract.modelConnections.updatePurposes, input => {
    if (!isRecord(input)) return "Invalid model purposes";
    const binding = nested({ model: nullable(modelKey), thinking: nullable(oneOf(THINKING_LEVELS)) });
    return Object.entries(input).every(([purpose, value]) => (PURPOSE_IDS as readonly string[]).includes(purpose) && binding(value)) ? null : "Invalid model purposes";
  }],
  [contract.modelConnections.getBalance, connectionIdInput],
  // 插件
  [contract.englishLearning.setTarget, shape({ enabled: "boolean", sessionId: nullable(value => typeof value === "string") }, "Invalid English learning target")],
  [contract.browserBridge.selectSourceExtension, NO_INPUT],
  [contract.browserBridge.switchToBundledExtension, NO_INPUT],
  [contract.browserBridge.selectInstance, input => typeof input === "string" ? null : "Invalid browser instance"],
  [contract.browserBridge.installFromRepo, NO_INPUT],
  [contract.skills.list, workspaceRootOnly],
  [contract.skills.uninstall, shape({ directory: "string" }, "Invalid skill directory")],
  // Host 配对与调用
  [contract.hosts.add, shape({ name: "string", code: "string", endpoint: "record" }, "Invalid Host connection")],
  [contract.hosts.remove, connectionId],
  [contract.hosts.reconnect, connectionId],
  [contract.hosts.activate, (input) => input === null || typeof input === "string" ? null : "Invalid Session identity"],
  [contract.hosts.preview, artifactRef],
  [contract.hosts.download, artifactRef],
  [contract.hosts.call, (input) => {
    const invalid = check(input, { hostId: "string", method: "string", params: "record" }, "Invalid Host operation");
    if (invalid) return invalid;
    const method = (input as { method: string }).method;
    return (HOST_METHODS as readonly string[]).includes(method) && !MAIN_ONLY_HOST_METHODS.includes(method) ? null : "Invalid Host operation";
  }],
];

/** channel → guard。注册器按 channel 自动套用，迁移到哪个文件注册都不会漏。 */
export const IPC_INPUT_GUARDS: ReadonlyMap<string, IpcGuard> = new Map(
  GUARDS.map(([spec, guard]) => [spec.channel, guard]),
);
