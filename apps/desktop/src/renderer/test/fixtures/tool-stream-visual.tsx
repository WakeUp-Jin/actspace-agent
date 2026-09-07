import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { createMessageBlocks, type MessageBlock, type SessionEvent, type ToolUiPreview } from "@actspace/shared";
import { ToolLogLine } from "../../components/messages/ToolLogLine";
import { FileDiffBlock } from "../../components/messages/FileDiffBlock";
import { BashRunBlock } from "../../components/messages/BashRunBlock";
import { TooltipProvider } from "../../components/ui/Tooltip";
import "../../styles/index.css";

/** Explicit local visual fixture; never imported by the production entrypoint. */
function ToolStreamVisual() {
  const [phase, setPhase] = useState<"streaming" | "running" | "finished">("streaming");
  const [dark, setDark] = useState(false);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const definitions = [
    { name: "read_file", args: { path: "src/example.ts" }, summary: "Read src/example.ts" },
    { name: "list_directory", args: { path: "src" }, summary: "Listed src" },
    { name: "grep", args: { pattern: "ToolUiPreview", path: "src" }, summary: "Found 2 matches" },
    { name: "write_file", args: { path: "example.ts", content: 'export const status = "ready";\n' }, summary: "Created example.ts" },
    { name: "edit_file", args: { path: "config.ts" }, summary: "Updated config.ts" },
    { name: "bash", args: { command: "ls -la", intent: "List fixture directory" }, summary: "Listed fixture directory" },
    { name: "read_file", args: { path: "missing.txt" }, summary: "File not found: missing.txt", error: true },
  ];
  return <TooltipProvider><main className="bg-bg text-text-main" style={{ minHeight: "100vh", padding: 40 }}>
    <div style={{ maxWidth: 850, margin: "auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>工具流式渲染 · 显式测试样例</h1>
      <div style={{ display: "flex", gap: 16, marginBottom: 30 }}>
        <button onClick={() => setPhase("streaming")}>参数生成</button>
        <button onClick={() => setPhase("running")}>工具执行</button>
        <button onClick={() => setPhase("finished")}>结果完成</button>
        <button onClick={() => setDark(!dark)}>{dark ? "浅色" : "深色"}</button>
      </div>
      <p style={{ marginBottom: 24 }}>我先读取文件并查看目录。合法正文 JSON：{'{"valid":true}'}</p>
      <div style={{ display: "grid", gap: 22 }}>
        {definitions.map((definition, index) => {
          const ready = phase !== "streaming";
          const path = ready ? definition.args.path ?? "" : "";
          const status = phase === "finished" ? definition.error ? "failed" : "completed" : "running";
          const displayText = phase === "finished" ? definition.summary : "Preparing tool";
          const preview: ToolUiPreview = definition.name === "list_directory" ? { kind: "directory_list", path: path || ".", displayText }
            : definition.name === "grep" ? { kind: "grep", pattern: ready ? "ToolUiPreview" : "", scope: path, displayText }
            : definition.name === "bash" ? { kind: "bash", status: phase === "finished" ? "success" : "running", command: ready ? "ls -la" : "", title: "List fixture directory", commandPreview: ready ? "ls -la" : "" }
            : definition.name === "write_file" || definition.name === "edit_file" ? { kind: definition.name === "write_file" ? "write" : "edit_diff", filePath: path, status, collapsedLines: 8, additions: phase === "finished" ? 1 : 0, deletions: 0, diff: phase === "finished" ? "+export const ready = true;" : "" }
            : { kind: "read", filePath: path, displayText };

          const event = { id: String(index), type: "tool_result", schemaVersion: 2, sessionId: "visual", agentRunId: "run", timestamp: "2026-09-06T00:00:00Z", payload: { toolCallId: String(index), toolName: definition.name, ok: !definition.error, uiPreview: preview } } as SessionEvent;
          const block = createMessageBlocks([event])[0]!;
          if (phase !== "finished" && "status" in block) block.status = "running";
          if (block.kind === "write_diff" && preview.kind === "write") block.streamingContent = preview.streamingContent;
          if (block.kind === "write_diff" || block.kind === "edit_diff") return <FileDiffBlock key={index} message={block} />;
          if (block.kind === "bash") return <BashRunBlock key={index} message={block} />;
          return <ToolLogLine key={index} message={block as Extract<MessageBlock, { kind: "read" }>} />;
        })}
      </div>
    </div>
  </main></TooltipProvider>;
}
createRoot(document.getElementById("root")!).render(<ToolStreamVisual />);
