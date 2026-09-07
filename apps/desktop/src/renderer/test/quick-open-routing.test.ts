import { describe, expect, it } from "vitest";
import type { QuickOpenShortcutSettings, SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { orderQuickOpenProjects, resolveQuickOpenTarget } from "../quick-open-routing";
import { acceleratorFromKeyboardEvent } from "../components/settings/ShortcutSettings";

function workspace(id: string, order: number, kind: WorkspaceEntry["kind"] = "folder"): WorkspaceEntry {
  return {
    id,
    kind,
    label: id,
    path: `/projects/${id}`,
    order,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

const automatic: QuickOpenShortcutSettings = {
  enabled: true,
  accelerator: "CommandOrControl+Shift+Space",
  target: { kind: "automatic" },
};

describe("quick open routing", () => {
  it("orders visible projects like the sidebar: latest session first, registry order as fallback", () => {
    const workspaces = [workspace("default", 0, "default"), workspace("alpha", 1), workspace("beta", 2)];
    const sessions: SessionListItem[] = [
      { id: "a", title: "A", workspaceId: "alpha", updatedAt: "2026-08-01T08:00:00.000Z", agentRunCount: 1 },
      { id: "b", title: "B", workspaceId: "beta", updatedAt: "2026-08-01T09:00:00.000Z", agentRunCount: 1 },
    ];
    expect(orderQuickOpenProjects(workspaces, sessions).map((item) => item.id)).toEqual(["beta", "alpha"]);
  });

  it("uses an existing configured session and falls back from a stale target", () => {
    const projects = [workspace("alpha", 1)];
    const sessions: SessionListItem[] = [
      { id: "session-1", title: "One", workspaceId: "alpha", updatedAt: "2026-08-01T09:00:00.000Z", agentRunCount: 1 },
    ];
    expect(resolveQuickOpenTarget({ ...automatic, target: { kind: "session", sessionId: "session-1" } }, projects, sessions))
      .toEqual({ kind: "session", sessionId: "session-1" });
    expect(resolveQuickOpenTarget({ ...automatic, target: { kind: "session", sessionId: "missing" } }, projects, sessions))
      .toEqual({ kind: "workspace", workspaceId: "alpha", workspaceRoot: "/projects/alpha" });
  });

  it("opens an empty chat when no project exists", () => {
    expect(resolveQuickOpenTarget(automatic, [workspace("default", 0, "default")], [])).toEqual({ kind: "empty" });
  });

  it("turns a keyboard chord into an Electron accelerator", () => {
    expect(acceleratorFromKeyboardEvent({ key: " ", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }))
      .toBe("CommandOrControl+Shift+Space");
    expect(acceleratorFromKeyboardEvent({ key: "a", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }))
      .toBeNull();
  });
});
