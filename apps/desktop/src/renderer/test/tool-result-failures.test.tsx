import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { ToolLogLine } from "../components/messages/ToolLogLine";

const diagnostic = "The requested filesystem resource does not exist.";
const base = { id: "missing", createdAt: "now", displayText: diagnostic };

describe("failed filesystem tool results", () => {
  it.each(["failed", "denied", "aborted", "outcome-unknown"] as const)("keeps read identity and expandable diagnostics for %s", async (status) => {
    const onOpenFile = vi.fn();
    const onExpand = vi.fn();
    render(<ToolLogLine message={{ ...base, kind: "read", filePath: "missing.txt", status }} onOpenFile={onOpenFile} onExpand={onExpand} />);
    const toggle = screen.getByRole("button", { name: /Read missing.txt/ });
    expect(toggle).toHaveTextContent(status === "outcome-unknown" ? "outcome unknown" : status);
    expect(toggle.closest("article")).toHaveClass("is-error");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByText(diagnostic)).toBeVisible();
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(onExpand).toHaveBeenCalledOnce();
    await userEvent.click(toggle);
    expect(screen.queryByText(diagnostic)).not.toBeInTheDocument();
  });

  const siblings: MessageBlock[] = [
    { ...base, kind: "directory_list", path: "missing-dir", status: "failed" },
    { ...base, kind: "grep", pattern: "needle", scope: "missing-dir", status: "failed" },
    { ...base, kind: "glob", pattern: "*.md", scope: "missing-dir", status: "failed" },
    { ...base, kind: "search", query: "needle", scope: "missing-dir", status: "failed" },
  ];
  it.each(siblings)("preserves target and local failure details for $kind without a lazy loader", async (message) => {
    render(<ToolLogLine message={message as Parameters<typeof ToolLogLine>[0]["message"]} />);
    const toggle = screen.getByRole("button", { name: /missing-dir.*failed/ });
    await userEvent.click(toggle);
    expect(within(toggle.closest("article")!).getByText(diagnostic)).toBeVisible();
  });

  it("does not expose stale success previews on a failed read", async () => {
    render(<ToolLogLine message={{ ...base, kind: "read", filePath: "missing.txt", status: "failed", resultPreview: ["STALE_SUCCESS"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Read missing.txt.*failed/ }));
    expect(screen.getByText(diagnostic)).toBeVisible();
    expect(screen.queryByText("STALE_SUCCESS")).not.toBeInTheDocument();
  });

  it("shows an explicit zero for an empty completed directory and its result", async () => {
    render(<ToolLogLine message={{ ...base, kind: "directory_list", path: "empty", status: "completed", entryCount: 0, resultPreview: ["(empty directory)"] }} />);
    await userEvent.click(screen.getByRole("button", { name: "Listed empty (0 entries)" }));
    expect(screen.getByText("(empty directory)")).toBeVisible();
    expect(document.querySelector(".is-error")).toBeNull();
  });
});
