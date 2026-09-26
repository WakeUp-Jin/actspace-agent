import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
  it("switches an empty Chat session from the + menu and carries the draft, keeping only images", async () => {
    const user = userEvent.setup(); const onAgentFormChange = vi.fn();
    const image = { id: "img", kind: "image" as const, name: "shot.png", path: "/fixture/shot.png" };
    render(composer({ surface: "initial", onAgentFormChange, draftKey: "chat", draftRestore: { id: 3, sessionId: "chat", text: "草稿", attachments: [attachments[0], image] } }));
    expect(screen.queryByRole("button", { name: /移除 Chat/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    const menu = screen.getByRole("menu", { name: "添加上下文或工具" });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.getAttribute("aria-label"))).toEqual(["Agent", "Plan", "Chat", "图片与文件"]);
    await user.click(within(menu).getByRole("menuitem", { name: "Agent" }));
    expect(onAgentFormChange).toHaveBeenLastCalledWith({ agentForm: "agent", mode: "agent", draft: { text: "草稿", attachments: [image] } });
    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    await user.click(screen.getByRole("menuitem", { name: "Plan" }));
    expect(onAgentFormChange).toHaveBeenLastCalledWith(expect.objectContaining({ agentForm: "agent", mode: "plan" }));
  });
  it("replaces + with a direct attachment button once the Chat conversation has started", async () => {
    const selectFiles = vi.fn(async () => ({ canceled: true, attachments: [] }));
    (window as { actspace?: unknown }).actspace = { selectFiles };
    const user = userEvent.setup();
    render(composer({ surface: "followup", onAgentFormChange: vi.fn() }));
    expect(screen.queryByRole("button", { name: "添加 Agent、上下文或工具" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "添加图片或文件" }));
    expect(selectFiles).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("offers every mode from an empty Agent session and drops the plan-idea chip", async () => {
    const user = userEvent.setup(); const onAgentFormChange = vi.fn();
    render(<TooltipProvider><Composer contextSnapshot={mockContextSnapshot} surface="initial" onAgentFormChange={onAgentFormChange} /></TooltipProvider>);
    expect(screen.queryByText("规划新想法")).toBeNull();
    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    expect(screen.getByRole("menuitem", { name: "Agent" })).toBeVisible();
    await user.click(screen.getByRole("menuitem", { name: "Chat" }));
    expect(onAgentFormChange).toHaveBeenCalledWith({ agentForm: "chat", mode: "agent", draft: { text: "", attachments: [] } });
  });
  it("moves Chat context usage into the composer toolbar instead of a status row", () => {
    const { container } = render(composer({ surface: "followup" }));
    const usage = screen.getByRole("button", { name: /上下文用量/ });
    expect(screen.getByLabelText("输入框工具栏")).toContainElement(usage);
    expect(container.querySelector(".composer-status-row")).toBeNull();
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
