import { isAbsolute, relative, resolve } from "pathe";
import { relativePathInside, subagentActivationStatusLabel, type PathRules, type ToolUiPreview } from "@actspace/shared";
import type { RuntimeJsonValue, RuntimeToolView, SubagentKind, SubagentView } from "@actspace/shared/runtime-v2";
type EventRecord = Readonly<Record<string, RuntimeJsonValue>>;
type FileChangeStats = { readonly additions: number; readonly deletions: number };
/** 界面里不能用 `node:path`。pathe 两种分隔符都认，输出统一成 `/`，Windows 的路径也能比。 */
const PATH_RULES: PathRules = { relative, isAbsolute, sep: "/" };

export function toolPreview(toolName: string, tool: RuntimeToolView | undefined, data: EventRecord, call: EventRecord | undefined, child: { childSessionId: string; presetId: string; status: string; model?: string; subagent?: SubagentView } | undefined, sessionId: string, agentRunId: string, phase: "streaming" | "prepared" | "running" | "finished" = "finished", workspaceRoot?: string, fileChangeStats?: FileChangeStats, background?: { readonly status: string }, describeAgent?: (agentId: string) => string | undefined): ToolUiPreview {
  data = { ...(tool?.approvalMode ? { approvalMode: tool.approvalMode } : {}), ...(tool?.approvalReason ? { approvalReason: tool.approvalReason } : {}), ...data };
  const localName = toolName;
  const args = record(call?.args);
  const displayPath = (value: string) => workspaceDisplayPath(value, workspaceRoot);
  const terminal = phase === "finished";
  const state = string(data.status) ?? tool?.state;
  const failure = record(data.failure);
  const errorMessage = string(failure.message) ?? tool?.failure?.message;
  const summary = tool?.summary ?? string(data.summary) ?? (terminal ? "Tool completed" : phase === "streaming" ? "Preparing tool arguments" : phase === "prepared" ? "Preparing tool" : "Running");
  const fileStatus = !terminal ? "running" as const : state === "denied" ? "denied" as const : state && state !== "completed" ? "failed" as const : "completed" as const;
  const output = modelOutputText(data.modelOutput) || toolModelOutputText(tool);
  const failed = terminal && state !== undefined && state !== "completed";
  const resultPreview = terminal && !failed ? outputPreview(output) : undefined;
  if (localName === "read_file") return { kind: "read", filePath: displayPath(string(args.path) ?? ""), ...(typeof args.offset === "number" || typeof args.limit === "number" ? { range: `${nonNegative(args.offset) || 1}-${(nonNegative(args.offset) || 1) + Math.max(0, nonNegative(args.limit) - 1)}` } : {}), displayText: summary, resultPreview };
  if (localName === "list_directory") {
    // 给模型的列表可能被截断，真实条目数在 detail 里；旧会话没有这一项，才从文本里数。
    const counted = record(detailValue(data, "result")).entryCount;
    return { kind: "directory_list", path: displayPath(string(args.path) ?? "."), entryCount: terminal && !failed ? typeof counted === "number" ? nonNegative(counted) : directoryEntryCount(output) : undefined, displayText: summary, resultPreview };
  }
  if (localName === "grep") return { kind: "grep", pattern: string(args.pattern) ?? "", scope: displayPath(string(args.path) ?? "."), resultCount: resultCount(summary), displayText: summary, resultPreview };
  if (localName === "glob") return { kind: "glob", pattern: string(args.pattern) ?? "", scope: displayPath(string(args.path) ?? "."), resultCount: resultCount(summary), displayText: summary, resultPreview };
  if (localName === "web" || localName === "web_search" || localName === "web_fetch") { const open = localName === "web_fetch" || string(args.action) === "open"; return { kind: "web_search", mode: open ? "url" : "query", ...(open ? { url: string(args.url) ?? "" } : { query: string(args.query) ?? "" }), displayText: summary, contentPreview: output.slice(0, 2_000) }; }
  if (localName === "write_file" || localName === "edit_file") {
    const result = record(detailValue(data, "result"));
    const filePath = displayPath(string(result.path) ?? string(args.path) ?? "");
    const additions = terminal ? nonNegative(result.additions) : fileChangeStats?.additions ?? 0;
    const deletions = terminal ? nonNegative(result.deletions) : fileChangeStats?.deletions ?? 0;
    const outputMetadata = terminal && !failed ? workspaceOutputMetadata(string(result.path) ?? string(args.path) ?? "", workspaceRoot) : {};
    const common = { filePath, additions, deletions, diff: terminal && !failed ? output.split("\n\nFile ", 1)[0] ?? "" : "", collapsedLines: 0, status: fileStatus, ...outputMetadata, ...(errorMessage ? { errorMessage } : {}) };
    return localName === "write_file" ? { kind: "write", ...common } : { kind: "edit_diff", ...common };
  }
  if (localName === "present") {
    const declared = terminal && !failed ? record(detailValue(data, "present")).files : undefined;
    const source = Array.isArray(declared) ? declared : Array.isArray(args.files) ? args.files : [];
    const files = source.map(record).flatMap((file) => {
      const path = string(file.path);
      if (!path) return [];
      const description = string(file.description);
      return [{ path: displayPath(path), ...(terminal && !failed ? workspaceOutputMetadata(path, workspaceRoot) : {}), ...(description ? { description } : {}) }];
    });
    return { kind: "present", files, displayText: summary, status: fileStatus };
  }
  if (localName === "delete_file") return { kind: "delete", filePath: displayPath(string(record(detailValue(data, "result")).path) ?? string(args.path) ?? ""), displayText: summary, status: fileStatus };
  // bash_output / bash_kill only exist in history; task_* tools render as generic rows.
  if (localName === "bash" || localName === "bash_output" || localName === "bash_kill") {
    // Summary is diagnostic detail, never the title of a compact tool row.
    // Missing environment/exit facts stay unknown; do not parse them from prose.
    const backgroundTask = record(detailValue(data, "background-task"));
    const backgroundTaskId = string(backgroundTask.taskId);
    const environment = record(detailValue(data, "environment"));
    const sandboxed = typeof environment.sandboxed === "boolean" ? environment.sandboxed : undefined;
    const approval = data.approvalMode === "auto" ? "自动审批" : data.approvalMode === "manual" ? "人工审批" : data.approvalMode === "session" ? "会话授权" : undefined;
    const approvalDetail = approval ? `${approval}${typeof data.approvalReason === "string" && data.approvalReason ? `：${data.approvalReason}` : ""}` : undefined;
    const detail = terminal ? [approvalDetail, summary, errorMessage].filter((value, index, all) => value && all.indexOf(value) === index && !output.includes(value)).join("\n") : undefined;
    // A background command's card follows the task, not the tool call that started it; without a settle fact it is still running.
    const status = !terminal ? "running" as const : state === "denied" ? "denied" as const : state === "aborted" ? "cancelled" as const : failed ? "failed" as const : backgroundTaskId ? bashBackgroundStatus(background?.status ?? "running") : "success" as const;
    return { kind: "bash", ...(backgroundTaskId ? { backgroundTaskId, background: true } : {}), status, title: "Bash command", command: string(args.command) ?? "", commandPreview: string(args.command) ?? "", cwd: string(args.cwd) ?? undefined, stdout: failed ? undefined : output, stderr: failed ? output || errorMessage : undefined, reason: detail || undefined, durationMs: tool?.durationMs ?? undefined, intent: string(args.intent) ?? undefined, justification: string(args.justification) ?? undefined, ...(sandboxed === undefined ? {} : { sandboxed }) };
  }
  if (localName === "inspect_image") return { kind: "media_analysis", mediaName: string(args.artifact_id) ?? "image", mediaKind: "image", displayText: summary };
  if (localName === "generate_image") { const images = tool?.artifacts.filter((artifact) => artifact.kind === "image").map((artifact) => ({ type: "image" as const, name: artifact.label, path: artifact.artifactId, mimeType: artifact.mimeType })) ?? (Array.isArray(data.artifacts) ? data.artifacts.map(record).filter((artifact) => string(artifact.mediaType)?.startsWith("image/")).map((artifact) => ({ type: "image" as const, name: string(artifact.artifactId) ?? "image", path: string(artifact.artifactId) ?? "", mimeType: string(artifact.mediaType) ?? undefined })) : []); return { kind: "image_generation", status: !terminal ? "running" : failed ? "failed" : images.length > 0 ? "completed" : "partial", promptPreview: string(args.prompt)?.slice(0, 240) ?? "", requestedCount: Math.max(1, nonNegative(args.n) || 1), generatedCount: images.length, size: string(args.size) ?? "1024x1024", displayText: summary, images, ...(errorMessage ? { errorMessage } : {}) }; }
  if (["todo_read", "todo_write", "actspace.todo/todo_read", "actspace.todo/todo_write"].includes(toolName)) { const value = detailValue(data, "todo"); const todo = record(value); const todos = Array.isArray(todo.todos) ? todo.todos.map((entry) => { const item = record(entry); const status: "pending" | "in_progress" | "completed" = item.status === "in_progress" || item.status === "completed" ? item.status : "pending"; return { id: string(item.id) ?? "todo", content: string(item.content) ?? "", status, ...(typeof item.activeForm === "string" ? { activeForm: item.activeForm } : {}), createdAt: string(item.createdAt) ?? tool?.startedAt ?? new Date(0).toISOString(), updatedAt: string(item.updatedAt) ?? tool?.finishedAt ?? tool?.startedAt ?? new Date(0).toISOString() }; }) : []; return { kind: "todo", todos, totalCount: todos.length, completedCount: todos.filter((item) => item.status === "completed").length, revision: nonNegative(todo.revision), displayText: `${todos.filter((item) => item.status === "completed").length}/${todos.length} completed` }; }
  const spawnKind = SUBAGENT_SPAWN_TOOLS[toolName];
  if (spawnKind && child?.subagent) return subagentPreview(child.subagent, child, sessionId, agentRunId, { summary, output, errorMessage, durationMs: tool?.durationMs ?? 0 });
  // Before `subagent/spawned` (arguments still streaming, or the CLI could not start): a card from the arguments alone.
  if (spawnKind && toolName !== "agent") return { kind: "agent", description: string(args.description) ?? firstLine(string(args.prompt)) ?? toolName, status: !terminal ? "running" : failed ? "failed" : "completed", subagentType: "explore", subagentKind: spawnKind, ...(args.background !== false ? { background: true } : {}), displayText: summary, summary: output, stats: { durationMs: tool?.durationMs ?? 0, toolCallCount: 0 }, display: "panel", ...(errorMessage ? { error: errorMessage } : failed && output ? { error: output } : {}) };
  // Old Sessions: `agent` / `explore` with `delegation/*` facts.
  if (["agent", "explore", "actspace.subagent/agent", "actspace.subagent/explore"].includes(toolName)) { const detail = record(detailValue(data, "delegation")); const childSessionId = string(detail.childSessionId) ?? child?.childSessionId ?? ""; const presetId = string(detail.presetId) ?? child?.presetId ?? (toolName.endsWith("explore") ? "actspace.explore" : "actspace.agent"); const isBackground = detail.background === true; const status = isBackground && terminal && !failed ? agentBackgroundStatus(child?.status) : string(detail.status) === "aborted" || child?.status === "aborted" || state === "aborted" ? "aborted" : child?.status === "failed" || failed ? "failed" : !terminal ? "running" : "completed"; return { kind: "agent", description: string(args.description) ?? string(args.task) ?? (toolName.endsWith("explore") ? "Explore" : "Agent"), status, subagentType: "explore", ...(isBackground ? { background: true } : {}), agentKind: presetId === "actspace.explore" || toolName.endsWith("explore") ? "explore" : "agent", ...(child?.model ? { model: child.model } : {}), displayText: summary, summary: output, ...(childSessionId ? { transcriptRef: { kind: "subagent_transcript", sessionId, agentRunId, runId: childSessionId } } : {}), stats: { durationMs: tool?.durationMs ?? 0, toolCallCount: 0 }, display: "panel", ...(errorMessage ? { error: errorMessage } : {}) }; }
  const artifacts = tool?.artifacts.filter((artifact) => artifact.kind === "image").map((artifact) => ({ type: "image" as const, name: localName.startsWith("browser_") ? "Chrome 截图" : artifact.label, path: artifact.artifactId, mimeType: artifact.mimeType })) ?? [];
  const subagentTitle = subagentToolTitle(toolName, args, describeAgent);
  const linkedAgent = toolName === "send_message" || toolName === "interrupt_agent" ? string(args.agent_id) : stoppedAgent(toolName, args, describeAgent);
  const subagentLink = linkedAgent ? { agentId: linkedAgent, verb: toolName === "send_message" ? "发消息给" : "停止", target: describeAgent?.(linkedAgent) ?? linkedAgent } : undefined;
  // 查看类子智能体工具只显示标题：工具结果（模型清单原文；老会话的「wait_agent completed」「Input arrived.」）是给模型看的，失败时才带错误。
  const titleOnly = SUBAGENT_TITLE_ONLY_TOOLS.has(toolName);
  const content = titleOnly ? errorMessage ?? "" : [toolName === "send_message" ? string(args.message) : undefined, summary, output, errorMessage].filter(Boolean).join("\n\n");
  return { kind: "generic", title: subagentTitle ?? toolName, content, ...(artifacts.length ? { artifacts } : {}), ...(subagentLink ? { subagentLink } : {}) };
}

