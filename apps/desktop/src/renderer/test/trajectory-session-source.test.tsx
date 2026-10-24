import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeV2TrajectorySnapshot, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { TrajectoryView } from "../components/TrajectoryView";
import { TrajectoryNavigationProvider, useTrajectoryNavigation } from "../components/trajectory/TrajectoryNavigation";
import { TooltipProvider } from "../components/ui/Tooltip";
import { SessionProjectionProvider } from "../session";
import { projectionFixture } from "./projection-fixture";
import { setupBridge } from "./helpers/bridge";

// 记下 Provider 建出的 bridge 上每次 watch 和它返回的释放函数。
const watches = vi.hoisted(() => ({ calls: [] as string[], disposed: [] as string[] }));
vi.mock("../session/desktop-session-bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../session/desktop-session-bridge")>();
  return {
    ...actual,
    createDesktopSessionBridge: (...args: Parameters<typeof actual.createDesktopSessionBridge>) => {
      const bridge = actual.createDesktopSessionBridge(...args);
      const watch = bridge.watch.bind(bridge);
      bridge.watch = (sessionId: string) => {
        watches.calls.push(sessionId);
        const dispose = watch(sessionId);
        return () => { watches.disposed.push(sessionId); dispose(); };
      };
      return bridge;
    },
  };
});

const envelope = (seq: number, type: string, data: Record<string, unknown>): SessionEventEnvelopeV1 => ({
  recordKind: "event", seq, type, eventVersion: 1, criticality: "ignorable", time: `2026-10-21T00:00:0${seq}.000Z`,
  source: { ownerPluginId: "@actspace/core" }, data: data as SessionEventEnvelopeV1["data"], surface: null,
  provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null },
});
const sessionEvents = (tool: string) => [
  envelope(0, "turn/start", { turnId: "t" }),
  envelope(1, "tool/call", { turnId: "t", callId: `${tool}-call`, name: tool, arguments: {} }),
  envelope(2, "turn/end", { turnId: "t", status: "completed" }),
];

describe("TrajectoryView with an explicit session", () => {
  it("shows the watched child session instead of the selected one and releases it on unmount", async () => {
    watches.calls.length = 0; watches.disposed.length = 0;
    setupBridge({
      "sessions.getProjectionSnapshot": async ({ sessionId }: { sessionId: string }) =>
        projectionFixture(sessionId, 2, sessionEvents(sessionId === "child" ? "grep" : "agent")),
      "events.sessionLive": () => () => undefined,
    });
    const view = render(<TooltipProvider>
      <SessionProjectionProvider sessionId="parent">
        <TrajectoryView sessionId="child" variant="panel" />
      </SessionProjectionProvider>
    </TooltipProvider>);

    expect(await screen.findByRole("row", { name: /工具，grep/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /工具，agent/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("trajectory-view")).toHaveAttribute("data-variant", "panel");
    expect(watches.calls).toEqual(["child"]);
    view.unmount();
    expect(watches.disposed).toEqual(["child"]);
  });

  it("leaves Context-panel jumps to the main trajectory", async () => {
    const snapshot: RuntimeV2TrajectorySnapshot = {
      kind: "trajectory", schemaVersion: 1, sessionId: "child", throughJournalSeq: 1,
      nodes: [
        { key: "child:0", sessionId: "child", eventSeq: 0, eventType: "turn/start", time: "2026-10-21T00:00:00.000Z", kind: "turn", state: "started", callId: null, data: {} },
        { key: "child:1", sessionId: "child", eventSeq: 1, eventType: "tool/call", time: "2026-10-21T00:00:01.000Z", kind: "tool", state: "observed", callId: "call-1", data: { callId: "call-1", name: "grep" } },
      ],
    };
    render(<TooltipProvider><TrajectoryNavigationProvider onShowTrajectory={() => undefined}>
      <NavigationProbe />
      <TrajectoryView snapshot={snapshot} variant="panel" />
    </TrajectoryNavigationProvider></TooltipProvider>);

    await userEvent.click(screen.getByRole("button", { name: "reveal" }));
    await waitFor(() => expect(screen.getByTestId("pending")).toHaveTextContent("1"));
    expect(screen.getByRole("row", { name: /工具，grep/ })).not.toHaveAttribute("data-selected", "true");
    expect(screen.queryByRole("complementary", { name: "事件详情" })).not.toBeInTheDocument();
  });
});

function NavigationProbe() {
  const navigation = useTrajectoryNavigation();
  return <>
    <button type="button" onClick={() => navigation?.revealInTrajectory({ callId: "call-1" })}>reveal</button>
    <span data-testid="pending">{navigation?.pending?.seq ?? "none"}</span>
  </>;
}
