import { describe, expect, it } from "vitest";
import { desktopBridgeContract as contract, type InvokeSpec } from "@actspace/shared/desktop-bridge";
import { IPC_INPUT_GUARDS } from "../ipc/guards";

type Case = { spec: InvokeSpec<unknown, unknown>; valid: unknown[]; invalid: unknown[] };

const CASES: Record<string, Case> = {
  "sessions.describeContextPanel": { spec: contract.sessions.describeContextPanel, valid: [{ sessionId: "s" }, { sessionId: "s", consumerId: "c", release: true }], invalid: [null, { sessionId: 2 }, { sessionId: "s", retry: "yes" }] },
  "sessions.listContextPaths": { spec: contract.sessions.listContextPaths, valid: [{ sessionId: "s", revision: "r", visibility: "active" }, { sessionId: "s", revision: "r", visibility: "sleeping", limit: 50 }], invalid: [{ sessionId: "s" }, { sessionId: "s", revision: "r", visibility: "all" }, { sessionId: "s", revision: "r", visibility: "active", limit: -1 }] },
  "sessions.listContextEntries": { spec: contract.sessions.listContextEntries, valid: [{ sessionId: "s", revision: "r", limit: 200 }], invalid: [{ sessionId: "s" }, { sessionId: "s", revision: "r", limit: Infinity }] },
  "sessions.readContextEntry": { spec: contract.sessions.readContextEntry, valid: [{ sessionId: "s", revision: "r", key: "k", offset: 0 }], invalid: [{ sessionId: "s", revision: "r", path: "/etc/passwd" }, { sessionId: "s", revision: "r", key: "k", offset: "1" }] },
  "sessions.listPage": { spec: contract.sessions.listPage, valid: [undefined, {}, { search: "hello", limit: 50 }], invalid: [{ search: "x".repeat(301) }, { limit: 501 }, { pinned: "true" }] },
  "usage.getActivity": { spec: contract.usage.getActivity, valid: [{}, { model: "alpha", providerId: "provider" }, { range: "total", requestRowsPage: { page: 1, limit: 500, cursor: "abc" } }, { workspaceRoot: "/w", utcOffsetMinutes: 330 }], invalid: [null, { kind: "tool_invocation" }, { utcOffsetMinutes: 1.5 }, { utcOffsetMinutes: 2000 }, { workspaceRoot: 1 }, { model: ["alpha"] }, { providerId: "x".repeat(301) }, { search: "x".repeat(301) }, { requestRowsPage: { page: -1 } }, { requestId: "../x" }] },
  "usage.getStatus": { spec: contract.usage.getStatus, valid: [{ requestId: "q-123" }], invalid: [{}, { requestId: "" }, { requestId: 1 }] },
  "usage.cancel": { spec: contract.usage.cancel, valid: [{ requestId: "q-123" }], invalid: [undefined, { requestId: "a b" }] },
  "harnessStats.query": {
    spec: contract.harnessStats.query,
    valid: [
      { requestId: "h-1", kind: "overview", filter: { range: "week", sessionKind: "all" } },
      { requestId: "h-2", kind: "versions", filter: { range: "total", sessionKind: "main", revision: "main@3", mode: "agent" }, compare: { from: "main@2", to: "main@3" } },
    ],
    invalid: [
      undefined,
      { requestId: "h-1", kind: "everything", filter: { range: "week", sessionKind: "all" } },
      { requestId: "h-1", kind: "usage-vs", filter: { range: "year", sessionKind: "all" } },
      { requestId: "h-1", kind: "tools", filter: { range: "week", sessionKind: "all" } },
      { requestId: "h-1", kind: "tools", filter: { range: "week", sessionKind: "robot" } },
      { requestId: "h-1", kind: "tools", filter: { range: "week", sessionKind: "all", model: "x".repeat(2000) } },
    ],
  },
  "harnessStats.cancel": { spec: contract.harnessStats.cancel, valid: [{ requestId: "h-1" }], invalid: [undefined, { requestId: "a b" }] },
  "sessions.create": { spec: contract.sessions.create, valid: [undefined, {}, { runLocation: "worktree", branch: "main", agentForm: "agent" }], invalid: [null, { runLocation: "invalid" }, { branch: [] }, { agentForm: "plan" }, { hostId: "host", runLocation: "worktree" }] },
  "workspaces.readFile": { spec: contract.workspaces.readFile, valid: [{ relativePath: "a.ts" }, { workspaceRoot: "/w", relativePath: "a.ts" }], invalid: [undefined, { workspaceRoot: "/w" }, { relativePath: 1 }] },
  "workspaces.statFile": { spec: contract.workspaces.statFile, valid: [{ workspaceRoot: null, relativePath: "a.ts" }], invalid: [{ relativePath: ["a"] }] },
  "workspaces.listFileApplications": { spec: contract.workspaces.listFileApplications, valid: [{ relativePath: "a.docx" }], invalid: [{}, { relativePath: 1 }] },
  "workspaces.openFile": { spec: contract.workspaces.openFile, valid: [{ relativePath: "a.docx", action: "open" }, { workspaceRoot: "/w", relativePath: "a.docx", action: "open", applicationId: "/Applications/Pages.app" }, { relativePath: "a.docx", action: "reveal" }], invalid: [{ relativePath: "a.docx" }, { relativePath: "a.docx", action: "run" }, { relativePath: "a.docx", action: "open", applicationId: 1 }] },
  "workspaces.listMarkdownFiles": { spec: contract.workspaces.listMarkdownFiles, valid: [{ workspaceRoot: "/w" }], invalid: [null, {}, { workspaceRoot: 0 }] },
  "workspaces.writeMarkdownFile": { spec: contract.workspaces.writeMarkdownFile, valid: [{ workspaceRoot: "/w", relativePath: "a.md", content: "" }], invalid: [null, { workspaceRoot: "/w", relativePath: "a.md" }, { workspaceRoot: "/w", relativePath: "a.md", content: 1 }] },
  "sessions.readArtifact": { spec: contract.sessions.readArtifact, valid: [{ sessionId: "s", artifactPath: "out.png" }], invalid: [{ sessionId: "s" }] },
  "sessions.openSideChat": { spec: contract.sessions.openSideChat, valid: [{ parentSessionId: "s" }], invalid: [{ parentSessionId: 1 }, {}] },
  "sessions.listSideChats": { spec: contract.sessions.listSideChats, valid: [{ parentSessionId: "s" }], invalid: [{ sessionId: "s" }] },
  "workspaces.createFolder": { spec: contract.workspaces.createFolder, valid: [{ parentRoot: "/w", name: "new" }], invalid: [{ parentRoot: "/w" }, "new"] },
  "workspaces.openInIde": { spec: contract.workspaces.openInIde, valid: [{ workspaceId: "w1" }], invalid: [{ workspaceId: 1 }] },
  "workspaces.setVisibility": { spec: contract.workspaces.setVisibility, valid: [{ workspaceId: "w1", hidden: true }], invalid: [{ workspaceId: "w1", hidden: "yes" }] },
  "workspaces.getGitContext": { spec: contract.workspaces.getGitContext, valid: [undefined, {}, { workspaceRoot: "/w" }], invalid: [{ workspaceRoot: 1 }, "x"] },
  "sessions.setWorkspace": { spec: contract.sessions.setWorkspace, valid: [{ sessionId: "s", workspaceRoot: "/w" }, { sessionId: "s", workspaceId: "w1" }], invalid: [{ workspaceRoot: "/w" }] },
  "dialogs.selectWorkspaceDirectory": { spec: contract.dialogs.selectWorkspaceDirectory, valid: [undefined, { registerWorkspace: true }], invalid: [{ registerWorkspace: "true" }] },
  "settings.update": { spec: contract.settings.update, valid: [{}, { defaultModelId: null }], invalid: [null, [], "x"] },
  "settings.updateV4": { spec: contract.settings.updateV4, valid: [{ expectedRevision: "r1", namespace: "general", patch: {} }], invalid: [{ expectedRevision: "r1", namespace: "general" }, { expectedRevision: 1, namespace: "general", patch: {} }] },
  "settings.writeSystemPrompt": { spec: contract.settings.writeSystemPrompt, valid: [{ content: "" }], invalid: [{ content: null }] },
  "hosts.add": { spec: contract.hosts.add, valid: [{ name: "box", code: "123456", endpoint: { kind: "wss", url: "wss://h" } }], invalid: [{ name: "box", code: "123456" }, { name: "box", code: 123456, endpoint: {} }] },
  "hosts.remove": { spec: contract.hosts.remove, valid: ["c1"], invalid: [{ id: "c1" }] },
  "hosts.reconnect": { spec: contract.hosts.reconnect, valid: ["c1"], invalid: [1] },
  "hosts.activate": { spec: contract.hosts.activate, valid: [null, "host:s1"], invalid: [undefined, 1] },
  "hosts.preview": { spec: contract.hosts.preview, valid: [{ hostId: "h", sessionId: "s", artifactId: "a" }], invalid: [{ hostId: "h", sessionId: "s" }] },
  "hosts.download": { spec: contract.hosts.download, valid: [{ hostId: "h", sessionId: "s", artifactId: "a" }], invalid: [{ hostId: "h", sessionId: 1, artifactId: "a" }] },
  "hosts.call": { spec: contract.hosts.call, valid: [{ hostId: "h", method: "host.describe", params: {} }], invalid: [{ hostId: "h", method: "auth.pair", params: {} }, { hostId: "h", method: "nope", params: {} }, { hostId: "h", method: "host.describe", params: null }] },
  // 资源监控、任务与审批
  "resourceMonitor.watch": { spec: contract.resourceMonitor.watch, valid: [true, false], invalid: [undefined, "true", 1] },
  "tasks.command": {
    spec: contract.tasks.command,
    valid: [
      { sessionId: "s", op: "snapshot" },
      { sessionId: "s", op: "configure", configuration: { model: "m", thinkingEnabled: true, reasoningEffort: "high", selectedSkillIds: ["a"] } },
      { sessionId: "s", op: "designate", taskId: "t", runId: null, revision: 3 },
      { sessionId: "s", op: "cancel", taskId: "t", revision: 0 },
      { sessionId: "s", op: "move", taskId: "t", beforeTaskId: "u", revision: 1 },
      { sessionId: "s", op: "resume", revision: 2 },
      { sessionId: "s", op: "stop", runId: "r" },
    ],
    invalid: [undefined, { op: "snapshot" }, { sessionId: "s", op: "delete" }, { sessionId: "s", op: "configure", configuration: { reasoningEffort: "turbo" } }, { sessionId: "s", op: "designate", taskId: "t", runId: 1, revision: 3 }, { sessionId: "s", op: "cancel", taskId: "t", revision: -1 }, { sessionId: "s", op: "stop" }],
  },
  "tasks.submit": { spec: contract.tasks.submit, valid: [{ sessionId: "s", submissionId: "u", userInput: "hi" }, { sessionId: "s", submissionId: "u", userInput: "", attachments: [], rewind: { runId: "r", expectedThroughSeq: 4 }, agentRunId: "a" }], invalid: [undefined, { sessionId: "s", userInput: "hi" }, { sessionId: "s", submissionId: "u", userInput: 1 }, { sessionId: "s", submissionId: "u", userInput: "hi", attachments: {} }, { sessionId: "s", submissionId: "u", userInput: "hi", rewind: { runId: "r" } }] },
  "tasks.abort": { spec: contract.tasks.abort, valid: [{ sessionId: "s", agentRunId: "r" }], invalid: [{ sessionId: "s" }, { agentRunId: "r" }] },
  "tasks.listBackground": { spec: contract.tasks.listBackground, valid: [{ sessionId: "s" }], invalid: [undefined, {}, "s"] },
  "tasks.readBackgroundOutput": { spec: contract.tasks.readBackgroundOutput, valid: [{ sessionId: "s", taskId: "t" }], invalid: [{ sessionId: "s" }] },
  "tasks.stopBackground": { spec: contract.tasks.stopBackground, valid: [{ sessionId: "s", taskId: "t" }], invalid: [{ sessionId: "s", taskId: 1 }] },
  "approvals.submit": { spec: contract.approvals.submit, valid: [{ requestId: "r", decision: "once" }, { requestId: "r", hostId: "h", decision: "deny" }, { requestId: "r", decision: "session", suggestionId: "g" }], invalid: [undefined, { decision: "once" }, { requestId: "r", decision: "always" }, { requestId: "r", decision: "session" }] },
  "approvals.listPending": { spec: contract.approvals.listPending, valid: [undefined, {}, { sessionId: "s" }], invalid: [{ sessionId: 1 }, "s"] },
  // 会话
  "sessions.list": { spec: contract.sessions.list, valid: [undefined, {}, { archived: true }], invalid: [{ archived: "yes" }, null] },
  "sessions.get": { spec: contract.sessions.get, valid: [{ sessionId: "s" }], invalid: [undefined, {}, { sessionId: 1 }] },
  "sessions.getPage": { spec: contract.sessions.getPage, valid: [{ sessionId: "s" }, { sessionId: "s", beforeSeq: 10, includeToolDetails: true, maxWindowEvents: 200, maxWindowBytes: 1024 }], invalid: [{}, { sessionId: "s", beforeSeq: -1 }, { sessionId: "s", maxWindowEvents: 0 }, { sessionId: "s", includeToolDetails: "yes" }] },
  "sessions.getProjectionSnapshot": { spec: contract.sessions.getProjectionSnapshot, valid: [{ sessionId: "s", afterSeq: 0 }], invalid: [{ sessionId: "s", afterSeq: 1.5 }] },
  "sessions.getObservation": { spec: contract.sessions.getObservation, valid: [{ sessionId: "s" }], invalid: [{ sessionId: null }] },
  "sessions.getToolDetail": { spec: contract.sessions.getToolDetail, valid: [{ sessionId: "s", callId: "c" }], invalid: [{ sessionId: "s" }] },
  "sessions.getPreview": { spec: contract.sessions.getPreview, valid: [{ sessionId: "s" }], invalid: ["s"] },
  "sessions.getSubagents": { spec: contract.sessions.getSubagents, valid: [{ sessionId: "s" }], invalid: [{}] },
  "sessions.getSubAgentTranscript": { spec: contract.sessions.getSubAgentTranscript, valid: [{ transcriptRef: { kind: "subagent_transcript", sessionId: "s", agentRunId: "", runId: "r" } }, { transcriptRef: { kind: "subagent_transcript", sessionId: "s", agentRunId: "a", runId: "r", path: "/p" } }], invalid: [undefined, { transcriptRef: { kind: "file", sessionId: "s", agentRunId: "a", runId: "r" } }, { transcriptRef: { kind: "subagent_transcript", sessionId: "s" } }] },
  "sessions.liveOutput": { spec: contract.sessions.liveOutput, valid: [{ sessionId: "s" }], invalid: [null] },
  "sessions.interruptSubagent": { spec: contract.sessions.interruptSubagent, valid: [{ sessionId: "s", agentId: "a" }], invalid: [{ sessionId: "s" }] },
  "sessions.revealSubagentRecord": { spec: contract.sessions.revealSubagentRecord, valid: [{ sessionId: "s", agentId: "a" }], invalid: [{ agentId: "a" }] },
  "sessions.fork": { spec: contract.sessions.fork, valid: [{ sessionId: "s" }, { sessionId: "s", turnId: "t" }], invalid: [{}, { sessionId: "s", turnId: 1 }] },
  "sessions.pin": { spec: contract.sessions.pin, valid: [{ sessionId: "s", pinned: true }], invalid: [{ sessionId: "s" }, { sessionId: "s", pinned: "yes" }] },
  "sessions.rename": { spec: contract.sessions.rename, valid: [{ sessionId: "s", title: "" }, { sessionId: "s", title: "New" }], invalid: [{ sessionId: "s" }, { sessionId: "s", title: null }] },
  "sessions.setPermissionMode": { spec: contract.sessions.setPermissionMode, valid: [{ sessionId: "s", mode: "default" }, { sessionId: "s", mode: "full-access" }, { sessionId: "s", mode: "auto-review" }], invalid: [{ sessionId: "s", mode: "yolo" }, { sessionId: "s" }] },
  "sessions.setAgentMode": { spec: contract.sessions.setAgentMode, valid: [{ sessionId: "s", mode: "chat" }, { sessionId: "s", mode: "plan", expectedRevision: 2 }], invalid: [{ sessionId: "s", mode: "build" }, { sessionId: "s", mode: "agent", expectedRevision: "2" }] },
  "sessions.archive": { spec: contract.sessions.archive, valid: [{ sessionId: "s", archived: false }], invalid: [{ sessionId: "s", archived: 0 }] },
  "sessions.archiveMany": { spec: contract.sessions.archiveMany, valid: [{ sessionIds: [] }, { sessionIds: ["a", "b"] }], invalid: [{ sessionIds: "a" }, { sessionIds: ["a", 1] }, {}] },
  // 对话框
  "dialogs.selectFiles": { spec: contract.dialogs.selectFiles, valid: [undefined, {}, { remote: true }], invalid: [{ remote: "yes" }, "x"] },
  "dialogs.importComposerImage": { spec: contract.dialogs.importComposerImage, valid: [{ name: "a.png", bytes: new Uint8Array(0) }, { name: "a.png", mimeType: "image/png", bytes: new Uint8Array([1]) }], invalid: [undefined, { name: "a.png", bytes: [1, 2] }, { name: "a.png", bytes: "AQ==" }, { bytes: new Uint8Array(0) }] },
  "dialogs.showArtifactContextMenu": { spec: contract.dialogs.showArtifactContextMenu, valid: [{ kind: "session_image", sessionId: "s", artifactPath: "a.png" }, { kind: "workspace_file", relativePath: "a.md" }, { kind: "workspace_file", workspaceRoot: "/w", relativePath: "a.md" }], invalid: [undefined, { kind: "url", href: "x" }, { kind: "session_image", sessionId: "s" }, { kind: "workspace_file", workspaceRoot: "/w" }] },
  // 工作区 Git
  "workspaces.getEnvironment": { spec: contract.workspaces.getEnvironment, valid: [undefined, {}, { workspaceRoot: "/w" }], invalid: [{ workspaceRoot: 1 }, "x"] },
  "workspaces.createBranch": { spec: contract.workspaces.createBranch, valid: [{ branchName: "feat" }, { workspaceRoot: "/w", branchName: "feat" }], invalid: [undefined, {}, { branchName: 1 }] },
  "workspaces.switchBranch": { spec: contract.workspaces.switchBranch, valid: [{ workspaceRoot: "/w", branchName: "main" }], invalid: [{ workspaceRoot: "/w" }] },
  "workspaces.commit": { spec: contract.workspaces.commit, valid: [{}, { workspaceRoot: "/w", message: "m", includeUnstagedChanges: true, branchName: "b" }], invalid: [undefined, { message: 1 }, { includeUnstagedChanges: "yes" }] },
  "workspaces.push": { spec: contract.workspaces.push, valid: [{}, { remote: "origin" }], invalid: [{ remote: ["origin"] }] },
  "workspaces.commitAndPush": { spec: contract.workspaces.commitAndPush, valid: [{ message: "m", remote: "origin" }], invalid: [{ message: "m", remote: 1 }] },
  "workspaces.openInTool": { spec: contract.workspaces.openInTool, valid: [{ toolId: "finder" }, { workspaceRoot: "/w", toolId: "vscode", relativePath: "src" }], invalid: [{}, { toolId: "notepad" }, { toolId: "finder", relativePath: 1 }] },
  // Review
  "review.getSnapshot": { spec: contract.review.getSnapshot, valid: [{ selection: { kind: "uncommitted" } }, { workspaceRoot: "/w", sessionId: "s", selection: { kind: "commit", sha: "abc" }, options: { ignoreWhitespaceChanges: true } }], invalid: [undefined, {}, { selection: { kind: "everything" } }, { selection: { kind: "branch", branch: 1 } }] },
  "review.refreshSnapshot": { spec: contract.review.refreshSnapshot, valid: [{ workspaceId: "w", selection: { kind: "staged" } }], invalid: [{ selection: "staged" }] },
  "review.getFileDiffs": { spec: contract.review.getFileDiffs, valid: [{ snapshotId: "n", expectedGeneration: 1, requests: [] }, { snapshotId: "n", expectedGeneration: 0, requests: [{ fileId: "f", contextLines: 3 }] }], invalid: [{ snapshotId: "n", requests: [] }, { snapshotId: "n", expectedGeneration: 1, requests: [{ contextLines: 3 }] }, { snapshotId: "n", expectedGeneration: 1, requests: [{ fileId: "f", contextLines: -1 }] }] },
  "review.getFileContents": { spec: contract.review.getFileContents, valid: [{ snapshotId: "n", expectedGeneration: 1, fileIds: ["f"] }], invalid: [{ snapshotId: "n", expectedGeneration: 1 }, { snapshotId: "n", expectedGeneration: 1, fileIds: "f" }] },
  "review.listBranches": { spec: contract.review.listBranches, valid: [{}, { workspaceRoot: "/w" }], invalid: [undefined, { workspaceRoot: 1 }] },
  "review.listCommits": { spec: contract.review.listCommits, valid: [{ sessionId: "s" }], invalid: [null, { sessionId: 1 }] },
  // 设置与模型
  "settings.updateImageGeneration": { spec: contract.settings.updateImageGeneration, valid: [{ baseUrl: "https://x", model: "m" }, { apiKey: "k", baseUrl: "https://x", model: "m" }], invalid: [undefined, { model: "m" }, { apiKey: 1, baseUrl: "https://x", model: "m" }] },
  "quickOpen.updateShortcut": { spec: contract.quickOpen.updateShortcut, valid: [{}, { enabled: true }, { accelerator: "Cmd+K", target: { kind: "automatic" } }, { target: { kind: "session", sessionId: "s" } }], invalid: [undefined, { enabled: "yes" }, { target: { kind: "file" } }, { accelerator: "Cmd+K", extra: true }] },
  "providers.setKey": { spec: contract.providers.setKey, valid: [{ provider: "deepseek", apiKey: "k" }, { provider: "tavily", apiKey: "k" }, { provider: "image-generation", apiKey: "k" }, { provider: "speech-minimax", apiKey: "k" }], invalid: [undefined, { provider: "openai", apiKey: "k" }, { provider: "deepseek" }, { provider: "deepseek", apiKey: 1 }] },
  "providers.clearKey": { spec: contract.providers.clearKey, valid: [{ provider: "kimi" }], invalid: [{ provider: "nope" }, {}] },
  "models.listUsable": { spec: contract.models.listUsable, valid: [{ purpose: "chat" }, { purpose: "vision" }], invalid: [undefined, {}, { purpose: "subagent" }] },
  "modelConnections.probe": { spec: contract.modelConnections.probe, valid: [{ kind: "saved", connectionId: "c" }, { kind: "draft", draft: { templateId: "t", apiKey: "k" } }, { kind: "draft", draft: { templateId: "t", apiKey: "k", protocol: "openai-responses", baseUrl: "https://x", proxy: {} } }], invalid: [undefined, { kind: "saved" }, { kind: "draft", draft: { templateId: "t" } }, { kind: "draft", draft: { templateId: "t", apiKey: "k", protocol: "grpc" } }] },
  "modelConnections.create": { spec: contract.modelConnections.create, valid: [{ templateId: "t", apiKey: "k", models: [] }, { templateId: "t", apiKey: "k", multiplier: 1.5, resolvedAuth: "bearer", models: [{ apiModel: "m", overrides: { label: "x" } }] }], invalid: [{ templateId: "t", apiKey: "k" }, { templateId: "t", apiKey: "k", models: [{}] }, { templateId: "t", apiKey: "k", models: [], resolvedAuth: "basic" }] },
  "modelConnections.update": { spec: contract.modelConnections.update, valid: [{ connectionId: "c" }, { connectionId: "c", label: "L", enabled: false, managementKey: null }], invalid: [{}, { connectionId: "c", enabled: "no" }, { connectionId: "c", protocol: "grpc" }] },
  "modelConnections.remove": { spec: contract.modelConnections.remove, valid: [{ connectionId: "c" }], invalid: ["c", {}] },
  "modelConnections.addModels": { spec: contract.modelConnections.addModels, valid: [{ connectionId: "c", models: [{ apiModel: "m" }] }], invalid: [{ connectionId: "c" }, { connectionId: "c", models: [{ apiModel: 1 }] }] },
  "modelConnections.updateModel": { spec: contract.modelConnections.updateModel, valid: [{ key: "deepseek:chat", overrides: null }, { key: "custom:m", overrides: { label: "x" } }], invalid: [{ key: "deepseek", overrides: null }, { key: "deepseek:chat" }, { key: "deepseek:chat", overrides: "x" }] },
  "modelConnections.removeModel": { spec: contract.modelConnections.removeModel, valid: [{ key: "kimi:k2" }], invalid: [{ key: "k2" }, {}] },
  "modelConnections.preview": { spec: contract.modelConnections.preview, valid: [{ apiModel: "m" }, { apiModel: "m", connectionId: "c", templateId: "t", protocol: "anthropic-messages", multiplier: 2, overrides: {} }], invalid: [{}, { apiModel: "m", multiplier: "2" }, { apiModel: "m", overrides: [] }] },
  "modelConnections.updatePurposes": { spec: contract.modelConnections.updatePurposes, valid: [{}, { chat: { model: "deepseek:chat", thinking: "high" } }, { subagent: { model: null, thinking: null } }], invalid: [undefined, { chat: { model: "deepseek:chat" } }, { chat: { model: "chat", thinking: null } }, { nope: { model: null, thinking: null } }, { chat: { model: null, thinking: "turbo" } }] },
  "modelConnections.getBalance": { spec: contract.modelConnections.getBalance, valid: [{ connectionId: "c" }], invalid: [{ connectionId: 1 }] },
  // 插件
  "englishLearning.setTarget": { spec: contract.englishLearning.setTarget, valid: [{ enabled: false, sessionId: null }, { enabled: true, sessionId: "s" }], invalid: [undefined, { enabled: true }, { enabled: "yes", sessionId: "s" }, { enabled: true, sessionId: 1 }] },
  "browserBridge.selectInstance": { spec: contract.browserBridge.selectInstance, valid: ["i1"], invalid: [null, 1] },
  "skills.list": { spec: contract.skills.list, valid: [undefined, {}, { workspaceRoot: "/w" }], invalid: [{ workspaceRoot: 1 }] },
  "skills.uninstall": { spec: contract.skills.uninstall, valid: [{ directory: "/d" }], invalid: [{}, "/d"] },
};

