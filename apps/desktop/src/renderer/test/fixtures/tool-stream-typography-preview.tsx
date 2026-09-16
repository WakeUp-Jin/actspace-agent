/** Explicit visual fixture: no IPC, provider requests, or persisted sessions. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import type { MessageBlock, WorkspaceGitContext } from "@actspace/shared";
import { ConversationView } from "../../components/ConversationView";
import { RightPanelProvider } from "../../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../../components/ui/Tooltip";
import "../../styles/index.css";

document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
const previewTheme = new URLSearchParams(location.search).get("theme");
if (previewTheme === "system") document.documentElement.dataset.theme = "system";
const createdAt = "2026-09-12T00:00:00.000Z";
const contexts: Record<string, WorkspaceGitContext> = {
  folder: { status: "not_repository", workspaceRoot: "/work/notes", branches: [] },
  branch: { status: "ready", workspaceRoot: "/work/repo", currentBranch: "main", branches: [{ name: "main", current: true }], headCommit: "0123456789abcdef" },
  detached: { status: "ready", workspaceRoot: "/work/repo", branches: [], detachedCommit: "01234567", headCommit: "0123456789abcdef" },
};

function Preview() {
  const [phase, setPhase] = useState<"thinking" | "replying" | "completed">("thinking");
  const [git, setGit] = useState("folder");
  const messages: MessageBlock[] = [
    { kind: "user", id: "user", createdAt, content: "请验证最终回复结束后的 Thinking 折叠。" },
    { kind: "thinking", id: "thinking", createdAt, title: "Thinking", collapsedByDefault: false,
      status: phase === "thinking" ? "running" : "completed",
      content: "正在分析工作空间与分支状态。" },
    { kind: "read", id: "read", createdAt, filePath: "docs/ARCHITECTURE.md", displayText: "Read docs/ARCHITECTURE.md", status: "completed", resultPreview: ["# Architecture"] },
    { kind: "read", id: "read-plain", createdAt, filePath: "Demos/README.md", displayText: "Read Demos/README.md", status: "completed" },
    { kind: "thinking", id: "thinking-bash", createdAt, title: "Thinking", content: "检查命令", collapsedByDefault: true, status: "completed" },
    { kind: "directory_list", id: "list", createdAt, path: "docs", displayText: "Listed docs", status: "completed", entryCount: 3, resultPreview: ["README.md", "ARCHITECTURE.md", "design-docs/"] },
    { kind: "bash", id: "bash", createdAt, command: "ls -lt Demos/", commandPreview: "ls -lt Demos/", title: "Bash completed in 85ms (exit 0, sandboxed=true).", status: "success", stdout: "README.md", durationMs: 85, sandboxed: true, exitCode: 0 },
    { kind: "bash", id: "denied", createdAt, title: "Approval timed out.", command: "wc -l Demos/example.html", status: "denied", reason: "Approval timed out.", notExecuted: true },
    { kind: "write_diff", id: "write", createdAt, filePath: "Demos/example.html", additions: 3, deletions: 0, collapsedLines: 0, status: "completed", diff: "+<!doctype html>\n+<html>\n+</html>" },
    { kind: "assistant", id: "commentary", createdAt, content: "文件已保存。我再检查一下正文和工具行之间的阅读节奏。" },
    { kind: "thinking", id: "thinking-read", createdAt, title: "Thinking", content: "检查文件", collapsedByDefault: true, status: "completed" },
    { kind: "read", id: "read-long", createdAt, filePath: "Demos/很长的目录名称/写入工具测试页-Markdown样式对照.html", displayText: "Read file", status: "completed", resultPreview: ["<!doctype html>"] },
    ...(phase === "thinking" ? [] : [{ kind: "assistant" as const, id: "reply", createdAt,
      content: phase === "replying" ? "正文正在输出，此时 Thinking 应保持展开。" : "正文已全部输出。Thinking 应自动收起，并允许手动重新展开。" }]),
  ];
  return <TooltipProvider><RightPanelProvider>
    <div className="flex h-screen flex-col bg-app-bg text-text-main">
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-line p-3">
        <span>开发验收样例</span>
        <button onClick={() => setPhase("thinking")}>重新思考</button>
        <button onClick={() => setPhase("replying")}>输出正文</button>
        <button onClick={() => setPhase("completed")}>回复结束</button>
        <select aria-label="Git 状态" value={git} onChange={(event) => setGit(event.target.value)}>
          <option value="folder">普通目录</option><option value="branch">正常分支</option><option value="detached">Detached HEAD</option>
        </select>
      </div>
      <ConversationView messages={messages} contextSnapshot={null}
        sessionId="visual-fixture" isStreaming={phase !== "completed"} composerPhase="active"
        executionContext={{ locked: true, runLocation: "this_mac", gitContext: contexts[git] }} />
    </div>
  </RightPanelProvider></TooltipProvider>;
}

createRoot(document.getElementById("root")!).render(<Preview />);
