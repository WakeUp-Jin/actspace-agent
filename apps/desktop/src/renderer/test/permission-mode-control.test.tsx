import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PermissionModeControl } from "../components/workbench/PermissionModeControl";
import { setupBridge } from "./helpers/bridge";

describe("PermissionModeControl", () => {
  it("persists a mode change and refreshes the Session projection", async () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: true as const }));
    const onChanged = vi.fn(async () => undefined);
    setupBridge({ "sessions.setPermissionMode": setSessionPermissionMode });
    const user = userEvent.setup();

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={onChanged} />);
    const trigger = screen.getByRole("button", { name: "会话权限模式" });
    expect(trigger).toHaveAttribute("title", expect.stringContaining("自动批准通过策略检查的 Bash"));
    await user.click(trigger);
    expect(screen.getByRole("menuitemradio", { name: "自动" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("menuitemradio", { name: "完全权限" }));

    await waitFor(() => expect(setSessionPermissionMode).toHaveBeenCalledWith({ sessionId: "session-1", mode: "full-access" }));
    expect(onChanged).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps the menu open when saving fails", async () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: false as const, error: { code: "busy", message: "运行中" } }));
    const onChanged = vi.fn();
    setupBridge({ "sessions.setPermissionMode": setSessionPermissionMode });
    const user = userEvent.setup();

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={onChanged} />);
    await user.click(screen.getByRole("button", { name: "会话权限模式" }));
    await user.click(screen.getByRole("menuitemradio", { name: "完全权限" }));

    await waitFor(() => expect(setSessionPermissionMode).toHaveBeenCalledOnce());
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("disables the options while saving and gives focus back to the trigger once the refresh finishes", async () => {
    let finishSave: (value: { ok: true }) => void = () => {};
    let finishRefresh: () => void = () => {};
    setupBridge({ "sessions.setPermissionMode": vi.fn(() => new Promise((resolve) => { finishSave = resolve; })) });
    const onChanged = vi.fn(() => new Promise<void>((resolve) => { finishRefresh = resolve; }));
    const user = userEvent.setup();

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={onChanged} />);
    const trigger = screen.getByRole("button", { name: "会话权限模式" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitemradio", { name: "完全权限" }));
    expect(screen.getByRole("menuitemradio", { name: "自动" })).toHaveAttribute("aria-disabled", "true");
    expect(trigger).toBeDisabled();

    await act(async () => finishSave({ ok: true }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(trigger).not.toHaveFocus();

    await act(async () => finishRefresh());
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveFocus();
  });

  it("closes the menu when the session changes", async () => {
    const user = userEvent.setup();
    const view = render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "会话权限模式" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    view.rerender(<PermissionModeControl sessionId="session-2" mode="default" disabled={false} onChanged={() => undefined} />);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("is keyboard operable: opens on the current mode, picking it again only closes, Esc returns focus", async () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: true as const }));
    setupBridge({ "sessions.setPermissionMode": setSessionPermissionMode });
    const user = userEvent.setup();

    render(<PermissionModeControl sessionId="session-1" mode="full-access" disabled={false} onChanged={() => undefined} />);
    const trigger = screen.getByRole("button", { name: "会话权限模式" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("menuitemradio", { name: "自动" })).toHaveFocus());
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitemradio", { name: "完全权限" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(setSessionPermissionMode).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("does not submit while a turn is running", () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: true as const }));
    setupBridge({ "sessions.setPermissionMode": setSessionPermissionMode });

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled onChanged={() => undefined} />);

    expect(screen.getByRole("button", { name: "会话权限模式" })).toBeDisabled();
    expect(setSessionPermissionMode).not.toHaveBeenCalled();
  });

  it("does not render a persistent grant management control", () => {
    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={() => undefined} />);
    expect(screen.queryByLabelText("管理会话授权")).not.toBeInTheDocument();
  });
});
