import { act, render, screen } from "@testing-library/react";
import type { MessageBlock } from "@actspace/shared";
import { TestConversationView } from "./helpers/workbench";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";
import { clearSelection, selectText, stubRangeRects } from "./fixtures/response-annotation-helpers";
import { setupBridge } from "./helpers/bridge";

// 14 T15：ConversationView 按块判断能否批注（durable 块带 sourceSeq），不再解析 id。
const createdAt = "2026-10-06T00:00:00.000Z";
const durable: MessageBlock[] = [
  { kind: "user", id: "v2-0", content: "第一问", createdAt, runId: "run-1", sourceSeq: 0 },
  { kind: "assistant", id: "v2-1", content: "落盘的回复正文", createdAt, runId: "run-1", sourceSeq: 1 },
  { kind: "user", id: "turn:run-2:user:0", content: "第二问", createdAt, runId: "run-2" },
];
const liveReply: MessageBlock = { kind: "assistant", id: "turn:run-2:assistant:0", content: "流式中的回复正文", createdAt, runId: "run-2" };

function view(messages: MessageBlock[]) {
  return <TooltipProvider delayDuration={0}><RightPanelProvider>
    <TestConversationView messages={messages} contextSnapshot={null} sessionId="session-annotate" />
  </RightPanelProvider></TooltipProvider>;
}

async function menuFor(id: string, needle: string): Promise<boolean> {
  clearSelection();
  await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
  (document.activeElement as HTMLElement | null)?.blur();
  selectText(document.querySelector<HTMLElement>(`[data-assistant-message-id="${id}"]`)!, needle);
  await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
  return screen.queryByRole("menuitem", { name: "添加到对话" }) !== null;
}

describe("ConversationView response annotations", () => {
  let restoreRects: () => void;
  beforeEach(() => { setupBridge(); restoreRects = stubRangeRects(); });
  afterEach(() => { clearSelection(); restoreRects(); });

  it("offers annotation only on durable replies, and picks up a reply once it is persisted", async () => {
    const { rerender } = render(view([...durable, liveReply]));
    expect(await menuFor("v2-1", "回复正文")).toBe(true);
    expect(await menuFor("turn:run-2:assistant:0", "回复正文")).toBe(false);

    rerender(view([...durable, { ...liveReply, id: "v2-3", sourceSeq: 3 }]));
    expect(await menuFor("v2-3", "回复正文")).toBe(true);
  });
});
