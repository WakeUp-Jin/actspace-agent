import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import type { MessageBlock } from "@actspace/shared";
import { AgentRunBlock } from "../src/renderer/components/messages/AgentRunBlock";
import "../src/renderer/styles/index.css";

const labels = ["正在思考", "正在读取 · ConversationView.tsx", "正在分析 · 刚读取 ConversationView.tsx", "正在执行 3 项工具调用 · 正在搜索 · AgentRunBlock", "正在搜索 · AgentRunBlock", "正在整理回复"];
function Fixture() {
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState(false);
  const base: Extract<MessageBlock, { kind: "agent" }> = { kind: "agent", id: "fixture", description: "检查子智能体消息流与测试覆盖", status: "running", subagentType: "explore", agentKind: "agent", displayText: labels[index]!, createdAt: "2026-09-15T00:00:00Z" };
  return <main className="mx-auto max-w-[800px] space-y-6 p-8 text-text-main">
    <h1 className="text-xl">子智能体活动行 · 显式测试样例</h1>
    <div className="flex gap-4">
      <button onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; }}>切换浅深主题</button>
      <button onClick={() => setIndex((value) => (value + 1) % labels.length)}>下一条活动</button>
    </div>
    <p>已开始只读检查，下面是子任务的执行进度。</p>
    <AgentRunBlock message={base} onOpenTranscript={() => setOpened(true)} />
    <AgentRunBlock message={{ ...base, id: "done", agentKind: "explore", description: "核对相关测试入口", status: "completed", summary: "已定位消息流与侧栏的测试入口。" }} />
    <AgentRunBlock message={{ ...base, id: "failed", description: "分析未完成的调用链", status: "failed", error: "达到 300 步执行上限。请根据已有发现调整任务，勿原样重试。" }} />
    <AgentRunBlock message={{ ...base, id: "stopped", description: "核对文档", status: "aborted", summary: undefined }} />
    {opened && <p role="alert">详情入口点击已收到</p>}
    <p className="text-text-muted">仅验证真实组件的布局、状态切换和点击回调，不发起模型请求。</p>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
