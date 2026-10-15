import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import { SEARCH_INDEX_THROTTLE_MS, TrajectoryView } from "../components/TrajectoryView";
import { useFrameCoalesced } from "../components/trajectory/use-trajectory-source";
import { streamingFixture } from "../trajectory/fixtures";
import * as builder from "../trajectory/builder";
import * as layout from "../trajectory/layout";
import * as timeline from "../trajectory/timeline";

vi.mock("../trajectory/timeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../trajectory/timeline")>();
  return { ...actual, deriveTimeline: vi.fn(actual.deriveTimeline) };
});
vi.mock("../trajectory/builder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../trajectory/builder")>();
  return { ...actual, buildTrajectorySnapshot: vi.fn(actual.buildTrajectorySnapshot) };
});
vi.mock("../trajectory/layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../trajectory/layout")>();
  return { ...actual, deriveLayout: vi.fn(actual.deriveLayout) };
});

const spies = () => [vi.mocked(builder.buildTrajectorySnapshot), vi.mocked(layout.deriveLayout), vi.mocked(timeline.deriveTimeline)];
const calls = () => spies().map(spy => spy.mock.calls.length);
/** A settled `tool/call` after the streamed chunks; it does not close the reply. */
function withToolCall(snapshot: RuntimeV2TrajectorySnapshot): RuntimeV2TrajectorySnapshot {
  const last = snapshot.nodes.at(-1)!;
  const data = last.data as Record<string, string>;
  const call = { ...last, key: `${last.sessionId}:${last.eventSeq + 1}`, eventSeq: last.eventSeq + 1, eventType: "tool/call", callId: "streaming-call",
    data: { turnId: data.turnId!, stepId: data.stepId!, callId: "streaming-call", name: "bash", arguments: { command: "ls" } } };
  return { ...snapshot, throughJournalSeq: call.eventSeq, nodes: [...snapshot.nodes, call] as RuntimeV2TrajectorySnapshot["nodes"] };
}

const runningRow = () => document.querySelector<HTMLTableRowElement>('tr[data-record-id$=":record:assistant:assistant-running"]');

describe("trajectory streaming", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("grows the streaming assistant row in place without rebuilding the settled layer", () => {
    const view = render(<TrajectoryView snapshot={streamingFixture(0)} />);
    spies().forEach(spy => spy.mockClear());
    const lengths: number[] = [];
    let row: HTMLTableRowElement | null = null;
    const removed: Node[] = [];
    const observer = new MutationObserver(records => records.forEach(record => removed.push(...Array.from(record.removedNodes))));
    for (let frame = 1; frame <= 5; frame += 1) {
      view.rerender(<TrajectoryView snapshot={streamingFixture(frame)} />);
      const current = runningRow();
      expect(current).not.toBeNull();
      if (row === null) {
        row = current;
        observer.observe(row!.parentElement!, { childList: true });
      }
      expect(current).toBe(row);
      lengths.push(current!.querySelector(".tj-content")!.textContent!.length);
    }
    observer.disconnect();
    expect(removed.filter(node => node === row)).toHaveLength(0);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(new Set(lengths).size).toBe(5);
    // Only the frame that adds the assistant placeholder builds; later chunks go to the streaming layer.
    expect(calls()).toEqual([1, 1, 1]);
    view.rerender(<TrajectoryView snapshot={withToolCall(streamingFixture(5))} />);
    expect(calls()).toEqual([2, 2, 2]);
    expect(runningRow()).toBe(row);
    expect(row).toHaveAttribute("data-running", "true");
    expect(screen.getByRole("row", { name: /^请求 \d+，助手，正在整理/ })).toBe(row);
  });

  it("grows the selected assistant's preview with the stream", () => {
    const view = render(<TrajectoryView snapshot={streamingFixture(1)} />);
    fireEvent.click(runningRow()!);
    fireEvent.click(screen.getByRole("tab", { name: "预览" }));
    const lengths: number[] = [];
    for (let frame = 2; frame <= 4; frame += 1) {
      view.rerender(<TrajectoryView snapshot={streamingFixture(frame)} />);
      lengths.push(screen.getByRole("tabpanel").textContent!.length);
    }
    expect(lengths[0]).toBeLessThan(lengths[1]!);
    expect(lengths[1]).toBeLessThan(lengths[2]!);
    expect(within(screen.getByRole("tabpanel")).getByText(/正在整理轨迹页面：先对齐工具栏和时/)).toBeInTheDocument();
  });

  it("makes newly streamed text searchable after the index throttle", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const view = render(<TrajectoryView snapshot={streamingFixture(1)} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "圆点和类型" } });
    expect(runningRow()).toBeNull();
    view.rerender(<TrajectoryView snapshot={streamingFixture(8)} />);
    act(() => { vi.advanceTimersByTime(SEARCH_INDEX_THROTTLE_MS - 1); });
    expect(runningRow()).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(runningRow()).not.toBeNull();
  });

  it("commits projection updates at most once per animation frame", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const immediate = (committed: number | null) => committed === null;
    const { result, rerender } = renderHook(({ value }) => useFrameCoalesced<number | null>(value, immediate), { initialProps: { value: null as number | null } });
    rerender({ value: 1 });
    expect(result.current).toBe(1);
    rerender({ value: 2 });
    rerender({ value: 3 });
    expect(result.current).toBe(1);
    act(() => { vi.advanceTimersToNextFrame(); });
    expect(result.current).toBe(3);
  });
});
