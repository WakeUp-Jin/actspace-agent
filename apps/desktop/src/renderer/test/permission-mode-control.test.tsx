import { act, render, screen, waitFor, within } from "@testing-library/react";
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
    // 悬停只写当前模式，不放解释句。
    expect(trigger).toHaveAttribute("title", "权限：自动");
    await user.click(trigger);
    expect(screen.getByRole("menuitemradio", { name: "自动" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("menuitemradio", { name: "替我审批" }));

    await waitFor(() =>
      expect(setSessionPermissionMode).toHaveBeenCalledWith({ sessionId: "session-1", mode: "auto-review" }),
    );
    expect(onChanged).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("shows only icon, name and check in the menu: no hint text, no separator, no grant management", async () => {
    const user = userEvent.setup();
    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "会话权限模式" }));
    const menu = screen.getByRole("menu");
    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "自动",
      "替我审批",
      "完全权限",
    ]);
    expect(within(menu).queryAllByRole("menuitem")).toHaveLength(0);
    for (const text of ["按策略询问", "模型代为判断", "Bash 不进沙箱", "管理会话授权"])
      expect(within(menu).queryByText(text)).toBeNull();
    expect(within(menu).queryByRole("separator")).toBeNull();
    expect(screen.getByRole("menuitemradio", { name: "自动" })).not.toHaveAttribute("aria-description");
  });

  it("asks for confirmation before switching to full access and applies it only after confirming", async () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: true as const }));
    const onChanged = vi.fn(async () => undefined);
    setupBridge({ "sessions.setPermissionMode": setSessionPermissionMode });
    const user = userEvent.setup();

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={onChanged} />);
    const trigger = screen.getByRole("button", { name: "会话权限模式" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitemradio", { name: "完全权限" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("开启完全权限？")).toBeInTheDocument();
    expect(within(dialog).getByText("Bash 命令将不在沙箱中运行，可直接修改本机文件。")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();
    expect(setSessionPermissionMode).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "开启" }));
    await waitFor(() =>
      expect(setSessionPermissionMode).toHaveBeenCalledWith({ sessionId: "session-1", mode: "full-access" }),
    );
    expect(onChanged).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps the current mode when the full access confirmation is cancelled or dismissed with Esc", async () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: true as const }));
    setupBridge({ "sessions.setPermissionMode": setSessionPermissionMode });
    const user = userEvent.setup();

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={() => undefined} />);
    const trigger = screen.getByRole("button", { name: "会话权限模式" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitemradio", { name: "完全权限" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.click(screen.getByRole("menuitemradio", { name: "完全权限" }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(setSessionPermissionMode).not.toHaveBeenCalled();
  });

  it("shows the failure inside the confirmation and keeps it open when enabling full access fails", async () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: false as const, error: "运行中" }));
    setupBridge({ "sessions.setPermissionMode": setSessionPermissionMode });
    const user = userEvent.setup();

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "会话权限模式" }));
    await user.click(screen.getByRole("menuitemradio", { name: "完全权限" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "开启" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("运行中");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("switches away from full access without a confirmation", async () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: true as const }));
    setupBridge({ "sessions.setPermissionMode": setSessionPermissionMode });
    const user = userEvent.setup();

    render(
      <PermissionModeControl sessionId="session-1" mode="full-access" disabled={false} onChanged={() => undefined} />,
    );
    await user.click(screen.getByRole("button", { name: "会话权限模式" }));
    await user.click(screen.getByRole("menuitemradio", { name: "自动" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() =>
      expect(setSessionPermissionMode).toHaveBeenCalledWith({ sessionId: "session-1", mode: "default" }),
    );
  });

  it("keeps the menu open when saving fails", async () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: false as const, error: "运行中" }));
    const onChanged = vi.fn();
    setupBridge({ "sessions.setPermissionMode": setSessionPermissionMode });
    const user = userEvent.setup();

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={onChanged} />);
    await user.click(screen.getByRole("button", { name: "会话权限模式" }));
    await user.click(screen.getByRole("menuitemradio", { name: "替我审批" }));

    await waitFor(() => expect(setSessionPermissionMode).toHaveBeenCalledOnce());
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("disables the options while saving and gives focus back to the trigger once the refresh finishes", async () => {
    let finishSave: (value: { ok: true }) => void = () => {};
    let finishRefresh: () => void = () => {};
    setupBridge({
      "sessions.setPermissionMode": vi.fn(
        () =>
          new Promise((resolve) => {
            finishSave = resolve;
          }),
      ),
    });
    const onChanged = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    const user = userEvent.setup();

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={onChanged} />);
    const trigger = screen.getByRole("button", { name: "会话权限模式" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitemradio", { name: "替我审批" }));
    expect(screen.getByRole("menuitemradio", { name: "自动" })).toHaveAttribute("aria-disabled", "true");
    expect(trigger).toBeDisabled();

    await act(async () => finishSave({ ok: true }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(trigger).not.toHaveFocus();

    await act(async () => finishRefresh());
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveFocus();
  });

  it("closes the menu when the session changes", async () => {
    const user = userEvent.setup();
    const view = render(
      <PermissionModeControl sessionId="session-1" mode="default" disabled={false} onChanged={() => undefined} />,
    );
    await user.click(screen.getByRole("button", { name: "会话权限模式" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    view.rerender(
      <PermissionModeControl sessionId="session-2" mode="default" disabled={false} onChanged={() => undefined} />,
    );
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("is keyboard operable: opens on the current mode, picking it again only closes, Esc returns focus", async () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: true as const }));
    setupBridge({ "sessions.setPermissionMode": setSessionPermissionMode });
    const user = userEvent.setup();

    render(
      <PermissionModeControl sessionId="session-1" mode="full-access" disabled={false} onChanged={() => undefined} />,
    );
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

  it("keeps mode changes disabled while a turn is running", async () => {
    const setSessionPermissionMode = vi.fn(async () => ({ ok: true as const }));
    setupBridge({ "sessions.setPermissionMode": setSessionPermissionMode });

    render(<PermissionModeControl sessionId="session-1" mode="default" disabled onChanged={() => undefined} />);

    await userEvent.click(screen.getByRole("button", { name: "会话权限模式" }));
    expect(screen.getByRole("menuitemradio", { name: "完全权限" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(setSessionPermissionMode).not.toHaveBeenCalled();
  });
});

it("selects automatic review independently of full access", async () => {
  const save = vi.fn(async () => ({ ok: true as const }));
  setupBridge({ "sessions.setPermissionMode": save });
  const user = userEvent.setup();
  render(
    <PermissionModeControl sessionId="auto-session" mode="default" disabled={false} onChanged={() => undefined} />,
  );
  await user.click(screen.getByRole("button", { name: "会话权限模式" }));
  await user.click(screen.getByRole("menuitemradio", { name: "替我审批" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ sessionId: "auto-session", mode: "auto-review" }));
});
