import type { ApprovalRequest, RuntimeV2SessionListItem } from "@actspace/shared/runtime-v2";
import { approvalSummary, formatRowTime, groupSessions, rowStatus, sessionTitle, splitSessions, timeBucket, workspaceOf } from "../session-row-model";

const item = (id: string, updatedAt: string, archived = false, title: string | null = null) => ({ sessionId: id, updatedAt, metadata: { title, pinned: false, archived } }) as unknown as RuntimeV2SessionListItem;

it("orders status approval > running > unread > idle", () => {
  expect(rowStatus({ approvals: 1, running: true, unread: true })).toBe("approval");
  expect(rowStatus({ approvals: 0, running: true, unread: true })).toBe("running");
  expect(rowStatus({ approvals: 0, running: false, unread: true })).toBe("unread");
  expect(rowStatus({ approvals: 0, running: false, unread: false })).toBe("idle");
});

it("formats time as HH:mm today, weekday this week, M/D earlier", () => {
  const now = new Date(2026, 9, 17, 15, 0);
  expect(formatRowTime(new Date(2026, 9, 17, 9, 5).toISOString(), now)).toBe("09:05");
  expect(formatRowTime(new Date(2026, 9, 14, 9, 5).toISOString(), now)).toBe("周三");
  expect(formatRowTime(new Date(2026, 8, 3, 9, 5).toISOString(), now)).toBe("9/3");
});

it("matches the workspace by root and falls back to the last path segment", () => {
  const list = [{ id: "main", name: "Main", path: "/work/main" }];
  expect(workspaceOf("/work/main/", list)).toEqual({ id: "main", name: "Main" });
  expect(workspaceOf("/other/proj", list).name).toBe("proj");
  expect(workspaceOf(null, list).name).toBe("未知工作区");
});

it("falls back to a default title", () => {
  expect(sessionTitle(item("a", "x"))).toBe("新会话");
  expect(sessionTitle(item("a", "x", false, " 修 bug "))).toBe("修 bug");
});

it("splits archived and sorts by updatedAt desc", () => {
  const { active, archived } = splitSessions([item("a", "2026-01-01"), item("b", "2026-02-01"), item("c", "2026-03-01", true)]);
  expect(active.map(s => s.sessionId)).toEqual(["b", "a"]);
  expect(archived.map(s => s.sessionId)).toEqual(["c"]);
});

it("summarizes approvals", () => {
  const base = { toolName: "Bash", resources: [] } as unknown as ApprovalRequest;
  expect(approvalSummary(base)).toBe("Bash");
  expect(approvalSummary({ ...base, resources: [{ kind: "file", access: "write", path: "/a/b/c.ts", targetKind: "file" }] } as unknown as ApprovalRequest)).toBe("修改 b/c.ts");
});

it("derives a short host name", async () => {
  const { hostDisplayName } = await import("../session-row-model");
  expect(hostDisplayName("https://my-server.tail.ts.net")).toBe("my-server");
  expect(hostDisplayName("http://127.0.0.1:5173")).toBe("127.0.0.1");
  expect(hostDisplayName("http://localhost:5173")).toBe("localhost");
  expect(hostDisplayName(undefined)).toBe("未连接");
});

it("buckets time into 今天 / 昨天 / 近 7 天 / 本月更早 / months", () => {
  const now = new Date(2026, 9, 17, 15, 0);
  const label = (date: Date) => timeBucket(date.toISOString(), now).label;
  expect(label(new Date(2026, 9, 17, 1, 0))).toBe("今天");
  expect(label(new Date(2026, 9, 16, 23, 0))).toBe("昨天");
  expect(label(new Date(2026, 9, 12, 9, 0))).toBe("近 7 天");
  expect(label(new Date(2026, 9, 2, 9, 0))).toBe("本月更早");
  expect(label(new Date(2026, 8, 30, 9, 0))).toBe("9 月");
  expect(label(new Date(2025, 11, 30, 9, 0))).toBe("2025 年 12 月");
});

it("puts attention rows first and groups the rest by time in order", () => {
  const now = new Date(2026, 9, 17, 15, 0);
  const rows = [item("a", new Date(2026, 9, 17, 14).toISOString()), item("b", new Date(2026, 9, 17, 9).toISOString()), item("c", new Date(2026, 9, 16, 9).toISOString())];
  const groups = groupSessions(rows, row => row.sessionId === "b", now);
  expect(groups.map(group => [group.label, group.items.map(row => row.sessionId)])).toEqual([["需要处理", ["b"]], ["今天", ["a"]], ["昨天", ["c"]]]);
});
