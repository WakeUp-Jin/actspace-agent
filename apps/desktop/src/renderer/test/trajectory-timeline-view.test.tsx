import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeV2TrajectoryNode, RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import { TrajectoryTimeline } from "../components/trajectory/TrajectoryTimeline";
import { buildTrajectorySnapshot, deriveLayout, deriveTimeline } from "../trajectory";

let seq = 0;
const node = (eventType: string, time: string, data: Record<string, unknown>, callId: string | null = null): RuntimeV2TrajectoryNode => {
  seq += 1;
  return { key: `s:${seq}`, sessionId: "s", eventSeq: seq, eventType, time: `2026-10-14T00:00:${time}Z`, kind: "other", state: "observed", callId, data } as RuntimeV2TrajectoryNode;
};
const t1 = { turnId: "t1" };
const nodes = [
  node("turn/start", "00.000", t1),
  node("user/message", "00.100", { ...t1, content: "读一下 README" }),
  node("step/start", "00.200", { ...t1, stepId: "st1" }),
  node("request/header", "00.200", { ...t1, stepId: "st1", requestId: "r1", prompt: { systemPrompt: "你是助手", tools: [] } }),
  node("assistant/message", "01.000", { ...t1, stepId: "st1", requestId: "r1", messageId: "m1", content: "先读文件" }),
  node("tool/call", "01.100", { ...t1, stepId: "st1", callId: "c1", name: "read_file", arguments: { path: "README.md" } }, "c1"),
  node("tool/result", "01.500", { ...t1, stepId: "st1", callId: "c1", result: "ok" }, "c1"),
  node("step/end", "01.500", { ...t1, stepId: "st1" }),
  node("turn/end", "01.500", t1),
];
const snapshot: RuntimeV2TrajectorySnapshot = { kind: "trajectory", schemaVersion: 1, sessionId: "s", throughJournalSeq: seq, nodes };
const model = deriveTimeline(deriveLayout(buildTrajectorySnapshot(snapshot)).turns)!;

const WIDTH = 700;
const noop = () => undefined;
const setup = (props: Partial<Parameters<typeof TrajectoryTimeline>[0]> = {}) => {
  const onRange = vi.fn();
  const onSelect = vi.fn();
  const view = render(<TrajectoryTimeline model={model} mode="sequence" selectedId={null} matches={null} range={null} onRange={onRange} onSelect={onSelect}
    hasEarlier={false} loadingEarlier={false} onLoadEarlier={noop} {...props} />);
  const track = view.container.querySelector<HTMLElement>(".tjl-track")!;
  const spans = () => Array.from(view.container.querySelectorAll<HTMLElement>(".tjl-span"));
  return { ...view, onRange, onSelect, track, spans };
};
const pointer = (target: Element, type: "pointerDown" | "pointerMove" | "pointerUp", clientX: number, target2: Element = target) =>
  fireEvent[type](target2, { clientX, pointerId: 1, button: 0 });

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: WIDTH, bottom: 50, width: WIDTH, height: 50, x: 0, y: 0, toJSON: noop });
});
afterEach(() => vi.restoreAllMocks());

describe("trajectory timeline view", () => {
  it("writes span position variables from the model", () => {
    const { spans } = setup();
    const first = spans()[0]!;
    const n = model.spans.length;
    expect(spans()).toHaveLength(n);
    expect(first.style.getPropertyValue("--trajectory-span-left")).toBe("0%");
    expect(first.style.getPropertyValue("--trajectory-span-width")).toBe(`${100 / n}%`);
    expect(first.style.getPropertyValue("--trajectory-span-lane")).toBe(String(model.spans[0]!.lane));
    expect(spans()[2]!.style.getPropertyValue("--trajectory-span-left")).toBe(`${200 / n}%`);
    expect(spans().map(span => span.dataset.lane)).toEqual(model.spans.map(span => String(span.lane)));
    expect(spans()[0]!.getAttribute("aria-hidden")).toBe("true");
  });

  it("selects a block on click", () => {
    const { spans, track, onSelect, onRange } = setup();
    const target = spans()[2]!;
    pointer(track, "pointerDown", 300, target);
    pointer(track, "pointerUp", 300, target);
    expect(onSelect).toHaveBeenCalledWith(model.spans[2]!.recordId);
    expect(onRange).toHaveBeenCalledWith(null);
  });

  it("commits a dragged range and clears it with Escape", () => {
    const { track, onRange } = setup();
    pointer(track, "pointerDown", 100);
    pointer(track, "pointerMove", 400);
    pointer(track, "pointerUp", 400);
    const range = onRange.mock.calls.at(-1)![0];
    expect(range.start).toBeCloseTo(model.spans.length * 100 / WIDTH);
    expect(range.end).toBeCloseTo(model.spans.length * 400 / WIDTH);
    onRange.mockClear();
    fireEvent.keyDown(track, { key: "Escape" });
    expect(onRange).not.toHaveBeenCalled();
  });

  it("calls onRange(null) on Escape while a range is active", () => {
    const { track, onRange } = setup({ range: { start: 1, end: 3 } });
    expect(track.querySelector(".tjl-selection")).not.toBeNull();
    fireEvent.keyDown(track, { key: "Escape" });
    expect(onRange).toHaveBeenCalledWith(null);
  });

  it("marks spans outside the search matches", () => {
    const keep = model.spans[1]!.recordId;
    const { spans } = setup({ matches: new Set([keep]) });
    expect(spans().map(span => span.dataset.searchMatch)).toEqual(model.spans.map(span => span.recordId === keep ? "true" : "false"));
  });

  it("marks the selected span and the spans inside the range", () => {
    const { spans } = setup({ selectedId: model.spans[0]!.recordId, range: { start: 1, end: 2 } });
    expect(spans()[0]!.dataset.current).toBe("true");
    expect(spans().map(span => span.dataset.selected)).toEqual(model.spans.map(span => span.start <= 2 && span.end >= 1 ? "true" : "false"));
  });
});
