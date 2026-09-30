import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";

export async function compactionSession() {
  const registry = createCoreCodecRegistry();
  const session = SessionHandle.createEphemeral({
    registry,
    header: createSessionHeader({ sessionId: "compaction-regression", createdAt: "2026-09-30T00:00:00.000Z", lineage: null, createdWith: { profileId: "base", runtimeContractVersion: "actspace.runtime.v2", manifestDigest: "manifest", plugins: [{ id: "@actspace/core", version: "2.0.0" }], codecSetDigest: registry.digest } }),
    now: () => "2026-09-30T00:00:00.000Z",
  });
  for (let index = 0; index < 5; index += 1) {
    await session.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: `m-${index}` }, surface: { kind: "append", node: { kind: "user", messageId: `m-${index}`, content: `message-${index}` } } });
  }
  return session;
}
