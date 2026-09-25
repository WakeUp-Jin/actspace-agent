import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApprovalReason,
  compactApprovalDir,
  getApprovalReasonChips,
  splitApprovalPath,
  submitApprovalDecision,
} from "../components/messages/ApprovalParts";

describe("approval path formatting", () => {
  it("splits the base name from its directory", () => {
    expect(splitApprovalPath("/private/tmp/scope/beta.txt")).toEqual({ dir: "/private/tmp/scope/", base: "beta.txt" });
    expect(splitApprovalPath("notes.md")).toEqual({ dir: "", base: "notes.md" });
    expect(splitApprovalPath("/tmp/other-repo/src/")).toEqual({ dir: "/tmp/other-repo/", base: "src" });
  });

  it("folds the middle of long directories and keeps short ones intact", () => {
    expect(compactApprovalDir("/private/tmp/actspace-acceptance-20260925/scope/")).toBe("/private/tmp/…/scope/");
    expect(compactApprovalDir("apps/desktop/src/renderer/components/")).toBe("apps/desktop/…/components/");
    expect(compactApprovalDir("docs/histories/")).toBe("docs/histories/");
    expect(compactApprovalDir("/a-very-long-directory-name/another-long-directory/")).toBe("/a-very-long-directory-name/another-long-directory/");
  });
});

describe("approval reason mapping", () => {
  it("maps known Runtime reasons to chips and hides generic prompts", () => {
    expect(getApprovalReasonChips("The requested file is outside the workspace.\nAllow this file to be deleted once?")).toEqual({
      chips: [{ label: "工作区外", tone: "warning" }],
      notes: [],
    });
    expect(getApprovalReasonChips("This file may contain credentials and requires one-time approval.").chips).toEqual([{ label: "敏感文件", tone: "danger" }]);
    expect(getApprovalReasonChips(undefined)).toEqual({ chips: [], notes: [] });
  });

  it("keeps unknown reasons available behind an info icon", () => {
    render(<ApprovalReason reason="Bash always-ask mode is enabled" />);
    expect(screen.getByLabelText("审批原因")).toHaveAttribute("title", "Bash always-ask mode is enabled");
  });
});

describe("submitApprovalDecision", () => {
  afterEach(() => {
    delete (window as unknown as { actspace?: unknown }).actspace;
  });

  it("returns false when the bridge rejects or is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await submitApprovalDecision({ requestId: "r1", decision: "once" })).toBe(false);
    window.actspace = { submitApproval: vi.fn(async () => ({ ok: false, reason: "expired" })) } as unknown as Window["actspace"];
    expect(await submitApprovalDecision({ requestId: "r1", decision: "deny" })).toBe(false);
    window.actspace = { submitApproval: vi.fn(async () => ({ ok: true })) } as unknown as Window["actspace"];
    expect(await submitApprovalDecision({ requestId: "r1", decision: "once" })).toBe(true);
    warn.mockRestore();
  });
});
