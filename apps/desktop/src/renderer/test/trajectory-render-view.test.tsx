import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import { loadTrajectoryFixture } from "../trajectory/fixtures";
import { TrajectoryView } from "../components/TrajectoryView";
import { SessionProjectionProvider } from "../session";
import { projectionFixture } from "./projection-fixture";
import type { SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";

const snapshot: RuntimeV2TrajectorySnapshot = {
  kind: "trajectory",
  schemaVersion: 1,
  sessionId: "session-1",
  throughJournalSeq: 2,
  nodes: [
    { key: "session-1:0", sessionId: "session-1", eventSeq: 0, eventType: "turn/start", time: "2026-08-31T00:00:00.000Z", kind: "turn", state: "started", callId: null, data: {} },
    { key: "session-1:1", sessionId: "session-1", eventSeq: 1, eventType: "tool/call", time: "2026-08-31T00:00:01.000Z", kind: "tool", state: "observed", callId: "call-1", data: { callId: "call-1" } },
    { key: "session-1:2", sessionId: "session-1", eventSeq: 2, eventType: "turn/end", time: "2026-08-31T00:00:02.000Z", kind: "turn", state: "completed", callId: null, data: {} },
  ],
};

describe("TrajectoryView", () => {
  afterEach(() => {
    delete (window as { actspace?: unknown }).actspace;
  });

  it("renders the Journal projection nodes with stable sequence identity", () => {
    render(<TrajectoryView snapshot={snapshot} />);
    expect(screen.getByTestId("trajectory-view")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Trajectory timeline" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Trajectory events" })).toBeInTheDocument();
    expect(screen.queryByText("turn/start")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1);
    expect(screen.getAllByRole("row").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("row").find((row) => row.getAttribute("data-event-seq") === "1")).toBeInTheDocument();
  });

  it("renders a clear empty state when the projection is unavailable", () => {
    render(<TrajectoryView snapshot={null} />);
    expect(screen.getByText(/暂无可展示的 Agent 轨迹/)).toBeInTheDocument();
  });

  it("reads the active Session trajectory directly from ClientSessionStore selectors", async () => {
    const events: SessionEventEnvelopeV1[] = snapshot.nodes.map(node => ({
      recordKind: "event",
      seq: node.eventSeq,
      type: node.eventType,
      eventVersion: 1,
      criticality: "ignorable",
      time: node.time,
      source: { ownerPluginId: "@actspace/core" },
      data: node.data,
      surface: null,
      provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null },
    }));
    const projection = projectionFixture("session-1", snapshot.throughJournalSeq, events);
    (window as { actspace?: unknown }).actspace = {
      getSessionProjectionSnapshot: async () => projection,
      onSessionLiveEvent: () => () => undefined,
    };

    render(
      <SessionProjectionProvider sessionId="session-1">
        <TrajectoryView />
      </SessionProjectionProvider>,
    );

    await waitFor(() => expect(screen.getByRole("table", { name: "Trajectory events" })).toBeInTheDocument());
  });

  it("provides the dense overview, turn folding, search, and event details", async () => {
    const user = userEvent.setup();
    const richSnapshot: RuntimeV2TrajectorySnapshot = {
      ...snapshot,
      nodes: [
        { ...snapshot.nodes[0]!, data: { turnId: "turn-1", stepId: "step-1" } },
        { ...snapshot.nodes[1]!, eventType: "tool/call", data: { turnId: "turn-1", stepId: "step-1", name: "read_file", path: "src/App.tsx" } },
        { ...snapshot.nodes[2]!, data: { turnId: "turn-1", status: "completed" } },
      ],
    };

    render(<TrajectoryView snapshot={richSnapshot} />);

    expect(screen.getByRole("toolbar", { name: "Trajectory toolbar" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Trajectory timeline" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search trajectory" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /TOOL tool\/call, read_file/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse turns" }));
    // A turn with one visible semantic record is not collapsible in DSH.
    expect(screen.getByText(/read_file \{"path":"src\/App\.tsx"\}/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse turns" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /TOOL tool\/call, read_file/ }));
    expect(screen.getByRole("complementary", { name: "Event details" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Payload" }));
    expect(screen.getByRole("tabpanel").textContent).toMatch(/"path":\s*"src\/App\.tsx"/);

    await user.click(screen.getByRole("button", { name: "Close event details" }));
    expect(screen.queryByRole("complementary", { name: "Event details" })).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search trajectory" }), "read_file");
    expect(screen.getByRole("button", { name: "Clear trajectory search" })).toBeInTheDocument();
  });
  it("shows role-specific details and restores every tool in a folded group", async () => {
    const user = userEvent.setup();
    render(<TrajectoryView snapshot={loadTrajectoryFixture("complete")} />);
    await user.click(screen.getByRole("button", { name: "Collapse calls" }));
    expect(screen.queryByRole("button", { name: /TOOL tool\/call, read_file/ })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Expand tool call" })[0]!);
    expect(screen.getByRole("button", { name: /TOOL tool\/call, read_file.*core-codecs/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /TOOL tool\/call, bash.*session-journal/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /ASSISTANT assistant\/message, Journal 保留/ }));
    expect(screen.getByText("Turn 1 · Step 2")).toBeInTheDocument();
    expect(screen.getByText("700 ms")).toBeInTheDocument();
    expect(screen.getByText(/2026-09-03 \d{2}:20:10\.100/)).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Summary", "Preview", "Raw"]);
    await user.click(screen.getByRole("button", { name: "Close event details" }));
    await user.click(screen.getByRole("button", { name: /USER user\/message, 帮我检查/ }));
    expect(screen.getByText("Turn 1 · Message")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Source" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent('"kind": "user"');
  });

  it("opens request boundaries and displays prompt changes with nested tool ancestry", async () => {
    const user = userEvent.setup();
    render(<TrajectoryView snapshot={loadTrajectoryFixture("errors")} />);
    await user.click(screen.getByRole("button", { name: "Collapse nested tools" }));
    expect(screen.queryByRole("button", { name: /TOOL tool\/call, bash.*session-journal/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand nested tools" }));
    await user.click(screen.getByRole("button", { name: /ASSISTANT assistant\/message, Journal 保留/ }));
    await user.click(screen.getByRole("button", { name: "Request #2" }));
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Summary", "Options", "Usage", "Timing"]);
    await user.click(screen.getByRole("button", { name: "Close event details" }));
    await user.click(screen.getAllByRole("button", { name: /SYSTEM request\/header, System Prompt Updated/ })[0]!);
    expect(screen.getByRole("tab", { name: "Diff" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Prompt changes")).toHaveTextContent("+ 本轮只检查文件，不修改。");
    await user.click(screen.getByRole("button", { name: "Close event details" }));
    await user.click(screen.getByRole("button", { name: /TOOL tool\/call, bash.*session-journal/ }));
    expect(screen.getByRole("button", { name: "Parent Tool" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Parent Tool" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("80 lines read");
  });

  it("reveals earlier history in pages while retaining complete turn boundaries", async () => {
    const user = userEvent.setup();
    render(<TrajectoryView snapshot={loadTrajectoryFixture("long")} />);
    const initial = screen.getAllByRole("row").length;
    expect(screen.getAllByRole("row")[0]).toHaveTextContent("USER");
    await user.click(screen.getByRole("button", { name: "Load earlier history" }));
    expect(screen.getAllByRole("row").length).toBeGreaterThan(initial);
    expect(screen.getAllByRole("row")[0]).toHaveTextContent("USER");
  });

});