/** Subagent tools whose result is only for the model: the row shows just the title. `wait_agent` / `list_agents` appear only in old Sessions. */
const SUBAGENT_TITLE_ONLY_TOOLS: ReadonlySet<string> = new Set(["wait_agent", "list_agents", "list_subagent_models"]);

/** Tools that create a subagent, and the kind they create. */
const SUBAGENT_SPAWN_TOOLS: Readonly<Record<string, SubagentKind>> = Object.freeze({ agent: "local", agent_fork: "fork", agent_codex: "codex", agent_claude_code: "claude-code" });

function firstLine(value: string | null): string | null { return value?.split(/\r?\n/).find((line) => line.trim())?.trim() || null; }

/** `task_stop` on a subagent (its task id is the agent id) reads like the old stop row; on a Bash task it stays generic. */
function stoppedAgent(toolName: string, args: EventRecord, describe: ((agentId: string) => string | undefined) | undefined): string | null {
  const taskId = toolName === "task_stop" ? string(args.taskId) : null;
  return taskId && describe?.(taskId) !== undefined ? taskId : null;
}

/**
 * One-line rows for the subagent management tools (design 05 §1); `describe` turns an agent id into its description.
 * `interrupt_agent`, `wait_agent` and `list_agents` were removed; their rows stay for old Sessions.
 */
