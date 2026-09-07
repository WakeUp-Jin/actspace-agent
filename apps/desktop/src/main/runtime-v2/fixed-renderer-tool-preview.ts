import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ToolUiPreview } from "@actspace/shared";
import type { RuntimeV2JsonValue, RuntimeV2ToolView } from "@actspace/shared/runtime-v2";
type EventRecord = Readonly<Record<string, RuntimeV2JsonValue>>;

export function toolPreview(toolName: string, tool: RuntimeV2ToolView | undefined, data: EventRecord, call: EventRecord | undefined, child: { childSessionId: string; presetId: string; status: string } | undefined, sessionId: string, agentRunId: string, phase: "streaming" | "prepared" | "running" | "finished" = "finished", workspaceRoot?: string): ToolUiPreview {
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
  if (localName === "read_file") return { kind: "read", filePath: displayPath(string(args.path) ?? ""), ...(typeof args.offset === "number" || typeof args.limit === "number" ? { range: `${nonNegative(args.offset) || 1}-${(nonNegative(args.offset) || 1) + Math.max(0, nonNegative(args.limit) - 1)}` } : {}), displayText: summary };
  if (localName === "list_directory") return { kind: "directory_list", path: displayPath(string(args.path) ?? "."), entryCount: countOutputLines(output), displayText: summary };
  if (localName === "grep") return { kind: "grep", pattern: string(args.pattern) ?? "", scope: displayPath(string(args.path) ?? "."), resultCount: resultCount(summary), displayText: summary };
  if (localName === "glob") return { kind: "glob", pattern: string(args.pattern) ?? "", scope: displayPath(string(args.path) ?? "."), resultCount: resultCount(summary), displayText: summary };
  if (localName === "web_search" || localName === "web_fetch") return { kind: "web_search", mode: localName === "web_fetch" ? "url" : "query", ...(localName === "web_fetch" ? { url: string(args.url) ?? "" } : { query: string(args.query) ?? "" }), displayText: summary, contentPreview: output.slice(0, 2_000) };
  if (localName === "write_file" || localName === "edit_file") {
    const result = record(detailValue(data, "result"));
    const filePath = displayPath(string(result.path) ?? string(args.path) ?? "");
    const common = { filePath, additions: nonNegative(result.additions), deletions: nonNegative(result.deletions), diff: terminal && !failed ? output.split("\n\nFile ", 1)[0] ?? "" : "", collapsedLines: 0, status: fileStatus, ...(errorMessage ? { errorMessage } : {}) };
    return localName === "write_file" ? { kind: "write", ...common } : { kind: "edit_diff", ...common };
  }
  if (localName === "delete_file") return { kind: "delete", filePath: displayPath(string(record(detailValue(data, "result")).path) ?? string(args.path) ?? ""), displayText: summary, status: fileStatus };
  if (localName === "bash" || localName === "bash_output" || localName === "bash_kill") return { kind: "bash", status: !terminal ? "running" : state === "denied" ? "denied" : state === "aborted" ? "cancelled" : failed ? "failed" : "success", title: terminal ? summary : string(args.intent) ?? "Bash command", command: string(args.command) ?? localName, commandPreview: string(args.command) ?? localName, cwd: string(args.cwd) ?? undefined, stdout: failed ? undefined : output, stderr: failed ? errorMessage ?? output : undefined, durationMs: tool?.durationMs ?? undefined, intent: string(args.intent) ?? undefined };
  if (localName === "inspect_image") return { kind: "media_analysis", mediaName: string(args.artifact_id) ?? "image", mediaKind: "image", displayText: summary };
  if (localName === "generate_image") { const images = tool?.artifacts.filter((artifact) => artifact.kind === "image").map((artifact) => ({ type: "image" as const, name: artifact.label, path: artifact.artifactId, mimeType: artifact.mimeType })) ?? (Array.isArray(data.artifacts) ? data.artifacts.map(record).filter((artifact) => string(artifact.mediaType)?.startsWith("image/")).map((artifact) => ({ type: "image" as const, name: string(artifact.artifactId) ?? "image", path: string(artifact.artifactId) ?? "", mimeType: string(artifact.mediaType) ?? undefined })) : []); return { kind: "image_generation", status: !terminal ? "running" : failed ? "failed" : images.length > 0 ? "completed" : "partial", promptPreview: string(args.prompt)?.slice(0, 240) ?? "", requestedCount: Math.max(1, nonNegative(args.n) || 1), generatedCount: images.length, size: string(args.size) ?? "1024x1024", displayText: summary, images, ...(errorMessage ? { errorMessage } : {}) }; }
  if (["todo_read", "todo_write", "actspace.todo/todo_read", "actspace.todo/todo_write"].includes(toolName)) { const value = detailValue(data, "todo"); const todo = record(value); const todos = Array.isArray(todo.todos) ? todo.todos.map((entry) => { const item = record(entry); const status: "pending" | "in_progress" | "completed" = item.status === "in_progress" || item.status === "completed" ? item.status : "pending"; return { id: string(item.id) ?? "todo", content: string(item.content) ?? "", status, ...(typeof item.activeForm === "string" ? { activeForm: item.activeForm } : {}), createdAt: string(item.createdAt) ?? tool?.startedAt ?? new Date(0).toISOString(), updatedAt: string(item.updatedAt) ?? tool?.finishedAt ?? tool?.startedAt ?? new Date(0).toISOString() }; }) : []; return { kind: "todo", todos, totalCount: todos.length, completedCount: todos.filter((item) => item.status === "completed").length, revision: nonNegative(todo.revision), displayText: `${todos.filter((item) => item.status === "completed").length}/${todos.length} completed` }; }
  if (["agent", "explore", "actspace.subagent/agent", "actspace.subagent/explore"].includes(toolName)) { const detail = record(detailValue(data, "delegation")); const childSessionId = string(detail.childSessionId) ?? child?.childSessionId ?? ""; const presetId = string(detail.presetId) ?? child?.presetId ?? (toolName.endsWith("explore") ? "actspace.explore" : "actspace.agent"); const status = child?.status === "aborted" || state === "aborted" ? "aborted" : child?.status === "failed" || failed ? "failed" : !terminal ? "running" : "completed"; return { kind: "agent", description: string(args.task) ?? (toolName.endsWith("explore") ? "Explore" : "Agent"), status, subagentType: "explore", displayText: summary, summary: output, ...(childSessionId ? { transcriptRef: { kind: "subagent_transcript", sessionId, agentRunId, runId: childSessionId } } : {}), stats: { durationMs: tool?.durationMs ?? 0, toolCallCount: 0 }, display: presetId === "actspace.explore" ? "inline" : "panel", ...(errorMessage ? { error: errorMessage } : {}) }; }
  return { kind: "generic", title: toolName, content: [summary, output, errorMessage].filter(Boolean).join("\n\n") };
}