/** 无入参通道只接受 undefined。 */
const NO_INPUT_SPECS: InvokeSpec<unknown, unknown>[] = [
  contract.app.getBootstrapState, contract.resourceMonitor.copySnapshot, contract.dialogs.selectImages, contract.workspaces.list, contract.workspaces.listOpenTools,
  contract.harnessStats.getStatus, contract.settings.get, contract.settings.getV4, contract.settings.readSystemPrompt, contract.settings.getSearchUsage,
  contract.quickOpen.consume, contract.quickOpen.getShortcutStatus, contract.modelConnections.list, contract.englishLearning.getState, contract.englishLearning.stopSpeech,
  contract.englishLearning.previewSpeech, contract.browserBridge.getStatus, contract.browserBridge.connect, contract.browserBridge.prepareUpdate, contract.browserBridge.disconnect,
  contract.browserBridge.openExtensions, contract.browserBridge.revealExtensionDirectory, contract.browserBridge.installNativeHost,
  contract.browserBridge.selectSourceExtension, contract.browserBridge.useBundledExtension, contract.browserBridge.installFromRepo, contract.plugins.list,
  contract.pythonRuntime.getStatus, contract.pythonRuntime.installExtension, contract.skills.install,
  contract.updates.getState, contract.updates.selectSource, contract.updates.start, contract.hosts.list,
];
for (const spec of NO_INPUT_SPECS) CASES[`no-input ${spec.channel}`] = { spec, valid: [undefined], invalid: [null, {}, "x", 0] };

const contractInvokeChannels = Object.values(contract).flatMap(domain => Object.values(domain).filter(spec => spec.kind === "invoke").map(spec => spec.channel));

describe("IPC input guards", () => {
  it("registers a guard for every invoke member of the contract", () => {
    expect([...IPC_INPUT_GUARDS.keys()].sort()).toEqual([...contractInvokeChannels].sort());
  });

  it("has a case for every guarded channel", () => {
    expect(Object.values(CASES).map(({ spec }) => spec.channel).sort()).toEqual([...IPC_INPUT_GUARDS.keys()].sort());
  });

  for (const [name, { spec, valid, invalid }] of Object.entries(CASES)) {
    it(`${name} accepts well-formed input and rejects malformed input`, () => {
      const guard = IPC_INPUT_GUARDS.get(spec.channel)!;
      for (const input of valid) expect(guard(input), JSON.stringify(input)).toBeNull();
      for (const input of invalid) expect(guard(input), JSON.stringify(input) ?? "undefined").toEqual(expect.any(String));
    });
  }
});
