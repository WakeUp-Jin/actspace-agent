import { describe, expect, it } from "vitest";
import type { SessionListItem, WorkspaceEntry } from "@actspace/shared";
import {
  groupSessionsByWorkspace,
  isOrphanSession,
  sessionWorkspaceRoot,
  sessionsByGroupKey,
} from "../components/sidebar/session-grouping";

function workspace(id: string, path: string, kind: WorkspaceEntry["kind"] = "folder", label = id): WorkspaceEntry {
  return { id, kind, label, path, order: 0, createdAt: "2026-07-29T00:00:00.000Z", updatedAt: "2026-07-29T00:00:00.000Z" };
}

function session(id: string, updatedAt: string, partial: Partial<SessionListItem> = {}): SessionListItem {
  return { id, title: id, updatedAt, agentRunCount: 0, ...partial };
}

const WORKSPACES = [
  workspace("default", "/Users/me/Documents/ActSpace/default-workspace", "folder", "默认工作区"),
  workspace("ws-a", "/Users/me/a", "folder", "项目 A"),
  workspace("ws-b", "/Users/me/b", "folder", "项目 B"),
];

// 覆盖每一种归组路径：按 id、按路径、没有路径（旧会话，不显示）、未登记的路径、未登记的 id、远端。
const MIXED = [
  session("by-id", "2026-08-01T00:00:00.000Z", { workspaceId: "ws-a", workspaceRoot: "/elsewhere" }),
  session("by-root", "2026-08-03T00:00:00.000Z", { workspaceRoot: "/Users/me/a" }),
  session("no-root", "2026-08-02T00:00:00.000Z"),
  session("empty-root", "2026-07-01T00:00:00.000Z", { workspaceRoot: "" }),
  session("unknown-id-no-root", "2026-07-02T00:00:00.000Z", { workspaceId: "ws-gone" }),
  session("unknown-id-with-root", "2026-07-03T00:00:00.000Z", { workspaceId: "ws-gone", workspaceRoot: "/Users/me/gone/" }),
  session("unregistered-root", "2026-08-05T00:00:00.000Z", { workspaceRoot: "/Users/me/c/" }),
  session("remote-1", "2026-08-04T00:00:00.000Z", { hostId: "h1", hostName: "云端", workspaceRoot: "/srv/app", workspaceId: "ws-a" }),
  session("remote-2", "2026-08-06T00:00:00.000Z", { hostId: "h1", hostName: "云端", workspaceRoot: "/Users/me/a" }),
];

const keyOf = (groups: ReturnType<typeof groupSessionsByWorkspace>, id: string) => groups.find((group) => group.sessions.some((item) => item.id === id))?.key;

