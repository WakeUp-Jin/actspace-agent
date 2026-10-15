import { describe, expect, it } from "vitest";
import type { SessionListItem } from "@actspace/shared";
import {
  bucketByTime, formatRelativeTimeZh, isDefaultViewOptions, isManualOrder, limitGroupSessions, moveInOrder, nextRevealCount,
  orderGroups, orderSessions, parseSidebarViewState, passesArchivedFilter, sortByRecency, timeBucketOf,
} from "../components/sidebar/sidebar-view";
import { createSidebarViewStore, SIDEBAR_VIEW_STORAGE_KEY } from "../components/sidebar/sidebar-view-store";

function session(id: string, updatedAt: string, partial: Partial<SessionListItem> = {}): SessionListItem {
  return { id, title: id, updatedAt, agentRunCount: 0, ...partial };
}

const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe("sidebar view options", () => {
  it("parses stored state and falls back on bad values", () => {
    expect(parseSidebarViewState(null).options).toEqual({ groupBy: "workspace", sort: "updated", archived: "hide" });
    const parsed = parseSidebarViewState({
      options: { groupBy: "time", sort: "bogus", archived: "only" },
      orders: { flat: ["a", 1, "b"], bad: "x" },
      groupCollapsed: { ws: true, other: false, weird: "yes" },
    });
    expect(parsed.options).toEqual({ groupBy: "time", sort: "updated", archived: "only" });
    expect(parsed.orders).toEqual({ flat: ["a", "b"] });
    expect(parsed.groupCollapsed).toEqual({ ws: true });
    expect(parsed.timeCollapsed).toEqual({});
  });

  it("knows the defaults and when manual order applies", () => {
    expect(isDefaultViewOptions({ groupBy: "workspace", sort: "updated", archived: "hide" })).toBe(true);
    expect(isDefaultViewOptions({ groupBy: "flat", sort: "updated", archived: "hide" })).toBe(false);
    expect(isManualOrder({ groupBy: "flat", sort: "manual", archived: "hide" })).toBe(true);
    expect(isManualOrder({ groupBy: "time", sort: "manual", archived: "hide" })).toBe(false);
  });

  it("filters archived sessions", () => {
    const live = session("a", "2026-10-15T00:00:00Z");
    const archived = session("b", "2026-10-15T00:00:00Z", { archived: true });
    expect([live, archived].filter((s) => passesArchivedFilter(s, "hide")).map((s) => s.id)).toEqual(["a"]);
    expect([live, archived].filter((s) => passesArchivedFilter(s, "all")).map((s) => s.id)).toEqual(["a", "b"]);
    expect([live, archived].filter((s) => passesArchivedFilter(s, "only")).map((s) => s.id)).toEqual(["b"]);
  });
});

describe("session ordering", () => {
  const a = session("a", "2026-10-15T10:00:00Z");
  const b = session("b", "2026-10-15T12:00:00Z");
  const c = session("c", "2026-10-15T08:00:00Z");
  const old = session("old", "2026-10-15T20:00:00Z", { archived: true });

  it("sorts by recency with archived last", () => {
    expect(ids(sortByRecency([a, old, b, c]))).toEqual(["b", "a", "c", "old"]);
  });

  it("keeps the saved order, puts new sessions on top and archived last", () => {
    const fresh = session("fresh", "2026-10-14T00:00:00Z");
    expect(ids(orderSessions([a, b, c, old, fresh], ["c", "a", "gone", "b"]))).toEqual(["fresh", "c", "a", "b", "old"]);
    expect(ids(orderSessions([a, b, c]))).toEqual(["b", "a", "c"]);
  });

  it("orders groups with new groups first", () => {
    const groups = [{ key: "x" }, { key: "y" }, { key: "z" }];
    expect(ids(orderGroups(groups, ["z", "x"]).map((g) => ({ id: g.key })))).toEqual(["y", "z", "x"]);
    expect(orderGroups(groups).map((g) => g.key)).toEqual(["x", "y", "z"]);
  });

  it("moves an id before or after a target", () => {
    expect(moveInOrder(["a", "b", "c", "d"], "d", "b", false)).toEqual(["a", "d", "b", "c"]);
    expect(moveInOrder(["a", "b", "c", "d"], "a", "c", true)).toEqual(["b", "c", "a", "d"]);
    expect(moveInOrder(["a", "b"], "a", "missing", true)).toEqual(["a", "b"]);
  });
});

describe("group limit", () => {
  const list = Array.from({ length: 9 }, (_, i) => session(`s${i}`, "2026-10-15T00:00:00Z"));

  it("shows five, never hides busy or active sessions", () => {
    const { visible, hidden } = limitGroupSessions(list, 0, (s) => s.id === "s7");
    expect(ids(visible)).toEqual(["s0", "s1", "s2", "s3", "s4", "s7"]);
    expect(ids(hidden)).toEqual(["s5", "s6", "s8"]);
    expect(limitGroupSessions(list, 5, () => false).hidden).toHaveLength(0);
  });

  it("reveals five at a time, or the rest when six or fewer remain", () => {
    expect(nextRevealCount(3)).toBe(3);
    expect(nextRevealCount(6)).toBe(6);
    expect(nextRevealCount(12)).toBe(5);
  });
});

