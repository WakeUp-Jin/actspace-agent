import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { HostConnection } from "@actspace/shared/host-protocol";
import { RunTargetRow, type RunTargetField, type RunTargetRowProps } from "../components/composer/RunTargetRow";
import { describeReadiness } from "../target/readiness";
import { capabilitiesOf, type RunTarget } from "../target/run-target";

const LOCAL: RunTarget = { kind: "local", branch: "main" };
const REMOTE: RunTarget = { kind: "remote", hostId: "dev", hostName: "dev-box", workspaceId: "api", workspaceName: "api-server" };
const HOSTS: HostConnection[] = [{ id: "dev", hostId: "dev", name: "dev-box", state: "connected", endpoint: { kind: "wss", url: "wss://dev" } }];
const DESCRIPTION = { state: "ready", workspaces: [{ id: "api", name: "api-server", path: "/srv/api" }, { id: "web", name: "web", path: "/srv/web" }], models: [], defaultModel: "" };

function renderRow(overrides: Partial<Omit<RunTargetRowProps, "openField" | "onOpenChange" | "local">> & { local?: Partial<RunTargetRowProps["local"]> } = {}) {
  const calls = {
    onSelectHost: vi.fn(), onSelectRemoteWorkspace: vi.fn(), onConnectHost: vi.fn(),
    onSelectWorkspace: vi.fn(), onUseExistingWorkspace: vi.fn(), onCreateWorkspaceFolder: vi.fn(), onSelectBranch: vi.fn(), onSelectRunLocation: vi.fn(),
  };
  const target = overrides.target ?? LOCAL;
  function Harness() {
    const [openField, setOpenField] = useState<RunTargetField | null>(null);
    return (
      <RunTargetRow
        openField={openField}
        onOpenChange={(field, open) => setOpenField((current) => (open ? field : current === field ? null : current))}
        target={target}
        notReady={overrides.notReady ?? null}
        locationOnly={overrides.locationOnly}
        hosts={overrides.hosts ?? HOSTS}
        remoteDescription={overrides.remoteDescription}
        onSelectHost={calls.onSelectHost}
        onSelectRemoteWorkspace={calls.onSelectRemoteWorkspace}
        onConnectHost={calls.onConnectHost}
        local={{
          workspaces: [{ value: "/work/actspace", label: "actspace" }, { value: "/work/wiki", label: "wiki" }],
          selectedWorkspaceRoot: "/work/actspace",
          workspaceLabel: "actspace",
          branchLabel: "main",
          branches: [{ name: "main" }, { name: "dev" }],
          selectedBranch: "main",
          runLocation: "this_mac",
          newWorktree: capabilitiesOf(target, { gitStatus: "ready" }).newWorktree,
          onSelectWorkspace: calls.onSelectWorkspace,
          onUseExistingWorkspace: calls.onUseExistingWorkspace,
          onCreateWorkspaceFolder: calls.onCreateWorkspaceFolder,
          onSelectBranch: calls.onSelectBranch,
          onSelectRunLocation: calls.onSelectRunLocation,
          ...overrides.local,
        }}
      />
    );
  }
  render(<Harness />);
  return calls;
}

afterEach(() => cleanup());

describe("RunTargetRow", () => {
  it("shows three text buttons on the local machine and selects a branch", async () => {
    const user = userEvent.setup();
    const calls = renderRow();
    const row = screen.getByLabelText("初始工作区与运行位置选择");
    expect(within(row).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["选择工作区", "选择分支", "选择运行位置"]);
    for (const button of within(row).getAllByRole("button")) {
      expect(button).toHaveClass("h-7", "text-act-md", "text-text-muted", "hover:text-text-main", "hover:bg-hover-overlay", "rounded-act-sm");
      expect(button).toHaveAttribute("aria-haspopup", "menu");
    }
    expect(screen.getByRole("button", { name: "选择运行位置" })).toHaveTextContent("本机");

    await user.click(screen.getByRole("button", { name: "选择分支" }));
    await user.click(screen.getByRole("menuitemradio", { name: "dev" }));
    expect(calls.onSelectBranch).toHaveBeenCalledWith("dev");
  });

  it("selecting 本机 also leaves a remote Host", async () => {
    const user = userEvent.setup();
    const calls = renderRow({ target: REMOTE, remoteDescription: DESCRIPTION });
    await user.click(screen.getByRole("button", { name: "选择运行位置" }));
    await user.click(screen.getByRole("menuitemradio", { name: "本机" }));
    expect(calls.onSelectHost).toHaveBeenCalledWith(null);
    expect(calls.onSelectRunLocation).toHaveBeenCalledWith("this_mac");
  });

  it("creates a workspace folder inside the menu without the menu stealing keys", async () => {
    const user = userEvent.setup();
    const calls = renderRow();
    await user.click(screen.getByRole("button", { name: "选择工作区" }));
    await user.click(screen.getByRole("menuitem", { name: "新建文件夹" }));
    const name = screen.getByRole("textbox", { name: "新文件夹名称" });
    expect(name).toHaveFocus();
    // 字母不被菜单当作首字母跳转（「w」会跳到 wiki 那一项），空格不被当作选择。
    await user.keyboard("wiki notes");
    expect(name).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(calls.onCreateWorkspaceFolder).toHaveBeenCalledWith("wiki notes");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择工作区" }));
    await user.click(screen.getByRole("menuitem", { name: "使用已有文件夹…" }));
    expect(calls.onUseExistingWorkspace).toHaveBeenCalledTimes(1);
  });

  it("hides the branch on a remote Host and lists the Host's workspaces by name with the path below", async () => {
    const user = userEvent.setup();
    const calls = renderRow({ target: REMOTE, remoteDescription: DESCRIPTION });
    expect(screen.queryByRole("button", { name: "选择分支" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择工作区" })).toHaveTextContent("api-server");
    expect(screen.getByRole("button", { name: "选择运行位置" })).toHaveTextContent("dev-box");
    await user.click(screen.getByRole("button", { name: "选择工作区" }));
    const menu = screen.getByRole("menu", { name: "选择工作区" });
    expect(within(menu).getByText("dev-box 上的工作区")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: /^api-server/ })).toHaveAttribute("aria-checked", "true");
    const web = within(menu).getByRole("menuitemradio", { name: /^web/ });
    expect(web).toHaveTextContent("/srv/web");
    await user.click(web);
    expect(calls.onSelectRemoteWorkspace).toHaveBeenCalledWith("web");
  });

  it("waits for the Host's workspaces before it has a description", async () => {
    const user = userEvent.setup();
    renderRow({ target: { kind: "remote", hostId: "dev", hostName: "dev-box" } });
    expect(screen.getByRole("button", { name: "选择工作区" })).toHaveTextContent("等待 Host 工作区");
    await user.click(screen.getByRole("button", { name: "选择工作区" }));
    expect(screen.queryAllByRole("menuitemradio")).toEqual([]);
  });

  it("shows the readiness dot and short label next to a Host that is not ready", () => {
    renderRow({ target: REMOTE, notReady: describeReadiness({ state: "connecting" }, "dev-box") });
    const location = screen.getByRole("button", { name: "选择运行位置" });
    expect(location).toHaveTextContent("dev-box连接中");
    expect(location.querySelector("[data-tone]")).toHaveAttribute("data-tone", "pending");
  });

  it("shows only the run location for Chat", () => {
    renderRow({ target: REMOTE, remoteDescription: DESCRIPTION, locationOnly: true });
    const row = screen.getByLabelText("初始工作区与运行位置选择");
    expect(within(row).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["选择运行位置"]);
  });
});
