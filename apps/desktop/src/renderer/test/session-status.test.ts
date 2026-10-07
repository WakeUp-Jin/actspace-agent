import { describe, expect, it } from "vitest";
import { isSessionBusy, SESSION_STATUS_META, sessionStatusOf } from "../components/sidebar/session-status";

describe("sessionStatusOf", () => {
  it("prefers the recorded status, then falls back to the busy set", () => {
    const busy = new Set(["busy", "busy-failed"]);
    const statuses = { "busy-failed": "failed", approval: "waiting_approval", odd: "paused", nothing: undefined };
    expect(sessionStatusOf("busy", busy, statuses)).toBe("running");
    expect(sessionStatusOf("busy-failed", busy, statuses)).toBe("failed");
    expect(sessionStatusOf("approval", busy, statuses)).toBe("waiting_approval");
    expect(sessionStatusOf("other", busy, statuses)).toBe("idle");
    expect(sessionStatusOf("nothing", new Set(["nothing"]), statuses)).toBe("running");
  });

  it("treats unknown or non-string values as idle, even for a busy session", () => {
    expect(sessionStatusOf("odd", new Set(["odd"]), { odd: "paused" })).toBe("idle");
    expect(sessionStatusOf("n", undefined, { n: 1 })).toBe("idle");
    expect(sessionStatusOf("p", undefined, { p: "toString" })).toBe("idle");
    expect(sessionStatusOf("x")).toBe("idle");
  });
});

describe("isSessionBusy", () => {
  it("is true only while a turn is still open", () => {
    expect(Object.keys(SESSION_STATUS_META).filter((status) => isSessionBusy(status as never))).toEqual(["running", "waiting_approval"]);
  });
});
