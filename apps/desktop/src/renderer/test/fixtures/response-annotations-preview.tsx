/** Explicit visual fixture: no IPC, provider requests, or persisted sessions. `?theme=dark` 切深色，`?drafts=0` 不预置草稿引用。 */
import React from "react";
import { createRoot } from "react-dom/client";
import type { MessageBlock, ResponseAnnotationReference } from "@actspace/shared";
import { ConversationView } from "../../components/ConversationView";
import { RightPanelProvider } from "../../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../../components/ui/Tooltip";
import "../../styles/index.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";
const createdAt = "2026-09-28T00:00:00.000Z";

const REPLY = [
  "把选区映射成偏移时，我们只统计**可批注的可见文本**：段落、标题、列表项、引用和表格单元格。",
  "",
  "- 代码块不参与批注，避免把代码当成自然语言引用。",
  "- 相邻两个块之间插入一个虚拟换行，所以跨段选择也能稳定还原。",
  "- Mixed 中英文 like `inline code` 和 emoji 😀 都按 UTF-16 计数。",
  "",
  "> 定位失败时宁可显示「原回复不可用」，也不要猜位置。",
  "",
  "| 场景 | 处理 |",
  "| --- | --- |",
  "| 偏移仍然对得上 | 直接使用 |",
  "| 回复被压缩改写 | 按前后文找唯一位置 |",
  "",
  "```ts",
  "const resolution = resolveAnnotation(model, annotation);",
  "```",
  "",
  "最后一段用来观察 marker 碰撞：同一行上的两个批注会被错开 20px，而不是叠在一起。",
].join("\n");

/** 与 collectAnnotatableText 的拼接规则一致，只用来给 fixture 算偏移。 */
const VISIBLE = [
  "把选区映射成偏移时，我们只统计可批注的可见文本：段落、标题、列表项、引用和表格单元格。",
  "代码块不参与批注，避免把代码当成自然语言引用。",
  "相邻两个块之间插入一个虚拟换行，所以跨段选择也能稳定还原。",
  "Mixed 中英文 like inline code 和 emoji 😀 都按 UTF-16 计数。",
  "定位失败时宁可显示「原回复不可用」，也不要猜位置。",
  "场景", "处理", "偏移仍然对得上", "直接使用", "回复被压缩改写", "按前后文找唯一位置",
  "最后一段用来观察 marker 碰撞：同一行上的两个批注会被错开 20px，而不是叠在一起。",
].join("\n");

function annotationFor(id: string, selectedText: string, comment?: string, occurrence = 0): ResponseAnnotationReference {
  let start = -1;
  for (let index = 0; index <= occurrence; index += 1) start = VISIBLE.indexOf(selectedText, start + 1);
  const end = start + selectedText.length;
  return {
    annotationId: id, assistantMessageId: "v2-1", selectedText, startOffset: start, endOffset: end,
    prefixContext: VISIBLE.slice(Math.max(0, start - 64), start), suffixContext: VISIBLE.slice(end, end + 64),
    ...(comment ? { comment } : {}),
  };
}

const sent: ResponseAnnotationReference[] = [
  annotationFor("sent-1", "可批注的可见文本", "这里的「可见」具体排除了哪些节点？"),
  annotationFor("sent-2", "marker 碰撞"),
  annotationFor("sent-3", "同一行上的两个批注", "和上一个批注在同一行"),
  { ...annotationFor("sent-gone", "定位失败"), selectedText: "这段原文已经不在回复里了", prefixContext: "", suffixContext: "", startOffset: 0, endOffset: 12 },
];

const drafts: ResponseAnnotationReference[] = params.get("drafts") === "0" ? [] : [
  annotationFor("draft-1", "相邻两个块之间插入一个虚拟换行，所以跨段选择也能稳定还原。", "能不能举一个跨段选择的例子？"),
  annotationFor("draft-2", "按前后文找唯一位置"),
];

const messages: MessageBlock[] = [
  { kind: "user", id: "v2-0", createdAt, content: "解释一下回复批注怎么定位。" },
  { kind: "assistant", id: "v2-1", createdAt, content: REPLY },
  { kind: "user", id: "v2-2", createdAt, content: "针对这几处继续展开。", responseAnnotations: sent },
  { kind: "assistant", id: "v2-3", createdAt, content: "好的，下面逐条说明。选中这段文字也可以继续添加引用。" },
];

function Preview() {
  return <TooltipProvider><RightPanelProvider>
    <div className="flex h-screen flex-col bg-app-bg text-text-main">
      <ConversationView messages={messages} contextSnapshot={null} sessionId="visual-fixture" draftKey="visual-fixture"
        isStreaming={false} composerPhase="active"
        readAnnotationDraft={() => drafts} writeAnnotationDraft={() => {}}
        executionContext={{ locked: true, runLocation: "this_mac", gitContext: { status: "not_repository", workspaceRoot: "/work/notes", branches: [] } }} />
    </div>
  </RightPanelProvider></TooltipProvider>;
}

createRoot(document.getElementById("root")!).render(<Preview />);