function resultCount(summary: string): number | undefined { const match = /(?:Found|Listed)\s+(\d+)/i.exec(summary); return match ? Number(match[1]) : undefined; }
function countOutputLines(output: string): number | undefined { const lines = output.split("\n").filter((line) => line.trim()); return lines.length === 0 ? undefined : lines.length; }

function detailValue(data: EventRecord, label: string): RuntimeV2JsonValue { if (!Array.isArray(data.detail)) return null; for (const entry of data.detail) { const detail = record(entry); if (detail.label === label) return detail.value ?? null; } return null; }
function modelOutputText(value: RuntimeV2JsonValue | undefined): string { if (!Array.isArray(value)) return ""; return value.map((entry) => { const block = record(entry); return typeof block.text === "string" ? block.text : block.value === undefined ? "" : JSON.stringify(block.value); }).filter(Boolean).join("\n"); }
function toolModelOutputText(tool: RuntimeV2ToolView | undefined): string { return tool?.modelOutput?.map((block) => block.type === "text" ? block.text : `${block.alt} (${block.artifactId})`).join("\n") ?? ""; }
function record(value: RuntimeV2JsonValue | undefined): EventRecord { return isRecord(value) ? value : {}; }
function isRecord(value: RuntimeV2JsonValue | undefined): value is EventRecord { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
function string(value: RuntimeV2JsonValue | undefined): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
function nonNegative(value: RuntimeV2JsonValue | undefined): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0; }

export function workspaceDisplayPath(path: string, workspaceRoot?: string): string {
  if (!path || !workspaceRoot) return path;
  const absolute = resolve(workspaceRoot, path);
  const local = relative(workspaceRoot, absolute);
  return local === "" ? "." : local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local) ? absolute : local;
}
