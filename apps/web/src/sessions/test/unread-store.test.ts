import { isUnread, markSeen, resetUnreadCache, seedSeen } from "../unread-store";

beforeEach(() => resetUnreadCache());

it("treats sessions never seen as read", () => {
  expect(isUnread("a", "2026-01-02", null)).toBe(false);
});
it("becomes unread when updatedAt moves past the seen value", () => {
  markSeen("a", "2026-01-01");
  expect(isUnread("a", "2026-01-01", null)).toBe(false);
  expect(isUnread("a", "2026-01-02", null)).toBe(true);
});
it("never flags the open session and never moves backwards", () => {
  markSeen("a", "2026-01-05");
  markSeen("a", "2026-01-01");
  expect(JSON.parse(localStorage.getItem("actspace.web.seen")!)).toEqual({ a: "2026-01-05" });
  expect(isUnread("a", "2026-01-09", "a")).toBe(false);
});
it("persists to localStorage", () => {
  markSeen("b", "2026-02-01");
  resetUnreadCache();
  expect(isUnread("b", "2026-02-02", null)).toBe(true);
});
it("seeds a baseline only for sessions without a record", () => {
  markSeen("a", "2026-01-05");
  seedSeen([{ sessionId: "a", updatedAt: "2026-01-09" }, { sessionId: "c", updatedAt: "2026-01-03" }]);
  expect(isUnread("a", "2026-01-09", null)).toBe(true);
  expect(isUnread("c", "2026-01-03", null)).toBe(false);
  expect(isUnread("c", "2026-01-04", null)).toBe(true);
});