describe("groupSessionsByWorkspace", () => {
  it("puts each session into the workspace it belongs to", () => {
    const groups = groupSessionsByWorkspace(MIXED, WORKSPACES);
    expect(keyOf(groups, "by-id")).toBe("ws-a");
    expect(keyOf(groups, "by-root")).toBe("ws-a");
    // 没有路径、也匹配不到工作区的旧会话不显示，不再归到默认工作区。
    expect(keyOf(groups, "no-root")).toBeUndefined();
    expect(keyOf(groups, "empty-root")).toBeUndefined();
    expect(keyOf(groups, "unknown-id-no-root")).toBeUndefined();
    expect(groups.find((group) => group.key === "default")!.sessions).toEqual([]);
    // 未登记的 id、有路径：按 id 自成一组，名称取路径最后一段。
    expect(groups.find((group) => group.key === "ws-gone")).toMatchObject({ label: "gone", workspaceId: "ws-gone", workspaceRoot: "/Users/me/gone/" });
    expect(groups.find((group) => group.key === "/Users/me/c/")).toMatchObject({ label: "c", workspaceRoot: "/Users/me/c/", workspaceId: undefined });
  });

  it("keeps remote sessions apart per host and path, even when the path matches a local workspace", () => {
    const groups = groupSessionsByWorkspace(MIXED, WORKSPACES);
    expect(groups.find((group) => group.key === JSON.stringify(["h1", "/srv/app"]))).toMatchObject({ hostId: "h1", label: "云端 · app", workspaceId: "ws-a", workspaceRoot: "/srv/app" });
    expect(groups.find((group) => group.key === JSON.stringify(["h1", "/Users/me/a"]))).toMatchObject({ hostId: "h1", label: "云端 · a", workspaceId: undefined });
    expect(groups.find((group) => group.key === "ws-a")!.sessions.map((item) => item.id)).toEqual(["by-root", "by-id"]);
  });

  it("labels remote groups with the host name from the directory, then the session, then the host id", () => {
    const remote = [
      session("r1", "2026-08-01T00:00:00.000Z", { hostId: "h1", hostName: "旧名", workspaceRoot: "/srv/app" }),
      session("r2", "2026-08-02T00:00:00.000Z", { hostId: "h2", hostName: "记录名", workspaceRoot: "/srv/web" }),
      session("r3", "2026-08-03T00:00:00.000Z", { hostId: "h3", workspaceRoot: "/srv/api" }),
    ];
    const directory: Record<string, string> = { h1: "新名" };
    const labels = groupSessionsByWorkspace(remote, [], (hostId) => directory[hostId]).map((group) => group.label);
    expect(labels).toEqual(["h3 · api", "记录名 · web", "新名 · app"]);
  });

  it("orders sessions newest first and groups by their newest session, empty workspaces after", () => {
    const groups = groupSessionsByWorkspace([...MIXED, session("no-default", "2026-09-01T00:00:00.000Z")], WORKSPACES);
    expect(groups.map((group) => group.key)).toEqual([
      JSON.stringify(["h1", "/Users/me/a"]),
      "/Users/me/c/",
      JSON.stringify(["h1", "/srv/app"]),
      "ws-a",
      "ws-gone",
      "default",
      "ws-b",
    ]);
    expect(groups.find((group) => group.key === "ws-gone")!.sessions.map((item) => item.id)).toEqual(["unknown-id-with-root"]);
  });

  it("lists every registered workspace even without sessions", () => {
    expect(groupSessionsByWorkspace([], WORKSPACES)).toEqual(WORKSPACES.map((item) => ({ key: item.id, label: item.label, workspaceId: item.id, workspaceRoot: item.path, sessions: [] })));
  });
});

describe("sessionsByGroupKey", () => {
  it("uses the same keys as the sidebar groups and keeps the input order", () => {
    const groups = groupSessionsByWorkspace(MIXED, WORKSPACES);
    const byKey = sessionsByGroupKey(MIXED, WORKSPACES);
    const shown = MIXED.filter((item) => !isOrphanSession(item, WORKSPACES));
    for (const item of shown) expect(byKey.get(keyOf(groups, item.id)!)).toContain(item);
    expect(byKey.has("default")).toBe(false);
    expect([...byKey.values()].flat()).toHaveLength(shown.length);
  });
});

describe("sessionWorkspaceRoot", () => {
  it("resolves the path shown in the row tooltip", () => {
    expect(sessionWorkspaceRoot(MIXED[0]!, WORKSPACES)).toBe("/Users/me/a");
    expect(sessionWorkspaceRoot(MIXED[2]!, WORKSPACES)).toBeUndefined();
    expect(sessionWorkspaceRoot(MIXED[5]!, WORKSPACES)).toBe("/Users/me/gone/");
    expect(sessionWorkspaceRoot(MIXED[7]!, WORKSPACES)).toBe("/srv/app");
    expect(sessionWorkspaceRoot(MIXED[2]!, [])).toBeUndefined();
  });
});

describe("isOrphanSession", () => {
  it("flags only local sessions without a workspace or path", () => {
    expect(MIXED.filter((item) => isOrphanSession(item, WORKSPACES)).map((item) => item.id)).toEqual(["no-root", "empty-root", "unknown-id-no-root"]);
    expect(isOrphanSession(session("by-id-only", "2026-08-01T00:00:00.000Z", { workspaceId: "ws-b" }), WORKSPACES)).toBe(false);
  });
});
