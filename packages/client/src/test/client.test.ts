import { describe, expect, it } from "vitest";
import { toClientProjection } from "../index.js";

describe("client projection boundary", () => {
  it("passes only shared projection DTOs", () => {
    const snapshot = { kind: "session-snapshot", schemaVersion: 1, sessionId: "s" } as never;
    expect(toClientProjection(snapshot)).toMatchObject({ schemaVersion: 1, sessionId: "s" });
  });
});
