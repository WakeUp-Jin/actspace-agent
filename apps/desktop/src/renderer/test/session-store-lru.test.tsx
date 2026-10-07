import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClientSessionStore, type ClientSessionCell } from "@actspace/client/sessions";
import type { RuntimeV2DesktopSessionProjection, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { createSessionCellRetention, SESSION_CELL_RETAIN_LIMIT, useSessionCell } from "../session/session-store";
import { loadEarlier } from "../session/session-pages";
import { projectionFixture } from "./projection-fixture";

// 14 T9：cell 保留策略（活动 / 运行中常驻，其余最近查看的 5 个）、useSessionCell、loadEarlier。
function message(seq: number): SessionEventEnvelopeV1 {
  const messageId = `m-${seq}`;
  return { recordKind: "event", seq, type: "user/message", eventVersion: 1, criticality: "ignorable", time: "2026-10-06T00:00:00.000Z", source: { ownerPluginId: "@actspace/core" },
    data: { agentRunId: "run", messageId, content: `message ${seq}` }, surface: { kind: "append", node: { kind: "user", messageId, content: `message ${seq}` } },
    provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
}

/** seq 为 [fromSeq, toSeq] 的一页；整个会话的最新 seq 是 latest。 */
function page(sessionId: string, fromSeq: number, toSeq: number, latest = toSeq): RuntimeV2DesktopSessionProjection {
  const events = Array.from({ length: toSeq - fromSeq + 1 }, (_, index) => message(fromSeq + index));
  const base = projectionFixture(sessionId, latest, events);
  return { ...base, activeMessageIds: events.map((event) => event.surface!.node.messageId), snapshot: { ...base.snapshot, messages: events.map((event) => event.surface!.node) },
    window: { ...base.window, fromSeq, throughJournalSeq: toSeq, beforeSeq: fromSeq === 0 ? null : fromSeq } };
}

function viewAll(store: ClientSessionStore, ids: string[]) {
  const retention = createSessionCellRetention(store);
  return { retention, view: (id: string, pinned: ReadonlySet<string> = new Set([id])) => {
    store.select(id);
    store.applyEnvelope(page(id, 0, 1));
    retention.retain(pinned);
    retention.viewed(id);
  }, ids };
}

describe("session cell retention", () => {
  it("evicts the oldest inactive cell once a 6th inactive session has been viewed", () => {
    const store = new ClientSessionStore();
    const { view } = viewAll(store, []);
    for (const id of ["s-1", "s-2", "s-3", "s-4", "s-5", "s-6"]) view(id);
    // s-6 活动，s-1…s-5 是 5 个非活动会话：都保留。
    expect(store.cellIds().sort()).toEqual(["s-1", "s-2", "s-3", "s-4", "s-5", "s-6"]);
    view("s-7");
    // s-1…s-6 成了 6 个非活动会话：最早查看的 s-1 被淘汰。
    expect(store.peek("s-1")).toBeNull();
    expect(store.cellIds().sort()).toEqual(["s-2", "s-3", "s-4", "s-5", "s-6", "s-7"]);
    // 重新查看会把它变成最近的那个；淘汰的是下一个最早的 s-2。
    view("s-3");
    view("s-1");
    expect(store.peek("s-2")).toBeNull();
    expect(store.peek("s-3")).not.toBeNull();
    expect(SESSION_CELL_RETAIN_LIMIT).toBe(5);
  });

  it("never evicts a running session, and running sessions take no slot", () => {
    const store = new ClientSessionStore();
    const { retention, view } = viewAll(store, []);
    view("running");
    // 后台 run 从未被打开过，只读过页：同样常驻。
    store.applyEnvelope(page("background-run", 0, 1));
    const running = new Set(["running", "background-run"]);
    for (const id of ["s-1", "s-2", "s-3", "s-4", "s-5", "s-6", "s-7", "s-8"]) view(id, new Set([...running, id]));
    expect(store.peek("running")).not.toBeNull();
    expect(store.peek("background-run")).not.toBeNull();
    expect(retention.order()).toEqual(["s-3", "s-4", "s-5", "s-6", "s-7"]);

    // run 结束后它回到普通会话，按最初查看的时间排在最前，下一次清理就被淘汰。
    retention.retain(new Set(["s-8"]));
    expect(store.peek("running")).toBeNull();
    expect(store.peek("background-run")).toBeNull();
    expect(retention.order()).toEqual(["s-3", "s-4", "s-5", "s-6", "s-7"]);
  });

  it("counts cells nobody viewed (background page reads) as oldest, and forget drops a cell directly", () => {
    const store = new ClientSessionStore();
    const { retention, view } = viewAll(store, []);
    store.applyEnvelope(page("background", 0, 1));
    for (const id of ["s-1", "s-2", "s-3", "s-4", "s-5", "s-6"]) view(id);
    expect(store.peek("background")).toBeNull();
    expect(store.peek("s-1")).not.toBeNull();

    expect(retention.forget("s-2")).toBe(true);
    expect(store.peek("s-2")).toBeNull();
    expect(retention.order()).toEqual(["s-1", "s-3", "s-4", "s-5"]);
    // 活动会话（store 当前选中的）不会被 forget 删掉。
    expect(retention.forget("s-6")).toBe(false);
    expect(store.peek("s-6")).not.toBeNull();
  });
});

describe("useSessionCell", () => {
  it("re-runs the selector only when the cell reference changes, so derived objects stay stable", () => {
    const store = new ClientSessionStore();
    const selector = vi.fn((cell: ClientSessionCell | null) => ({ count: cell?.window?.events.length ?? 0 }));
    const seen: { count: number }[] = [];
    function Probe({ sessionId }: { sessionId: string | null }) {
      seen.push(useSessionCell(store, sessionId, selector));
      return null;
    }
    const view = render(<Probe sessionId="s-1" />);
    expect(seen.at(-1)).toEqual({ count: 0 });
    act(() => { store.applyEnvelope(page("s-1", 0, 1)); });
    expect(seen.at(-1)).toEqual({ count: 2 });
    const rendered = seen.length;
    const calls = selector.mock.calls.length;

    act(() => { store.applyEnvelope(page("s-2", 0, 4)); });
    expect(seen.length).toBe(rendered);
    expect(selector.mock.calls.length).toBe(calls);
    view.rerender(<Probe sessionId="s-1" />);
    expect(seen.at(-1)).toBe(seen.at(-2));

    view.rerender(<Probe sessionId={null} />);
    expect(seen.at(-1)).toEqual({ count: 0 });
  });
});

describe("loadEarlier", () => {
  it("prepends the page before the window's beforeSeq and keeps later live events", async () => {
    const store = new ClientSessionStore();
    store.applyEnvelope(page("s-1", 10, 19));
    const getPage = vi.fn(async () => page("s-1", 0, 9, 19));
    await expect(loadEarlier(store, "s-1", getPage)).resolves.toBe(true);
    expect(getPage).toHaveBeenCalledWith({ sessionId: "s-1", beforeSeq: 10 });
    const window = store.peek("s-1")!.window!;
    expect(window.events.map((event) => event.seq)).toEqual(Array.from({ length: 20 }, (_, seq) => seq));
    expect(window.beforeSeq).toBeNull();
    // 没有更早的历史了：不再请求。
    await expect(loadEarlier(store, "s-1", getPage)).resolves.toBe(false);
    expect(getPage).toHaveBeenCalledTimes(1);
  });

  it("shares one request per session while it is in flight", async () => {
    const store = new ClientSessionStore();
    store.applyEnvelope(page("s-1", 10, 19));
    let resolve!: (value: RuntimeV2DesktopSessionProjection) => void;
    const getPage = vi.fn(() => new Promise<RuntimeV2DesktopSessionProjection>((done) => { resolve = done; }));
    const first = loadEarlier(store, "s-1", getPage);
    expect(loadEarlier(store, "s-1", getPage)).toBe(first);
    resolve(page("s-1", 0, 9, 19));
    await expect(first).resolves.toBe(true);
    expect(getPage).toHaveBeenCalledTimes(1);
  });

  it("drops a page that arrives after the cell was evicted or its window replaced", async () => {
    const store = new ClientSessionStore();
    store.applyEnvelope(page("s-1", 10, 19));
    let resolve!: (value: RuntimeV2DesktopSessionProjection) => void;
    const getPage = () => new Promise<RuntimeV2DesktopSessionProjection>((done) => { resolve = done; });

    const evicted = loadEarlier(store, "s-1", getPage);
    store.evict("s-1");
    resolve(page("s-1", 0, 9, 19));
    await expect(evicted).resolves.toBe(false);
    expect(store.peek("s-1")).toBeNull();

    // 窗口被一页不相邻的最新页替换后，旧的 beforeSeq 页不能把窗口换回早期内容。
    store.applyEnvelope(page("s-1", 10, 19));
    const replaced = loadEarlier(store, "s-1", getPage);
    store.applyEnvelope(page("s-1", 40, 49));
    resolve(page("s-1", 0, 9, 49));
    await expect(replaced).resolves.toBe(false);
    expect(store.peek("s-1")!.window!.fromSeq).toBe(40);
  });

  it("propagates a failed read so the caller can show it, and allows a retry", async () => {
    const store = new ClientSessionStore();
    store.applyEnvelope(page("s-1", 10, 19));
    const getPage = vi.fn().mockRejectedValueOnce(new Error("读取失败")).mockResolvedValueOnce(page("s-1", 0, 9, 19));
    await expect(loadEarlier(store, "s-1", getPage)).rejects.toThrow("读取失败");
    await expect(loadEarlier(store, "s-1", getPage)).resolves.toBe(true);
  });
});
