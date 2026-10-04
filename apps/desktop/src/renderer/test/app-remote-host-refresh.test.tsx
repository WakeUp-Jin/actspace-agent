import { afterEach, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import type { SessionListItem } from "@actspace/shared";
import { App } from "../App";
import { projectionFixture } from "./projection-fixture";

afterEach(() => { delete (window as { actspace?: unknown }).actspace; delete (window as { actspaceHosts?: unknown }).actspaceHosts; window.localStorage.clear(); });
function fixture(initial = false) {
  const id = "host:" + btoa(JSON.stringify(["server", "same-session"]));
  let rows: SessionListItem[] = initial ? [row("revoked")] : [];
  function row(state: SessionListItem["connectionState"]): SessionListItem {
    return { id, hostId: "server", hostName: "Cloud", connectionState: state, title: "Remote history", workspaceRoot: "/tmp/workspace", agentRunCount: 0, updatedAt: "2026-10-04T00:00:00Z" };
  }
  const hostListeners = new Set<(hosts: unknown[]) => void>();
  let hosts: unknown[] = initial ? [{ hostId: "server", name: "Cloud", state: "revoked" }] : [];
  window.actspaceHosts = { list: async () => hosts, onChanged: (callback: (hosts: unknown[]) => void) => { hostListeners.add(callback); return () => hostListeners.delete(callback); }, onEvent: () => () => {}, onUploadProgress: () => () => {}, activate: async () => {}, call: async () => ({ state: "ready", workspaces: [], models: [], defaultModel: "" }) } as unknown as Window["actspaceHosts"];
  const listeners = new Set<(event: unknown) => void>();
  const listPage = vi.fn(async () => ({ items: rows, groups: rows.length ? [{ hostId: "server", workspaceRoot: "/tmp/workspace", pinned: false, hasMore: false }] : [], indexing: false, failed: 0 }));
  window.actspace = {
    getBootstrapState: async () => ({ appVersion: "test", dataRoot: "/tmp/test", sessionRoot: "/tmp/test", logRoot: "/tmp/test", tmpRoot: "/tmp/test", workspaceRoot: "/tmp/workspace" }),
    listWorkspaces: async () => ({ version: 1, defaultWorkspaceId: "default", items: [] }),
    listSessions: async () => rows, listSessionPage: listPage,
    getSessionPage: async () => projectionFixture(id), listPendingApprovals: async () => [],
    onSessionLiveEvent: (callback: (event: unknown) => void) => { listeners.add(callback); return () => listeners.delete(callback); },
    onAgentStream: () => () => {}, getReviewSnapshot: async () => ({ ok: false }), listVisualizations: async () => ({ items: [] }),
    setUiZoom: () => {}, setNativeTheme: () => {}, onShuttingDown: () => () => {},
  } as unknown as Window["actspace"];
  render(<App />);
  return { id, listPage, remove: () => act(() => { hosts = []; rows = []; for (const listener of hostListeners) listener(hosts); }), connect: (targeted = false) => act(() => {
    rows = [row("connected")];
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
