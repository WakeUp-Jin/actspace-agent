import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ApprovalReason,
  compactApprovalDir,
  getApprovalReasonChips,
  splitApprovalPath,
  submitApprovalDecision,
  useApprovalDecision,
} from "../components/messages/ApprovalParts";
import { legacyRunTarget } from "./helpers/workbench";
import { RunTargetContext } from "../target/run-target-context";
import type { RunTarget } from "../target/run-target";
import { setupBridge } from "./helpers/bridge";

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
  it("returns false when the bridge rejects or is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await submitApprovalDecision({ requestId: "r1", decision: "once" })).toBe(false);
    setupBridge({ "approvals.submit": vi.fn(async () => ({ ok: false, reason: "expired" })) });
    expect(await submitApprovalDecision({ requestId: "r1", decision: "deny" })).toBe(false);
    setupBridge({ "approvals.submit": vi.fn(async () => ({ ok: true })) });
    expect(await submitApprovalDecision({ requestId: "r1", decision: "once" })).toBe(true);
    warn.mockRestore();
  });
});

describe("useApprovalDecision on a remote Session", () => {
  // 15 T11：远端审批的 Host 取自会话的运行目标，提交时带 hostId；不再从 requestId 里拆。
  const remote: RunTarget = { kind: "remote", hostId: "h:with:colons", hostName: "Cloud" };
  const wrapper = (target: RunTarget) => ({ children }: { children: ReactNode }) => (
    <RunTargetContext.Provider value={legacyRunTarget({ runTarget: target })}>{children}</RunTargetContext.Provider>
  );
  function bridge(state: "connected" | "offline") {
    const submit = vi.fn(async () => ({ ok: true }));
    setupBridge({
      "approvals.submit": submit,
      "hosts.list": async () => [{ id: "h:with:colons", hostId: "h:with:colons", name: "Cloud", state, endpoint: { kind: "wss", url: "wss://cloud" } }],
      "events.hostsChanged": () => () => {}, "events.hostEvent": () => () => {},
    });
    return submit;
  }

  it("submits with the Session's hostId whatever the requestId looks like", async () => {
    const submit = bridge("connected");
    const { result } = renderHook(() => useApprovalDecision("opaque-id"), { wrapper: wrapper(remote) });
    await waitFor(() => expect(result.current.disabled).toBe(false));
    await act(() => result.current.decide("once"));
    expect(submit).toHaveBeenCalledWith({ requestId: "opaque-id", hostId: "h:with:colons", decision: "once" });
  });

  it("disables the decision while the Session's Host is offline", async () => {
    const submit = bridge("offline");
    const { result } = renderHook(() => useApprovalDecision("opaque-id"), { wrapper: wrapper(remote) });
    await act(async () => {});
    expect(result.current.disabled).toBe(true);
    await act(() => result.current.decide("once"));
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits a local approval without a hostId", async () => {
    const submit = bridge("offline");
    const { result } = renderHook(() => useApprovalDecision("local-r1"), { wrapper: wrapper({ kind: "local" }) });
    expect(result.current.disabled).toBe(false);
    await act(() => result.current.decide("deny"));
    expect(submit).toHaveBeenCalledWith({ requestId: "local-r1", decision: "deny" });
  });
});
