import { afterEach, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import type { SessionListItem } from "@actspace/shared";
import { App } from "../App";
import { projectionFixture } from "./projection-fixture";
import { setupBridge } from "./helpers/bridge";

afterEach(() => { window.localStorage.clear(); });
function fixture(initial = false, background = false) {
  const id = "host:" + btoa(JSON.stringify(["server", "same-session"]));
  const backgroundId = "host:" + btoa(JSON.stringify(["server", "background-session"]));
  const rowsFor = (state: SessionListItem["connectionState"]) => background ? [row(state), { ...row(state), id: backgroundId, title: "Older remote", updatedAt: "2026-10-03T00:00:00Z" }] : [row(state)];
  let rows: SessionListItem[] = initial ? rowsFor("revoked") : [];
  function row(state: SessionListItem["connectionState"]): SessionListItem {
    return { id, hostId: "server", hostName: "Cloud", connectionState: state, title: "Remote history", workspaceRoot: "/tmp/workspace", agentRunCount: 0, updatedAt: "2026-10-04T00:00:00Z" };
  }
  const hostListeners = new Set<(hosts: unknown[]) => void>();
  let hosts: unknown[] = initial ? [{ hostId: "server", name: "Cloud", state: "revoked" }] : [];
  const listeners = new Set<(event: unknown) => void>();
  const listPage = vi.fn(async () => ({ items: rows, groups: rows.length ? [{ hostId: "server", workspaceRoot: "/tmp/workspace", pinned: false, hasMore: false }] : [], indexing: false, failed: 0 }));
  const listPending = vi.fn(async (_input: { sessionId: string }) => []);
  setupBridge({
    "hosts.list": async () => hosts,
    "events.hostsChanged": (callback: (hosts: unknown[]) => void) => { hostListeners.add(callback); return () => { hostListeners.delete(callback); }; },
    "events.hostEvent": () => () => {}, "events.hostUploadProgress": () => () => {}, "hosts.activate": async () => {},
    "hosts.call": async () => ({ state: "ready", workspaces: [], models: [], defaultModel: "" }),
    "app.getBootstrapState": async () => ({ appVersion: "test", dataRoot: "/tmp/test", sessionRoot: "/tmp/test", logRoot: "/tmp/test", tmpRoot: "/tmp/test", workspaceRoot: "/tmp/workspace" }),
    "workspaces.list": async () => ({ version: 1, defaultWorkspaceId: "default", items: [] }),
    "sessions.list": async () => rows, "sessions.listPage": listPage,
    "sessions.getPage": async () => projectionFixture(id), "approvals.listPending": listPending,
    "events.sessionLive": (callback: (event: unknown) => void) => { listeners.add(callback); return () => listeners.delete(callback); },
    "events.agentStream": () => () => {}, "review.getSnapshot": async () => ({ ok: false }), "visualize.list": async () => ({ items: [] }),
    "appearance.setUiZoom": () => {}, "appearance.setNativeTheme": () => {}, "events.shuttingDown": () => () => {},
  });
  render(<App />);
  return { id, backgroundId, listPage, listPending, remove: () => act(() => { hosts = []; rows = []; for (const listener of hostListeners) listener(hosts); }), connect: (targeted = false) => act(() => {
    rows = rowsFor("connected");
    hosts = [{ hostId: "server", name: "Cloud", state: "connected" }];
    if (!targeted) { for (const listener of hostListeners) listener(hosts); return; }
    for (const listener of listeners) listener({ event: { sessionId: targeted ? id : "", message: "session-title-updated" } });
  }) };
}
it("loads the paged remote group when pairing publishes its connection change", async () => {
  const f = fixture();
  await waitFor(() => expect(f.listPage).toHaveBeenCalled());
  await act(async () => {});
  f.connect();
  await waitFor(() => expect(document.querySelector(`[data-session-id='${f.id}']`)).not.toBeNull());
});
it("refreshes connection metadata as well as the title on a targeted session update", async () => {
  const f = fixture(true);
  await waitFor(() => expect(document.querySelector('.session-row [title="revoked"]')).not.toBeNull());
  f.connect(true);
  await waitFor(() => expect(document.querySelector('.session-row [title="connected"]')).not.toBeNull());
  expect(document.querySelector('.session-row [title="revoked"]')).toBeNull();
});

it("keeps removed Host history remote and offline when refreshing the sidebar", async () => {
  const f = fixture(true);
  await waitFor(() => expect(document.querySelector('.session-row [title="revoked"]')).not.toBeNull());
  f.connect(true);
  await waitFor(() => expect(document.querySelector('.session-row [title="connected"]')).not.toBeNull());
  f.remove();
  await waitFor(() => expect(document.querySelector('.session-row [title="offline"]')).not.toBeNull());
  expect(document.querySelector(`[data-session-id='${f.id}']`)).not.toBeNull();
});

it("re-hydrates a background remote session's approvals once its Host reconnects", async () => {
  const f = fixture(true, true);
  await waitFor(() => expect(f.listPending).toHaveBeenCalledWith({ sessionId: f.backgroundId }));
  await act(async () => {});
  const calls = () => f.listPending.mock.calls.filter(([input]) => input.sessionId === f.backgroundId).length;
  expect(calls()).toBe(1);
  f.connect();
  await waitFor(() => expect(document.querySelectorAll('.session-row [title="connected"]')).toHaveLength(2));
  await waitFor(() => expect(calls()).toBe(2));
});
