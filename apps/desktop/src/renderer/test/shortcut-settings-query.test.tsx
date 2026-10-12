import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SessionSearch } from "../components/sidebar/SessionSearch";
import { ShortcutSettings } from "../components/settings/ShortcutSettings";
import { setupBridge } from "./helpers/bridge";

it("does not load all historical Sessions when General settings opens", async () => {
  const list = vi.fn(async () => []);
  const listPage = vi.fn(async () => ({ items: [], groups: [], indexing: false, failed: 0 }));
  const bridge = setupBridge({ "sessions.list": list, "sessions.listPage": listPage });
  render(<ShortcutSettings settings={bridge.db.settings} onSettingsChange={() => {}} />);
  expect(await screen.findByRole("switch", { name: "启用快速唤起" })).toBeInTheDocument();
  expect(list).not.toHaveBeenCalled(); expect(listPage).not.toHaveBeenCalled();
});

it("searches paged Session metadata only on demand and can choose a later page", async () => {
  const user = userEvent.setup();
  const list = vi.fn(async () => { throw new Error("Must not replay all Sessions"); });
  const row = (id: string) => ({ id, title: `Target ${id}`, updatedAt: "2026-10-11T00:00:00.000Z", agentRunCount: 0 });
  const listPage = vi.fn(async (input?: { after?: string }) => ({ items: [row(input?.after ? "later" : "first")], groups: [], indexing: false, failed: 0, ...(input?.after ? {} : { nextCursor: "first" }) }));
  const bridge = setupBridge({ "sessions.list": list, "sessions.listPage": listPage });
  const update = vi.fn(async () => ({ ok: true as const, settings: bridge.db.settings, status: { registered: true, accelerator: "CommandOrControl+Shift+Space" } }));
  bridge.override({ quickOpen: { updateShortcut: update } });
  render(<ShortcutSettings settings={{ ...bridge.db.settings, shortcuts: { quickOpen: { enabled: true, accelerator: "CommandOrControl+Shift+Space", target: { kind: "session", sessionId: "old" } } } }} onSettingsChange={() => {}} />);
  await user.click(screen.getByRole("button", { name: "选择快速唤起会话" }));
  await user.type(screen.getByRole("textbox", { name: "搜索会话标题和片段" }), "Target");
  await screen.findByRole("button", { name: "Target first" });
  await user.click(screen.getByRole("button", { name: "下一页结果" }));
  await user.click(await screen.findByRole("button", { name: "Target later" }));
  await waitFor(() => expect(update).toHaveBeenCalledWith({ target: { kind: "session", sessionId: "later" } }));
  expect(listPage).toHaveBeenLastCalledWith({ search: "Target", limit: 50, after: "first" });
  expect(list).not.toHaveBeenCalled();
});

it("disabling an open Session picker hides results and cancels late query display", async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  setupBridge({ "sessions.listPage": async () => ({ items: [{ id: "first", title: "Target first", updatedAt: "2026-10-11T00:00:00.000Z", agentRunCount: 0 }], groups: [], indexing: false, failed: 0 }) });
  const view = render(<SessionSearch onSelect={select} />);
  await user.click(screen.getByRole("button", { name: "搜索本机会话" }));
  await user.type(screen.getByRole("textbox", { name: "搜索会话标题和片段" }), "Target");
  await screen.findByRole("button", { name: "Target first" });
  view.rerender(<SessionSearch onSelect={select} disabled />);
  expect(screen.queryByRole("button", { name: "Target first" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "搜索本机会话" })).toBeDisabled();
  expect(select).not.toHaveBeenCalled();
});
