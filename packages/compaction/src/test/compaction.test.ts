import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { CompactionPlugin, DEFAULT_COMPACTION_POLICY, DeterministicCompactionSummarizer } from "../index.js";

describe("Compaction", () => {
  it("appends a transaction and never deletes the original Surface facts", async () => {
    const registry = createCoreCodecRegistry();
    const session = SessionHandle.createEphemeral({
      registry,
      header: createSessionHeader({ sessionId: "session", createdAt: "2026-08-23T00:00:00.000Z", lineage: null, createdWith: { profileId: "base", runtimeContractVersion: "actspace.runtime.v2", manifestDigest: "manifest", plugins: [{ id: "@actspace/core", version: "2.0.0" }], codecSetDigest: registry.digest } }),
      now: () => "2026-08-23T00:00:00.000Z",
    });
    for (let index = 0; index < 5; index += 1) {
      await session.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: `m-${index}` }, surface: { kind: "append", node: { kind: "user", messageId: `m-${index}`, content: `message-${index}` } } });
    }
    const plugin = new CompactionPlugin({ ...DEFAULT_COMPACTION_POLICY, contextLimitTokens: 10, reserveTokens: 0, triggerRatio: 0.5 }, new DeterministicCompactionSummarizer());
    expect(await plugin.maybeCompact(session, { inputTokens: 10, outputTokens: 0 })).toBe(true);
    await expect(plugin.compact(session)).resolves.toBe(false);
    expect(session.journal.events).toHaveLength(9);
    expect(session.journal.events[7]?.type).toBe("surface/replaced");
    expect(session.journal.surface.entries).toHaveLength(2);
    await session.close();
  });
});
