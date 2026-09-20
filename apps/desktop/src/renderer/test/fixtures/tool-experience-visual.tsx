import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import type { MessageBlock, SessionEvent } from "@actspace/shared";
import { ConversationView } from "../../components/ConversationView";
import { RightPanel } from "../../components/RightPanel";
import { RightPanelProvider, useRightPanel } from "../../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../../components/ui/Tooltip";
import "../../styles/index.css";

const now = "2026-09-06T12:00:00Z";
const agents: MessageBlock[] = [
  { kind: "agent", id: "subagent:a", description: "Inspect renderer and streaming events", status: "running", displayText: "正在读取 · App.tsx", subagentType: "explore", display: "panel", createdAt: now, stats: { durationMs: 64000, toolCallCount: 2 }, transcriptRef: { kind: "subagent_transcript", sessionId: "fixture", agentRunId: "run", runId: "a" } },
  { kind: "agent", id: "subagent:b", description: "Check tool parameter contracts", status: "completed", displayText: "Completed", summary: "已核对工具参数契约", subagentType: "explore", display: "panel", createdAt: now, stats: { durationMs: 28000, toolCallCount: 3 }, transcriptRef: { kind: "subagent_transcript", sessionId: "fixture", agentRunId: "run", runId: "b" } },
];
agents.push(
  { ...agents[0], id: "subagent:c", description: "验证失败状态与错误摘要", status: "failed", error: "执行失败 · 连接已断开", transcriptRef: { kind: "subagent_transcript", sessionId: "fixture", agentRunId: "run", runId: "c" } } as MessageBlock,
  { ...agents[0], id: "subagent:d", description: "验证停止状态以及很长的任务名称在有限空间内的截断表现", status: "aborted", summary: "已停止本次检查", transcriptRef: { kind: "subagent_transcript", sessionId: "fixture", agentRunId: "run", runId: "d" } } as MessageBlock,
);
const events: SessionEvent[] = [
  { id: "reply", sessionId: "a", agentRunId: "run", schemaVersion: 2, timestamp: now, type: "assistant_message", payload: { content: "我正在检查流式工具事件和持久化记录之间的对应关系。" } },
  { id: "read", sessionId: "a", agentRunId: "run", schemaVersion: 2, timestamp: now, type: "tool_result", payload: { toolCallId: "r", status: "running", uiPreview: { kind: "read", filePath: "src/renderer/App.tsx", displayText: "Read src/renderer/App.tsx" } } },
];
// Explicit fixture bridge; never loaded by the production renderer.
window.actspace = { getSubagents: async () => agents, getSubAgentTranscript: async () => events } as unknown as typeof window.actspace;
function Fixture() {
  const [view, setView] = useState<"chat" | "trajectory">("chat");
  const [theme, setTheme] = useState("light");
  const { openTab } = useRightPanel();
  document.documentElement.dataset.theme = theme;
  const messages: MessageBlock[] = [{ kind: "user", id: "user", content: "检查工具渲染和子智能体执行", createdAt: now }, { kind: "assistant", id: "reply", content: "我会先核对参数、运行状态和执行记录。", createdAt: now }, ...agents];
  return <div className="h-screen bg-app-bg text-text-main">
    <nav className="flex h-12 items-center gap-5 border-b border-line px-5 text-[13px]">
      <span>显式测试样例</span><button onClick={() => setView(view === "chat" ? "trajectory" : "chat")}>{view === "chat" ? "轨迹" : "会话"}</button>
      <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "深色" : "浅色"}</button>
      <button onClick={() => openTab({ id: "subagents", kind: "subagents", title: "Subagents", sessionId: "fixture" })}>Subagents</button>
    </nav>
    <div className="grid h-[calc(100vh-48px)] grid-cols-[minmax(0,1fr)_420px]">
      <ConversationView messages={messages} contextSnapshot={null} sessionId="fixture" activeView={view} isStreaming onAbort={() => {}} />
      <RightPanel sessionId="fixture" />
    </div>
  </div>;
}
createRoot(document.getElementById("root")!).render(<TooltipProvider><RightPanelProvider><Fixture /></RightPanelProvider></TooltipProvider>);
