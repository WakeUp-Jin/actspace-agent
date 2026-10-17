import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { App } from "../App";
import { setupBridge } from "./helpers/bridge";

const NEW_ROOT = "/Users/mock/code/new-project";

// 和 main 一样：带 registerWorkspace 的选择会把目录登记进 registry。
function setupRegisteringPicker() {
  const bridge = setupBridge({
    "dialogs.selectWorkspaceDirectory": async (input) => {
      if (input?.registerWorkspace) {
        const now = new Date().toISOString();
        const items = bridge.db.workspaces.items;
        bridge.db.workspaces = { ...bridge.db.workspaces, items: [...items, { id: "ws_new", kind: "folder", label: "new-project", path: NEW_ROOT, order: items.length, createdAt: now, updatedAt: now }] };
      }
      return { canceled: false, workspaceRoot: NEW_ROOT };
    },
  });
  return bridge;
}

it("shows a workspace picked from the composer in the sidebar right away", async () => {
  const user = userEvent.setup();
  setupRegisteringPicker();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "选择工作区" }));
  await user.click(await screen.findByRole("menuitem", { name: "使用已有文件夹…" }));
  expect(await screen.findByRole("button", { name: "new-project" })).toBeInTheDocument();
});

it("shows a workspace added from the sidebar right away", async () => {
  const user = userEvent.setup();
  setupRegisteringPicker();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "添加工作区" }));
  expect(await screen.findByRole("button", { name: "new-project" })).toBeInTheDocument();
});