export function subagentToolTitle(toolName: string, args: EventRecord, describe: (agentId: string) => string | undefined = () => undefined): string | undefined {
  const target = () => { const agentId = string(args.agent_id) ?? ""; return describe(agentId) ?? agentId; };
  const stopped = stoppedAgent(toolName, args, describe);
  if (stopped) return `停止 ${describe(stopped)}`;
  switch (toolName) {
    case "send_message": return `发消息给 ${target()}`;
    case "interrupt_agent": return `停止 ${target()}`;
    case "wait_agent": return "等待子智能体";
    case "list_agents": return "查看子智能体";
    case "list_subagent_models": return "查看可选模型";
    default: return undefined;
  }
}

/** A subagent started by the new `agent` tool: one card for the subagent across all its activations. */
function subagentPreview(view: SubagentView, child: { readonly status: string; readonly model?: string }, sessionId: string, agentRunId: string, result: { readonly summary: string; readonly output: string; readonly errorMessage?: string; readonly durationMs: number }): ToolUiPreview {
  const status = child.status === "running" || child.status === "completed" || child.status === "failed" || child.status === "aborted" ? child.status : "failed";
  const settle = view.activations.at(-1)?.settle;
  return {
    kind: "agent", description: view.description, status, subagentType: "explore",
    subagentKind: view.kind, ...(view.preset ? { preset: view.preset } : {}), activationCount: view.activations.length, transcriptPath: view.transcriptPath,
    ...(child.model ? { model: child.model } : {}), ...(view.activations[0]?.background ? { background: true } : {}),
    // No final reply (stopped, lost, failed): how it ended in words, not the model-facing "Started …" / settle summary.
    displayText: result.summary, summary: settle ? settle.result ?? subagentActivationStatusLabel(settle.status) : result.output,
    transcriptRef: { kind: "subagent_transcript", sessionId, agentRunId, runId: view.agentId, path: view.transcriptPath },
    stats: { durationMs: result.durationMs, toolCallCount: 0 }, display: "panel",
    ...(result.errorMessage ? { error: result.errorMessage } : {}),
  };
}

