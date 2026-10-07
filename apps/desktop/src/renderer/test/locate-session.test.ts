import { describe, expect, it } from "vitest";
import { encodeSessionLocator } from "@actspace/shared/session-locator";
import { isLocalSession, locateSession } from "../target/locate-session";

describe("locateSession", () => {
  it("tells local, remote and corrupt keys apart without throwing", () => {
    const remote = encodeSessionLocator({ hostId: "host:with:colons", sessionId: "s1" });
    expect(locateSession("session-local")).toEqual({ kind: "local" });
    expect(locateSession(null)).toEqual({ kind: "local" });
    expect(locateSession(remote)).toEqual({ kind: "remote", hostId: "host:with:colons", sessionId: "s1" });
    expect(locateSession("host:corrupt")).toEqual({ kind: "invalid", key: "host:corrupt" });
  });

  it("never treats a corrupt key as a local session", () => {
    expect(isLocalSession("session-local")).toBe(true);
    expect(isLocalSession("host:corrupt")).toBe(false);
  });
});
