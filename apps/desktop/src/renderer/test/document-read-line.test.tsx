import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { ToolLogLine } from "../components/messages/ToolLogLine";

type ReadBlock = Extract<MessageBlock, { kind: "read" }>;
const base = { id: "doc", createdAt: "now", kind: "read" as const, filePath: "docs/季度报告.pdf" };
const row = (overrides: Partial<ReadBlock>): ReadBlock => ({ ...base, displayText: "季度报告.pdf · 2 pages", document: { name: "季度报告.pdf", stats: "2 pages" }, status: "completed", ...overrides });

describe("read_document row", () => {
  it("keeps the file read approval card with the full path while pending", () => {
    render(<ToolLogLine message={row({ status: "pending", filePath: "/Users/me/Documents/reports/季度报告.pdf", approvalRequestId: "approval-doc", displayText: "Read 季度报告.pdf" })} />);
    expect(screen.getByText("读取")).toBeInTheDocument();
    expect(screen.getByTitle("/Users/me/Documents/reports/季度报告.pdf")).toBeInTheDocument();
  });

  it("reads Read <name> while running", () => {
    render(<ToolLogLine message={row({ status: "running", displayText: "Read 季度报告.pdf", document: { name: "季度报告.pdf" } })} />);
    expect(screen.getAllByText("Read 季度报告.pdf")[0]).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows Read, the name and the stats when completed; the name is not a link", async () => {
    const onOpenFile = vi.fn();
    render(<ToolLogLine message={row({ resultPreview: ["# 第三季度报告", "营收增长"] })} onOpenFile={onOpenFile} />);
    const toggle = screen.getByRole("button", { name: /Read 季度报告.pdf 2 pages/ });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(toggle);
    expect(screen.getByText("营收增长")).toBeVisible();
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("puts the warning first, in the warning style, and expands with only a warning", async () => {
    const warning = "第 13 页识别不完整，内容已截断。";
    const { unmount } = render(<ToolLogLine message={row({ resultPreview: ["line one"], document: { name: "季度报告.pdf", stats: "2 pages", warning } })} />);
    await userEvent.click(screen.getByRole("button", { name: /季度报告.pdf/ }));
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(warning);
    expect(items[0]).toHaveClass("tool-result-item", "is-warning");
    expect(items[1]).toHaveTextContent("line one");
    unmount();

    render(<ToolLogLine message={row({ document: { name: "季度报告.pdf", stats: "2 pages", warning } })} />);
    await userEvent.click(screen.getByRole("button", { name: /季度报告.pdf/ }));
    expect(screen.getByText(warning)).toHaveClass("is-warning");
  });

  it.each(["failed", "denied"] as const)("shows %s at the row tail and the error text when expanded", async (status) => {
    render(<ToolLogLine message={row({ status, displayText: "季度报告.pdf", document: { name: "季度报告.pdf", errorText: "文件设有打开密码，无法解析。去掉密码后再试。" } })} />);
    const toggle = screen.getByRole("button", { name: new RegExp(`Read 季度报告.pdf ${status}`) });
    expect(toggle.closest("article")).toHaveClass("is-error");
    await userEvent.click(toggle);
    expect(screen.getByText("文件设有打开密码，无法解析。去掉密码后再试。")).toBeVisible();
  });

  it("shows aborted at the row tail and cannot expand", () => {
    render(<ToolLogLine message={row({ status: "aborted", displayText: "季度报告.pdf", document: { name: "季度报告.pdf" } })} onExpand={vi.fn()} />);
    expect(screen.getByText("aborted")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders HTML in the file name as text", () => {
    render(<ToolLogLine message={row({ document: { name: "<img src=x onerror=alert(1)>.pdf", stats: "1 page" }, displayText: "x" })} />);
    expect(screen.getByText("<img src=x onerror=alert(1)>.pdf")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("keeps a plain read_file row's file name clickable", async () => {
    const onOpenFile = vi.fn();
    render(<ToolLogLine message={{ ...base, filePath: "src/a.ts", displayText: "Read a.ts", status: "completed", resultPreview: ["const a = 1;"] }} onOpenFile={onOpenFile} />);
    await userEvent.click(screen.getByRole("button", { name: "Read src/a.ts" }));
    expect(onOpenFile).toHaveBeenCalledOnce();
  });
});
