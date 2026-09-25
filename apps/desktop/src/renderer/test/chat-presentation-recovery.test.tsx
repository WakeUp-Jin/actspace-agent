import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "../components/Composer";
import { RightPanel } from "../components/RightPanel";
import { RightPanelObjectMenu } from "../components/right-panel/RightPanelObjectMenu";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";
import { mockContextSnapshot } from "./fixtures/workbenchFixture";
import { formatChatAttachmentIssue } from "@actspace/shared";

afterEach(() => { delete (window as { actspace?: unknown }).actspace; });
const attachments = [
  { id: "good", kind: "file" as const, name: "good.txt", path: "/fixture/good.txt" },
  { id: "bad", kind: "file" as const, name: "bad.txt", path: "/fixture/bad.txt" },
];
function composer(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  return <TooltipProvider><Composer contextSnapshot={mockContextSnapshot} agentForm="chat" {...props} /></TooltipProvider>;
}
describe("Chat presentation and attachment recovery", () => {
  it.each(["initial", "followup"] as const)("hides developer controls on %s and keeps Chat controls", (surface) => {
    const onModeChange = vi.fn();
    render(composer({ surface, onModeChange, reviewSummary: { status: "changes", additions: 1, deletions: 2 }, executionContext: { runLocation: "worktree", selectedBranch: "main", gitContext: null } }));
    expect(screen.queryByLabelText("初始工作区与运行位置选择")).toBeNull();
    expect(screen.queryByLabelText("待处理的审查操作")).toBeNull();
    expect(screen.queryByText("main")).toBeNull();
    expect(screen.queryByText("工作树")).toBeNull();
    expect(screen.getByText("Chat")).toBeVisible();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Tab", shiftKey: true });
    expect(onModeChange).not.toHaveBeenCalled();
    if (surface === "followup") expect(screen.getByRole("button", { name: /上下文用量/ })).toBeVisible();
  });
  it("retains all draft content and clears only the removed file's error", async () => {
    const user = userEvent.setup(); const onSend = vi.fn();
    const issue = { code: "invalid_utf8" as const, fileName: "bad.txt", attachmentId: "bad" };
    render(composer({ draftKey: "chat", onSend, draftRestore: { id: 1, sessionId: "chat", text: "保留正文", attachments, attachmentIssue: issue, error: formatChatAttachmentIssue(issue) } }));
    expect(screen.getByRole("textbox")).toHaveValue("保留正文");
    expect(screen.getByRole("alert")).toHaveTextContent("bad.txt");
    expect(screen.getByLabelText("已附加的文件 bad.txt")).toHaveAttribute("aria-describedby", "composer-send-error");
    await user.click(screen.getByLabelText("移除 bad.txt"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("已附加的文件 good.txt")).toBeVisible();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("保留正文", expect.objectContaining({ attachments: [attachments[0]] }));
  });
  it("recomputes a total limit after removal instead of clearing it prematurely", async () => {
    const user = userEvent.setup();
    const issue = { code: "total_text_too_large" as const, limit: 256000, textCharacterCounts: { good: 260000, bad: 100 } };
    render(composer({ draftKey: "chat", draftRestore: { id: 2, sessionId: "chat", text: "草稿", attachments, attachmentIssue: issue, error: formatChatAttachmentIssue(issue) } }));
    await user.click(screen.getByLabelText("移除 bad.txt"));
    expect(screen.getByRole("alert")).toBeVisible();
    await user.click(screen.getByLabelText("移除 good.txt"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("hides both panel entry points and existing developer tabs, preserving them for Agent", async () => {
    const user = userEvent.setup();
    const content = (developmentEnabled: boolean) => <TooltipProvider><RightPanelProvider initialTabs={[{ id: "review", kind: "review", title: "Review", scope: "uncommitted" }]}><RightPanel developmentEnabled={developmentEnabled} /><RightPanelObjectMenu sessionId="chat" developmentEnabled={developmentEnabled} /></RightPanelProvider></TooltipProvider>;
    const view = render(content(false));
    expect(screen.queryByRole("tab", { name: "Review" })).toBeNull();
    expect(screen.getByRole("button", { name: "上下文" })).toBeVisible();
    for (const name of ["文件", "Review", "终端", "子 Agent"]) expect(screen.queryByRole("button", { name })).toBeNull();
    await user.click(screen.getByLabelText("新建右侧面板对象"));
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["可视化回复", "上下文"]);
    view.rerender(content(true));
    expect(screen.getByRole("tab", { name: "Review" })).toBeVisible();
  });
});
