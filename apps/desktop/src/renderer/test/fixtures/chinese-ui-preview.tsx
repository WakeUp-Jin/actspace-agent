/** Explicit visual fixture. No IPC, model requests, or persistent settings. */
import React from "react";
import { createRoot } from "react-dom/client";
import { Composer } from "../../components/Composer";
import { Sidebar } from "../../components/Sidebar";
import { RightPanel } from "../../components/RightPanel";
import { RightPanelProvider } from "../../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../../components/ui/Tooltip";
import "../../styles/index.css";

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") === "dark" ? "dark" : "light";
const narrow = query.get("width") === "680";
const context = { totalTokens: 2190, maxTokens: 200000, percentUsed: 1, compressionCount: 0, cumulativeTokens: 2190,
  buckets: [{ key: "systemPrompt" as const, tokens: 1200 }, { key: "tools" as const, tokens: 990 }] };

createRoot(document.getElementById("root")!).render(
  <TooltipProvider delayDuration={0}><RightPanelProvider>
    <div className="mx-auto flex h-screen max-w-full flex-col bg-app-bg text-text-main" style={{ width: narrow ? 680 : "100%" }}>
      <p className="m-0 border-b border-line px-4 py-2 text-[12px] text-text-muted">开发验收样例 · 不连接模型、不写入会话 · {narrow ? "680px" : "宽屏"}</p>
      <div className="flex min-h-0 flex-1">
        {!narrow ? <aside className="w-[240px] shrink-0 border-r border-line"><Sidebar sessions={[]} activeSessionId={null} mode="expanded" view="chat" /></aside> : null}
        <main className="flex min-w-0 flex-1 flex-col justify-end gap-4 p-4">
          <p className="text-[13px] text-text-muted">检查菜单、上下文和模式名称。Chat、Plan、Thinking、Effort 保留英文。</p>
          <Composer contextSnapshot={context} onSend={() => {}} reviewSummary={{ status: "changes", additions: 12, deletions: 3 }} />
        </main>
        {!narrow ? <aside className="w-[300px] shrink-0 border-l border-line"><RightPanel contextSnapshot={context} /></aside> : null}
      </div>
    </div>
  </RightPanelProvider></TooltipProvider>,
);
