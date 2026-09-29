/** Explicit visual fixture for chat Mermaid diagrams: no IPC, provider requests, or persisted sessions. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import type { MessageBlock } from "@actspace/shared";
import { ConversationView } from "../../components/ConversationView";
import { RightPanelProvider } from "../../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../../components/ui/Tooltip";
import { mermaidPngBlob, mermaidTheme, renderMermaid } from "../../components/messages/mermaid-renderer";
import "../../styles/index.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
const createdAt = "2026-09-28T00:00:00.000Z";

const SEQUENCE = `sequenceDiagram
  autonumber
  participant U as 用户
  participant C as Composer
  participant R as Runtime
  participant T as 工具执行器
  participant M as 模型服务
  U->>C: 输入问题并发送
  C->>R: 创建本轮请求（附带工作区上下文）
  R->>M: 流式请求
  alt 模型需要调用工具
    M-->>R: tool_call(read_file)
    R->>T: 执行 read_file（需要审批时先挂起等待用户确认）
    T-->>R: 文件内容
    R->>M: 回填工具结果
  else 直接回答
    M-->>R: 文本增量
  end
  Note over R,M: 上下文接近阈值时自动压缩
  R-->>C: 回复完成
  C-->>U: 渲染 Markdown 与 Mermaid 图表`;

const FLOW = `flowchart LR
  A[收到 assistant 消息] --> B{fence 是否闭合?}
  B -- 否 --> C[按普通代码块显示]
  B -- 是 --> D{语言是否为 mermaid?}
  D -- 否 --> C
  D -- 是 --> E[源码策略：剥离 init / click]
  E --> F[Mermaid strict 渲染]
  F --> G{成功?}
  G -- 是 --> H[DOMPurify 净化 SVG]
  H --> I[显示图表 + 工具栏]
  G -- 否 --> J[局部错误 + 显示源码]
  subgraph 缓存
    K[(LRU 32 项)]
  end
  H -.-> K`;

const STATE = `stateDiagram-v2
  [*] --> Loading
  Loading --> Ready: 渲染成功
  Loading --> Error: 语法错误 / 超时
  Ready --> Source: 查看源码
  Source --> Ready: 显示图表
  Ready --> Expanded: 放大查看
  Expanded --> Ready: Esc
  Error --> [*]`;

const PIE = `pie title 工具调用占比
  "read_file" : 42
  "grep" : 23
  "edit_file" : 18
  "bash" : 12
  "其他" : 5`;

const CLASS = `classDiagram
  class MermaidDiagramBlock {
    +source: string
    +themeId: MermaidThemeId
    -state: RenderState
  }
  class MermaidRenderer {
    +renderMermaid(source, theme)
    +sanitizeMermaidSvg(svg)
  }
  MermaidDiagramBlock --> MermaidRenderer : 调用`;

const BROKEN = `flowchart TD
  A[开始] -->
  B{{缺少闭合`;

const fence = (source: string) => "```mermaid\n" + source + "\n```";

function reply(streaming: boolean): string {
  const full = [
    "下面用几张图说明 Mermaid 渲染链路。",
    "### 时序图",
    fence(SEQUENCE),
    "### 流程图（宽图）",
    fence(FLOW),
    "### 状态图",
    fence(STATE),
    "### 类图与饼图",
    fence(CLASS),
    fence(PIE),
    "### 语法错误",
    fence(BROKEN),
    "错误只影响这一块，其余内容照常显示。",
  ].join("\n\n");
  if (!streaming) return full;
  // Cut inside the flowchart fence to show the still-streaming code block state.
  return full.slice(0, full.indexOf("B -- 否"));
}

function Preview() {
  const [streaming, setStreaming] = useState(params.has("streaming"));
  const messages: MessageBlock[] = [
    { kind: "user", id: "user", createdAt, content: "画几张图解释聊天里的 Mermaid 渲染链路。" },
    { kind: "assistant", id: "reply", createdAt, content: reply(streaming) },
  ];
  return <TooltipProvider><RightPanelProvider>
    <div className="flex h-screen flex-col bg-app-bg text-text-main">
      <div className="flex shrink-0 items-center gap-4 border-b border-line p-3 text-act-sm">
        <span>Mermaid 图表验收样例</span>
        <button onClick={() => setStreaming(true)}>流式中（fence 未闭合）</button>
        <button onClick={() => setStreaming(false)}>回复完成</button>
        <a href="?theme=light">浅色</a><a href="?theme=dark">深色</a>
      </div>
      <ConversationView messages={messages} contextSnapshot={null}
        sessionId="mermaid-fixture" isStreaming={streaming} composerPhase="active"
        executionContext={{ locked: true, runLocation: "this_mac", gitContext: { status: "not_repository", workspaceRoot: "/work/notes", branches: [] } }} />
    </div>
  </RightPanelProvider></TooltipProvider>;
}

createRoot(document.getElementById("root")!).render(<Preview />);

// ?png=N rasterizes the Nth diagram with the export path and shows the PNG on top of the page.
const pngIndex = Number(params.get("png") ?? Number.NaN);
if (Number.isInteger(pngIndex)) {
  const sources = [SEQUENCE, FLOW, STATE, CLASS, PIE];
  void renderMermaid(sources[pngIndex] ?? FLOW, "codex")
    .then((result) => mermaidPngBlob(result, mermaidTheme("codex")))
    .then((blob) => {
      const image = document.createElement("img");
      image.src = URL.createObjectURL(blob);
      image.style.cssText = "position:fixed;inset:0;z-index:9999;max-width:100vw;max-height:100vh;outline:4px solid red";
      document.body.append(image);
    })
    .catch((error: unknown) => {
      document.body.insertAdjacentHTML("afterbegin", `<pre style="position:fixed;z-index:9999;color:red">PNG export failed: ${String(error)}</pre>`);
    });
}

// ?expand=N opens the Nth diagram's preview so headless screenshots can capture it.
const expandIndex = Number(params.get("expand") ?? Number.NaN);
if (Number.isInteger(expandIndex)) {
  const timer = window.setInterval(() => {
    const buttons = document.querySelectorAll<HTMLButtonElement>('button[aria-label="放大查看"]:not(:disabled)');
    if (buttons.length > expandIndex) {
      window.clearInterval(timer);
      buttons[expandIndex].click();
    }
  }, 200);
}