function bashBackgroundStatus(status: string) { return status === "running" ? "running" as const : status === "completed" ? "success" as const : status === "failed" ? "failed" as const : "cancelled" as const; }
function agentBackgroundStatus(status: string | undefined) { return status === "completed" || status === "failed" || status === "aborted" ? status : "running" as const; }
function resultCount(summary: string): number | undefined { const match = /(?:Found|Listed)\s+(\d+)/i.exec(summary); return match ? Number(match[1]) : undefined; }
function directoryEntryCount(output: string): number | undefined {
  // filesystem-read prefixes real names with [file]/[dir]; this sentinel is not an entry.
  if (output.trim() === "(empty directory)") return 0;
  const lines = output.split("\n").filter((line) => line.trim());
  return lines.length === 0 ? undefined : lines.length;
}
function outputPreview(output: string): string[] | undefined { const lines = output.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 8).map((line) => line.length > 240 ? `${line.slice(0, 237)}…` : line); return lines.length ? lines : undefined; }

function detailValue(data: EventRecord, label: string): RuntimeJsonValue { if (!Array.isArray(data.detail)) return null; for (const entry of data.detail) { const detail = record(entry); if (detail.label === label) return detail.value ?? null; } return null; }
function modelOutputText(value: RuntimeJsonValue | undefined): string { if (!Array.isArray(value)) return ""; return value.map((entry) => { const block = record(entry); return typeof block.text === "string" ? block.text : block.value === undefined ? "" : JSON.stringify(block.value); }).filter(Boolean).join("\n"); }
function toolModelOutputText(tool: RuntimeToolView | undefined): string { return tool?.modelOutput?.map((block) => block.type === "text" ? block.text : `${block.alt} (${block.artifactId})`).join("\n") ?? ""; }
function record(value: RuntimeJsonValue | undefined): EventRecord { return isRecord(value) ? value : {}; }
function isRecord(value: RuntimeJsonValue | undefined): value is EventRecord { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
function string(value: RuntimeJsonValue | undefined): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
function nonNegative(value: RuntimeJsonValue | undefined): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0; }

export function workspaceDisplayPath(path: string, workspaceRoot?: string): string {
  if (!path || !workspaceRoot) return path;
  const absolute = resolve(workspaceRoot, path);
  const local = relativePathInside(PATH_RULES, workspaceRoot, absolute);
  return local === null ? absolute : local || ".";
}

function workspaceOutputMetadata(path: string, workspaceRoot?: string): { outputPath?: string; outputRelativePath?: string } {
  if (!path || !workspaceRoot) return {};
  const absolute = resolve(workspaceRoot, path);
  const local = relativePathInside(PATH_RULES, workspaceRoot, absolute);
  return local === null ? {} : { outputPath: absolute, outputRelativePath: local || "." };
}
