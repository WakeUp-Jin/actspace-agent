import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import { loadTrajectoryFixture } from "../trajectory/fixtures";
import type { TrajectoryRevealTarget } from "../trajectory";
import { TrajectoryView } from "../components/TrajectoryView";
import { TrajectoryNavigationProvider, useTrajectoryNavigation } from "../components/trajectory/TrajectoryNavigation";
import { TooltipProvider } from "../components/ui/Tooltip";
import { SessionProjectionProvider } from "../session";
import { projectionFixture } from "./projection-fixture";
import type { SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { setupBridge } from "./helpers/bridge";

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
  it("renders the Journal projection nodes with stable sequence identity", () => {
    render(<TrajectoryView snapshot={snapshot} />);
    expect(screen.getByTestId("trajectory-view")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "轨迹时间线" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("turn/start")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1);
    expect(screen.getAllByRole("row").find((row) => row.getAttribute("data-event-seq") === "1")).toBeInTheDocument();
  });

  it("renders a clear empty state when the projection is unavailable", () => {
    render(<TrajectoryView snapshot={null} />);
    expect(screen.getByText(/暂无可展示的 Agent 轨迹/)).toBeInTheDocument();
  });

  it("lazily loads the URL fixture and its theme override, restoring the theme on unmount", async () => {
    const previousUrl = window.location.href;
    window.history.replaceState(null, "", "?trajectoryFixture=complete&trajectoryTheme=dark");
    try {
      const view = render(<TrajectoryView snapshot={null} />);
      await waitFor(() => expect(screen.queryByText(/暂无可展示的 Agent 轨迹/)).not.toBeInTheDocument());
      expect(screen.getAllByRole("row").length).toBeGreaterThan(0);
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      view.unmount();
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    } finally {
      window.history.replaceState(null, "", previousUrl);
    }
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
    setupBridge({
      "sessions.getProjectionSnapshot": async () => projection,
      "events.sessionLive": () => () => undefined,
    });

    render(
      <SessionProjectionProvider sessionId="session-1">
        <TrajectoryView />
      </SessionProjectionProvider>,
    );

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
  });

  it("provides the toolbar, timeline, search, and event details", async () => {
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

    expect(screen.getByRole("toolbar", { name: "轨迹工具栏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用实际时长" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "停止" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "轨迹时间线" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "搜索轨迹" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /工具，read_file/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "收起所有轮次" }));
    // A turn with one visible semantic record is not collapsible in DSH.
    expect(screen.getByText(/\{"path":"src\/App\.tsx"\}/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起所有轮次" })).toBeInTheDocument();
    await user.click(screen.getByRole("row", { name: /工具，read_file/ }));
    expect(screen.getByRole("complementary", { name: "事件详情" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /工具，read_file/ })).toHaveAttribute("data-selected", "true");
    await user.click(screen.getByRole("tab", { name: "参数" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/src\/App\.tsx/);

    await user.click(screen.getByRole("button", { name: "关闭详情" }));
    expect(screen.queryByRole("complementary", { name: "事件详情" })).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "搜索轨迹" }), "no-such-text");
    expect(screen.queryByRole("row", { name: /工具，read_file/ })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "搜索轨迹" }));
    expect(screen.getByRole("row", { name: /工具，read_file/ })).toBeInTheDocument();
  });

  it("puts 停止 at the right edge of the toolbar while the session runs", async () => {
    const onAbort = vi.fn();
    const view = render(<TrajectoryView snapshot={snapshot} onAbort={onAbort} />);
    const toolbar = screen.getByRole("toolbar", { name: "轨迹工具栏" });
    const buttons = within(toolbar).getAllByRole("button");
    expect(buttons.at(-1)).toHaveAccessibleName("停止");
    await userEvent.click(buttons.at(-1)!);
    expect(onAbort).toHaveBeenCalledTimes(1);
    view.rerender(<TrajectoryView snapshot={snapshot} onAbort={onAbort} isAborting />);
    expect(within(toolbar).getByRole("button", { name: "正在停止…" })).toBeDisabled();
  });

  it("shows role-specific details and folds assistants and turns", async () => {
    const user = userEvent.setup();
    render(<TrajectoryView snapshot={loadTrajectoryFixture("complete")} />);
    await user.click(screen.getByRole("button", { name: "收起所有调用" }));
    expect(screen.queryByRole("row", { name: /工具，read_file/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开所有调用" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("row", { name: /^已收起的助手概述/ })[0]!);
    expect(screen.getByRole("row", { name: /工具，read_file.*core-codecs/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /工具，bash.*session-journal/ })).toBeInTheDocument();

    await user.click(screen.getByRole("row", { name: /助手，Journal 保留/ }));
    const details = screen.getByRole("complementary", { name: "事件详情" });
    expect(within(details).getByText("第 1 轮 · 第 2 步")).toBeInTheDocument();
    expect(within(details).getByText(/2026-09-03 \d{2}:20:10\.100/)).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["概述", "预览", "原始内容"]);
    await user.click(screen.getByRole("button", { name: "关闭详情" }));

    await user.click(screen.getByRole("row", { name: /用户，帮我检查/ }));
    expect(screen.getByText("第 1 轮 · 消息")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "来源" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/kind.*user/);
    await user.click(screen.getByRole("button", { name: "关闭详情" }));

    // Double-clicking a turn's first row keeps the user message and folds the rest into one summary row.
    await user.dblClick(screen.getByRole("row", { name: /用户，帮我检查/ }));
    expect(screen.queryByRole("row", { name: /助手，Journal 保留/ })).not.toBeInTheDocument();
    const summary = screen.getByRole("row", { name: /^已收起的轮次概述/ });
    expect(summary).toHaveTextContent("2 个步骤 · 2 个工具调用");
    await user.click(summary);
    expect(screen.getByRole("row", { name: /助手，Journal 保留/ })).toBeInTheDocument();
  });

  it("opens request details from the request dot without selecting the row, and shows prompt diffs and tool ancestry", async () => {
    const user = userEvent.setup();
    render(<TrajectoryView snapshot={loadTrajectoryFixture("errors")} />);
    await user.click(screen.getByRole("button", { name: "请求 #2" }));
    expect(screen.getByRole("row", { name: /助手，Journal 保留/ })).not.toHaveAttribute("data-selected");
    expect(screen.getByRole("button", { name: "请求 #2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["概述", "选项", "用量", "计时"]);
    await user.click(screen.getByRole("button", { name: "关闭详情" }));

    await user.click(screen.getAllByRole("row", { name: /系统，系统提示词已更新/ })[0]!);
    expect(screen.getByRole("tab", { name: "差异" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("本轮只检查文件，不修改。");
    await user.click(screen.getByRole("button", { name: "关闭详情" }));

    await user.click(screen.getByRole("row", { name: /子工具，bash.*session-journal/ }));
    await user.click(screen.getByRole("button", { name: "工具调用" }));
    expect(screen.getByRole("row", { name: /工具，read_file.*core-codecs/ })).toHaveAttribute("data-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("80 lines read");
  });

  it("reveals earlier history in pages while retaining complete turn boundaries", async () => {
    const user = userEvent.setup();
    render(<TrajectoryView snapshot={loadTrajectoryFixture("long")} />);
    const records = () => document.querySelectorAll<HTMLTableRowElement>("tr[data-record-id]");
    const initial = records().length;
    expect(records()[0]).toHaveAttribute("data-kind", "user");
    await user.click(within(screen.getByRole("table")).getByRole("button", { name: "加载更早的历史" }));
    expect(records().length).toBeGreaterThan(initial);
    expect(records()[0]).toHaveAttribute("data-kind", "user");
  }, 15_000);

  it("selects the record a Context panel reveal points at and opens its details", async () => {
    const onShowTrajectory = vi.fn();
    render(<TooltipProvider><TrajectoryNavigationProvider onShowTrajectory={onShowTrajectory}>
      <RevealTrigger target={{ callId: "call-1" }} />
      <TrajectoryView snapshot={snapshot} />
    </TrajectoryNavigationProvider></TooltipProvider>);

    await userEvent.click(screen.getByRole("button", { name: "reveal" }));
    expect(onShowTrajectory).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getAllByRole("row").find((row) => row.getAttribute("data-event-seq") === "1")).toHaveAttribute("data-selected", "true"));
    expect(screen.getByRole("button", { name: "关闭详情" })).toBeInTheDocument();
  });

  it("explains a reveal that does not match any loaded record", async () => {
    render(<TooltipProvider><TrajectoryNavigationProvider onShowTrajectory={() => undefined}>
      <RevealTrigger target={{ callId: "missing" }} />
      <TrajectoryView snapshot={snapshot} />
    </TrajectoryNavigationProvider></TooltipProvider>);

    await userEvent.click(screen.getByRole("button", { name: "reveal" }));
    expect(await screen.findByText(/没有在已加载的轨迹里找到这条记录/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "关闭说明" }));
    expect(screen.queryByText(/没有在已加载的轨迹里找到这条记录/)).not.toBeInTheDocument();
  });
});

function RevealTrigger({ target }: { target: TrajectoryRevealTarget }) {
  const navigation = useTrajectoryNavigation();
  return <button type="button" onClick={() => navigation?.revealInTrajectory(target)}>reveal</button>;
}
