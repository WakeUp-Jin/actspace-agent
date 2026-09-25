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
    fireEvent.click(screen.getByRole("button", { name: "会话权限模式" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "完全权限" }));

    await waitFor(() => expect(setSessionPermissionMode).toHaveBeenCalledWith({ sessionId: "session-1", mode: "full-access" }));
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("does not submit while a turn is running", () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: true as const }));
    window.actspace = { setSessionPermissionMode } as unknown as typeof window.actspace;

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled onChanged={() => undefined} />);

    expect(screen.getByRole("button", { name: "会话权限模式" })).toBeDisabled();
    expect(setSessionPermissionMode).not.toHaveBeenCalled();
  });

  it("does not render a persistent grant management control", () => {
    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={() => undefined} />);
    expect(screen.queryByLabelText("管理会话授权")).not.toBeInTheDocument();
  });
});