describe("time buckets", () => {
  const now = new Date(2026, 9, 15, 22, 40);
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

  it("labels today, yesterday, weekdays, earlier this month, months and years", () => {
    expect(timeBucketOf(at(2026, 10, 15, 1), now).label).toBe("今天");
    expect(timeBucketOf(at(2026, 10, 14), now).label).toBe("昨天");
    expect(timeBucketOf(at(2026, 10, 13), now)).toMatchObject({ label: "周二", date: "10月13日" });
    expect(timeBucketOf(at(2026, 10, 2), now).label).toBe("本月更早");
    expect(timeBucketOf(at(2026, 9, 20), now).label).toBe("9月");
    expect(timeBucketOf(at(2025, 12, 1), now).label).toBe("2025年12月");
  });

  it("collects sessions that need attention on top", () => {
    const sessions = [
      session("today", at(2026, 10, 15)),
      session("waiting", at(2026, 9, 1)),
      session("yesterday", at(2026, 10, 14)),
      session("today-2", at(2026, 10, 15, 9)),
    ];
    const buckets = bucketByTime(sessions, now, (s) => s.id === "waiting");
    expect(buckets.map((b) => [b.label, ids(b.sessions)])).toEqual([
      ["需要处理", ["waiting"]],
      ["今天", ["today", "today-2"]],
      ["昨天", ["yesterday"]],
    ]);
    expect(buckets[0]!.attention).toBe(true);
  });
});

describe("formatRelativeTimeZh", () => {
  const now = new Date("2026-10-15T12:00:00Z").getTime();
  it.each([
    ["2026-10-15T11:59:40Z", "刚刚"],
    ["2026-10-15T11:55:00Z", "5分钟"],
    ["2026-10-15T09:00:00Z", "3小时"],
    ["2026-10-13T12:00:00Z", "2天"],
    ["2026-08-10T12:00:00Z", "2个月"],
    ["2025-09-01T12:00:00Z", "1年"],
  ])("%s → %s", (timestamp, expected) => {
    expect(formatRelativeTimeZh(timestamp, now)).toBe(expected);
  });
});

describe("sidebar view store", () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, data };
  }

  it("persists options and snapshots order when switching to manual", () => {
    const storage = memoryStorage();
    const store = createSidebarViewStore(() => storage);
    let notified = 0;
    store.subscribe(() => { notified++; });
    store.setGroupBy("flat");
    store.setSort("manual", { flat: ["b", "a"] });
    expect(store.get().orders).toEqual({ flat: ["b", "a"] });
    store.setSort("updated");
    expect(store.get().orders).toEqual({});
    expect(notified).toBe(3);
    expect(JSON.parse(storage.data.get(SIDEBAR_VIEW_STORAGE_KEY)!).options.groupBy).toBe("flat");
    expect(createSidebarViewStore(() => storage).get().options.groupBy).toBe("flat");
  });

  it("switches to manual when dragging and keeps the snapshot for other accounts", () => {
    const storage = memoryStorage();
    const store = createSidebarViewStore(() => storage);
    store.setOrder("ws-a", ["y", "x"], { "ws-a": ["x", "y"], "ws-b": ["p", "q"] });
    expect(store.get().options.sort).toBe("manual");
    expect(store.get().orders).toEqual({ "ws-a": ["y", "x"], "ws-b": ["p", "q"] });
    store.setOrder("ws-b", ["q", "p"], { ignored: [] });
    expect(store.get().orders).toEqual({ "ws-a": ["y", "x"], "ws-b": ["q", "p"] });
  });

  it("toggles collapse flags and resets options but keeps collapse state", () => {
    const storage = memoryStorage();
    const store = createSidebarViewStore(() => storage);
    store.toggle("groupCollapsed", "ws-a");
    store.setArchived("only");
    expect(store.get().groupCollapsed).toEqual({ "ws-a": true });
    store.resetOptions();
    expect(store.get().options.archived).toBe("hide");
    expect(store.get().groupCollapsed).toEqual({ "ws-a": true });
    store.toggle("groupCollapsed", "ws-a");
    expect(store.get().groupCollapsed).toEqual({});
  });

  it("survives broken storage", () => {
    const store = createSidebarViewStore(() => ({ getItem: () => "{not json", setItem: () => { throw new Error("quota"); } }));
    expect(store.get().options.groupBy).toBe("workspace");
    store.setGroupBy("time");
    expect(store.get().options.groupBy).toBe("time");
  });
});
