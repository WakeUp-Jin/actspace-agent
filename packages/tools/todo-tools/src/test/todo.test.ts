import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, defaultSessionProvenance, SessionJournal, validateSessionEvents } from "@actspace/session-journal";
import { createSessionProjectionService } from "@actspace/session-projection";
import { codecs } from "../codec.js";
import { TODO_EVENT_TYPE, TODO_PLUGIN_ID } from "../manifest.js";
import { todoProjectionContributor } from "../projection.js";

describe("Todo plugin event and projection", () => {
  it("folds new Todo deltas into the registered projection", () => {
    const registry = createCoreCodecRegistry(codecs);
    const header = createSessionHeader({ sessionId: "todo-new", createdAt: "2026-09-28T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } });
    const journal = new SessionJournal({ registry, now: () => "2026-09-28T00:00:00Z" });
    for (const items of [
      [{ todoId: "a", revision: 1, text: "A", state: "pending", createdAt: "a", updatedAt: "a" }],
      [{ todoId: "b", revision: 1, text: "B", state: "pending", createdAt: "b", updatedAt: "b" }],
      [{ todoId: "a", revision: 2, text: "A2", state: "completed", updatedAt: "a2" }],
    ]) journal.append({ type: TODO_EVENT_TYPE, eventVersion: 1, source: { ownerPluginId: TODO_PLUGIN_ID }, data: { items, revision: items[0]!.revision }, surface: null });
    const service = createSessionProjectionService();
    service.registerContributor(todoProjectionContributor);
    const projection = service.createRegistry();
    service.applyContributors(projection, text => text);
    projection.sync(header.sessionId, journal.events);
    expect(projection.snapshot(header.sessionId).values.todos).toEqual([
      { todoId: "a", revision: 2, text: "A2", state: "completed", createdAt: "a", updatedAt: "a2" },
      { todoId: "b", revision: 1, text: "B", state: "pending", createdAt: "b", updatedAt: "b" },
    ]);
  });

  it("marks an old required Todo event browse-only without a compatibility codec", () => {
    const registry = createCoreCodecRegistry(codecs);
    const legacy = {
      recordKind: "event", seq: 0, type: "todo/write", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, provenance: defaultSessionProvenance(),
      criticality: "required", time: "2026-09-28T00:00:00Z", data: { items: [], revision: 1 }, surface: null,
    } as const;
    const validation = validateSessionEvents([legacy], registry);
    expect(validation.accessState).toBe("browse-only");
    expect(validation.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNKNOWN_REQUIRED_CODEC" })]));
  });
});
