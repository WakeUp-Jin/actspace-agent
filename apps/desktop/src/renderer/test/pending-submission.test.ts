import { describe, expect, it } from "vitest";
import {
  PENDING_SUBMISSION_TTL_MS,
  clearPendingSubmission,
  readPendingSubmission,
  sweepExpiredPendingSubmissions,
  writePendingSubmission,
} from "../session/pending-submission";

// 14 T20：未确认提交记录的读写、校验和 7 天过期清理。
const KEY = (id: string) => `actspace:pending-submission:${id}`;
const record = (sessionId: string, id = "sub-1") => ({ content: "{}", id, draft: { sessionId, text: `draft ${sessionId}` } });

describe("pending submission records", () => {
  it("writes with a createdAt stamp, reads back and clears", () => {
    writePendingSubmission("s-1", record("s-1"), new Date("2026-10-01T00:00:00.000Z"));
    expect(readPendingSubmission("s-1")).toEqual({ ...record("s-1"), createdAt: "2026-10-01T00:00:00.000Z" });
    clearPendingSubmission("s-1");
    expect(localStorage.getItem(KEY("s-1"))).toBeNull();
  });

  it("ignores malformed records and records that belong to another session", () => {
    localStorage.setItem(KEY("s-1"), "{not json");
    expect(readPendingSubmission("s-1")).toBeNull();
    localStorage.setItem(KEY("s-2"), JSON.stringify({ ...record("other"), createdAt: new Date().toISOString() }));
    expect(readPendingSubmission("s-2")).toBeNull();
    localStorage.setItem(KEY("s-3"), JSON.stringify({ id: "x", draft: { sessionId: "s-3", text: "t" } }));
    expect(readPendingSubmission("s-3")).toBeNull();
  });

  it("sweeps expired and unparseable records, keeps fresh ones and stamps legacy records", () => {
    const now = Date.parse("2026-10-06T00:00:00.000Z");
    writePendingSubmission("fresh", record("fresh"), new Date(now - PENDING_SUBMISSION_TTL_MS + 1000));
    writePendingSubmission("old", record("old"), new Date(now - PENDING_SUBMISSION_TTL_MS - 1000));
    localStorage.setItem(KEY("legacy"), JSON.stringify(record("legacy")));
    localStorage.setItem(KEY("broken"), "{");
    localStorage.setItem("unrelated", "keep");

    sweepExpiredPendingSubmissions(now);

    expect(readPendingSubmission("fresh")).not.toBeNull();
    expect(localStorage.getItem(KEY("old"))).toBeNull();
    expect(localStorage.getItem(KEY("broken"))).toBeNull();
    expect(readPendingSubmission("legacy")?.createdAt).toBe(new Date(now).toISOString());
    expect(localStorage.getItem("unrelated")).toBe("keep");
    localStorage.removeItem("unrelated");
  });
});
