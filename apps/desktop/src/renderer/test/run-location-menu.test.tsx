import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { HostConnection } from "@actspace/shared/host-protocol";
import { hostStateLabel, hostStateTone, RunLocationMenu, type RunLocationMenuProps } from "../components/composer/RunLocationMenu";
import { capabilitiesOf, type RunTarget } from "../target/run-target";

function host(hostId: string, name: string, state: HostConnection["state"] = "connected"): HostConnection {
  return { id: hostId, hostId, name, state, endpoint: { kind: "wss", url: `wss://${hostId}` } };
}

const LOCAL: RunTarget = { kind: "local", branch: "main" };
const HOSTS = [host("dev", "dev-box"), host("nas", "nas", "offline"), host("gpu", "gpu-1", "connecting")];

type Overrides = Partial<Omit<RunLocationMenuProps, "open" | "onOpenChange" | "children">>;

function renderMenu(overrides: Overrides = {}) {
  const calls = { onSelectLocal: vi.fn(), onSelectWorktree: vi.fn(), onSelectHost: vi.fn(), onConnectHost: vi.fn() };
  const target = overrides.target ?? LOCAL;
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <RunLocationMenu
        open={open}
        onOpenChange={setOpen}
        target={target}
        runLocation={overrides.runLocation ?? "this_mac"}
        hosts={overrides.hosts ?? HOSTS}
        newWorktree={overrides.newWorktree ?? capabilitiesOf(target, { gitStatus: "ready" }).newWorktree}
        branch={overrides.branch ?? "main"}
        {...calls}
      >
        <button type="button">选择运行位置</button>
      </RunLocationMenu>
    );
  }
  render(<Harness />);
  return calls;
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
// Radix 用 aria-labelledby 指向触发器：主菜单的名字是触发按钮，子菜单的名字是「远端机器」那一项。
const mainMenu = () => screen.getByRole("menu", { name: "选择运行位置" });

async function openHosts(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "选择运行位置" }));
  screen.getByRole("menuitem", { name: /远端机器/ }).focus();
  await user.keyboard("{ArrowRight}");
  return screen.getByRole("menu", { name: /^远端机器/ });
}

afterEach(() => cleanup());

