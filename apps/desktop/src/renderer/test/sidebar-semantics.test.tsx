import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionListItem } from "@actspace/shared";
import { TestSidebar } from "./helpers/workbench";
import { TooltipProvider } from "../components/ui/Tooltip";

const WORKSPACE_ROOT = "/Users/me/projects/actspace-agent";

const SESSIONS: SessionListItem[] = ["s-idle", "s-running", "s-busy", "s-waiting", "s-failed", "s-unknown"].map((id) => ({
  id,
  title: id,
  workspaceRoot: WORKSPACE_ROOT,
  updatedAt: "2026-07-29T00:00:00.000Z",
  agentRunCount: 1,
}));

function renderSidebar() {
  return render(
    <TooltipProvider delayDuration={0}>
      <TestSidebar
        sessions={SESSIONS}
        workspaces={[
          {
            id: "ws-actspace",
            kind: "folder",
            label: "actspace-agent",
            path: WORKSPACE_ROOT,
            order: 0,
            createdAt: "2026-07-29T00:00:00.000Z",
            updatedAt: "2026-07-29T00:00:00.000Z",
          },
        ]}
        activeSessionId="s-running"
        mode="expanded"
        view="chat"
        busySessionIds={new Set(["s-busy"])}
        sessionStatuses={{ "s-running": "running", "s-waiting": "waiting_approval", "s-failed": "failed", "s-unknown": "archived" }}
      />
    </TooltipProvider>,
  );
}

function row(container: HTMLElement, sessionId: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-session-id="${sessionId}"]`);
  if (!element) throw new Error(`missing session row ${sessionId}`);
  return element;
}

describe("Sidebar semantics", () => {
  it("marks only the selected session as the current page", () => {
    const { container } = renderSidebar();

    expect(row(container, "s-running").querySelector('[aria-current="page"]')).toHaveTextContent("s-running");
    expect(container.querySelectorAll('[data-session-id] [aria-current="page"]')).toHaveLength(1);
  });

  it("exposes the resolved session status on the status dot", () => {
    const { container } = renderSidebar();
    const dotState = (sessionId: string) => row(container, sessionId).querySelector(".session-status-button [data-state]")?.getAttribute("data-state");

    expect(dotState("s-idle")).toBe("idle");
    expect(dotState("s-running")).toBe("running");
    expect(dotState("s-busy")).toBe("running");
    expect(dotState("s-waiting")).toBe("waiting_approval");
    expect(dotState("s-failed")).toBe("failed");
    expect(dotState("s-unknown")).toBe("idle");
  });
});
