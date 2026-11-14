import { describe, expect, it } from "vitest";
import { CORE_EVENT_OWNER, coreEvent } from "../core-events";

describe("coreEvent", () => {
  it("builds a version 1 candidate owned by core that leaves the conversation alone", () => {
    const data = { turnId: "t1", agentRunId: "r1", mode: "agent", modeRevision: 2 } as const;
    const event = coreEvent("turn/start", data);
    expect(event).toEqual({
      type: "turn/start",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data,
      surface: null,
    });
    expect(event.data).toBe(data);
    expect(CORE_EVENT_OWNER).toBe("@actspace/core");
  });

  it("omits provenance unless one is given, so the journal fills in its default", () => {
    expect(Object.keys(coreEvent("session/pinned-set", { pinned: true }))).toEqual([
      "type",
      "eventVersion",
      "source",
      "data",
      "surface",
    ]);
  });

  it("passes the surface operation and the provenance through", () => {
    const provenance = { sourceEventSeqs: [3], contributorIds: ["core/inbox"], runtimeSelectionSeq: null };
    const event = coreEvent(
      "user/message",
      { messageId: "m1", agentRunId: "r1", content: "hi" },
      { surface: { kind: "append" }, provenance },
    );
    expect(event.surface).toEqual({ kind: "append" });
    expect(event.provenance).toBe(provenance);
  });

  it("treats an explicit null surface like an omitted one", () => {
    expect(coreEvent("session/title-set", { title: null }, { surface: null }).surface).toBeNull();
  });
});