describe("RunLocationMenu", () => {
  it("lists 本机, 远端机器 and 新建工作树 without any coming-soon entries, and selects 本机", async () => {
    const user = userEvent.setup();
    const calls = renderMenu();
    await user.click(screen.getByRole("button", { name: "选择运行位置" }));
    const menu = mainMenu();
    expect(within(menu).getByRole("menuitemradio", { name: "本机" })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitem", { name: "远端机器" })).toHaveAttribute("aria-haspopup", "menu");
    const worktree = within(menu).getByRole("menuitemradio", { name: /新建工作树/ });
    expect(worktree).toHaveAttribute("aria-checked", "false");
    expect(worktree).toHaveTextContent("从 main 创建隔离分支");
    expect(document.body).not.toHaveTextContent("即将推出");
    expect(document.body).not.toHaveTextContent(/云端|Cloud|SSH/);

    await user.click(within(menu).getByRole("menuitemradio", { name: "本机" }));
    expect(calls.onSelectLocal).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("selects a new worktree on the local machine", async () => {
    const user = userEvent.setup();
    const calls = renderMenu({ runLocation: "worktree" });
    await user.click(screen.getByRole("button", { name: "选择运行位置" }));
    const worktree = screen.getByRole("menuitemradio", { name: /新建工作树/ });
    expect(worktree).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "本机" })).toHaveAttribute("aria-checked", "false");
    await user.click(worktree);
    expect(calls.onSelectWorktree).toHaveBeenCalledTimes(1);
  });

  it("disables 新建工作树 with the capability's reason", async () => {
    const user = userEvent.setup();
    const calls = renderMenu({ newWorktree: capabilitiesOf(LOCAL, { gitStatus: "no_head" }).newWorktree });
    await user.click(screen.getByRole("button", { name: "选择运行位置" }));
    const worktree = screen.getByRole("menuitemradio", { name: /新建工作树/ });
    expect(worktree).toHaveAttribute("aria-disabled", "true");
    expect(worktree).toHaveTextContent("需要先创建提交");
    await user.click(worktree);
    expect(calls.onSelectWorktree).not.toHaveBeenCalled();
  });

  it("opens the Host submenu with →, shows a status for Hosts that are not connected, and selects one", async () => {
    const user = userEvent.setup();
    const calls = renderMenu();
    const hosts = await openHosts(user);
    expect(within(hosts).queryByRole("textbox")).not.toBeInTheDocument();
    // jsdom 不排版；窄窗口不出视口靠宽度取 min(260px, 可用宽度)，CDP 480px 实测见执行记录。
    expect(hosts.className).toContain("w-[min(260px,var(--radix-dropdown-menu-content-available-width))]");
    const rows = within(hosts).getAllByRole("menuitemradio");
    expect(rows.map((row) => row.textContent)).toEqual(["dev-box", "nas离线", "gpu-1连接中"]);
    expect(rows.map((row) => row.querySelector("[data-tone]")?.getAttribute("data-tone"))).toEqual(["connected", "offline", "pending"]);
    expect(within(hosts).getByRole("menuitem", { name: "连接新机器…" })).toBeInTheDocument();

    // 不可用的 Host 也能选中，发送由 readiness 禁用。
    await user.click(within(hosts).getByRole("menuitemradio", { name: /nas/ }));
    expect(calls.onSelectHost).toHaveBeenCalledWith("nas");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens 设置 › Agent 服务器 from 连接新机器…", async () => {
    const user = userEvent.setup();
    const calls = renderMenu();
    const hosts = await openHosts(user);
    await user.click(within(hosts).getByRole("menuitem", { name: "连接新机器…" }));
    expect(calls.onConnectHost).toHaveBeenCalledTimes(1);
  });

  it("offers 连接远端机器… instead of the submenu when no Host is configured", async () => {
    const user = userEvent.setup();
    const calls = renderMenu({ hosts: [] });
    await user.click(screen.getByRole("button", { name: "选择运行位置" }));
    expect(screen.queryByRole("menuitem", { name: /远端机器$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "连接远端机器…" }));
    expect(calls.onConnectHost).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("on a remote target marks the Host, and disables 新建工作树 because remote machines do not support it", async () => {
    const user = userEvent.setup();
    const remote: RunTarget = { kind: "remote", hostId: "nas", hostName: "nas" };
    renderMenu({ target: remote, newWorktree: capabilitiesOf(remote).newWorktree });
    await user.click(screen.getByRole("button", { name: "选择运行位置" }));
    expect(screen.getByRole("menuitemradio", { name: "本机" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("menuitem", { name: /远端机器/ })).toHaveTextContent("nas");
    const worktree = screen.getByRole("menuitemradio", { name: /新建工作树/ });
    expect(worktree).toHaveAttribute("aria-disabled", "true");
    expect(worktree).toHaveTextContent("远端机器暂不支持");

    screen.getByRole("menuitem", { name: /远端机器/ }).focus();
    await user.keyboard("{ArrowRight}");
    const hosts = screen.getByRole("menu", { name: /^远端机器/ });
    expect(within(hosts).getByRole("menuitemradio", { name: /nas/ })).toHaveAttribute("aria-checked", "true");
    expect(within(hosts).getByRole("menuitemradio", { name: "dev-box" })).toHaveAttribute("aria-checked", "false");
  });

  it("shows a search box once there are five Hosts, filters by name and moves into the list with ↓", async () => {
    const user = userEvent.setup();
    const calls = renderMenu({ hosts: [...HOSTS, host("ci", "ci-runner"), host("lab", "lab-mac", "revoked")] });
    const hosts = await openHosts(user);
    await settle();
    const search = within(hosts).getByRole("textbox", { name: "搜索机器" });
    expect(search).toHaveFocus();
    // 字母只进搜索框，不触发菜单的首字母跳转；← 不退出子菜单。
    await user.keyboard("lab{ArrowLeft}");
    expect(search).toHaveValue("lab");
    expect(search).toHaveFocus();
    expect(within(hosts).getAllByRole("menuitemradio").map((row) => row.textContent)).toEqual(["lab-mac需要重新配对"]);
    await user.keyboard("{ArrowDown}");
    expect(within(hosts).getByRole("menuitemradio", { name: /lab-mac/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(calls.onSelectHost).toHaveBeenCalledWith("lab");

    await user.click(screen.getByRole("button", { name: "选择运行位置" }));
    const reopened = await (async () => { screen.getByRole("menuitem", { name: /远端机器/ }).focus(); await user.keyboard("{ArrowRight}"); await settle(); return screen.getByRole("menu", { name: /^远端机器/ }); })();
    await user.type(within(reopened).getByRole("textbox", { name: "搜索机器" }), "zzz");
    expect(within(reopened).queryAllByRole("menuitemradio")).toEqual([]);
    expect(within(reopened).getByText("没有匹配的机器")).toBeInTheDocument();
  });

  it("maps Host connection states to the readiness tone and label", () => {
    expect(hostStateTone("connected")).toBe("connected");
    expect(hostStateLabel("connected")).toBeNull();
    expect([hostStateTone("connecting"), hostStateLabel("connecting")]).toEqual(["pending", "连接中"]);
    expect([hostStateTone("offline"), hostStateLabel("offline")]).toEqual(["offline", "离线"]);
    expect([hostStateTone("revoked"), hostStateLabel("revoked")]).toEqual(["error", "需要重新配对"]);
    expect([hostStateTone("incompatible"), hostStateLabel("incompatible")]).toEqual(["error", "版本不兼容"]);
  });
});
