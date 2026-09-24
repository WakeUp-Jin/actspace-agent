import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PermissionModeControl } from "../components/WorkbenchLayout";

afterEach(() => {
  delete window.actspace;
});

describe("PermissionModeControl", () => {
  it("persists a mode change and refreshes the Session projection", async () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: true as const }));
    const onChanged = vi.fn(async () => undefined);
    window.actspace = { setSessionPermissionMode } as unknown as typeof window.actspace;

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={onChanged} />);
    fireEvent.change(screen.getByRole("combobox", { name: "会话权限模式" }), { target: { value: "full-access" } });

    await waitFor(() => expect(setSessionPermissionMode).toHaveBeenCalledWith({ sessionId: "session-1", mode: "full-access" }));
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("does not submit while a turn is running", () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: true as const }));
    window.actspace = { setSessionPermissionMode } as unknown as typeof window.actspace;

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled onChanged={() => undefined} />);

    expect(screen.getByRole("combobox", { name: "会话权限模式" })).toBeDisabled();
    expect(setSessionPermissionMode).not.toHaveBeenCalled();
  });

  it("lists and revokes a Session Grant by id", async () => {
    const revokeSessionGrant = vi.fn(async () => ({ ok: true as const }));
    const onChanged = vi.fn(async () => undefined);
    window.actspace = { revokeSessionGrant } as unknown as typeof window.actspace;
    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={onChanged} grants={[{
      schemaVersion: 1, grantId: "grant-1", sessionId: "session-1", agentId: "main:session-1", audience: { pluginId: "actspace.core-tools", permissionDomain: "core-files", policyVersion: 1 }, action: "file.read", access: "read", selector: { kind: "subtree", canonicalRoot: "/tmp/shared" }, sourceRequestId: "request-1", sourceCallId: "call-1", sourceToolName: "read_file", issuedAt: "2026-09-24T00:00:00Z",
    }]} />);
    fireEvent.click(screen.getByLabelText("管理会话授权"));
    expect(screen.getByText("读取 · 此目录树")).toBeInTheDocument();
    expect(screen.getByText("/tmp/shared")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    await waitFor(() => expect(revokeSessionGrant).toHaveBeenCalledWith({ sessionId: "session-1", grantId: "grant-1" }));
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
