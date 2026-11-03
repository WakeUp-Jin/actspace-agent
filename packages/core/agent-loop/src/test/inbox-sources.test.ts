import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { MainAgentInbox } from "@actspace/agent";

function session(): SessionHandle {
  const registry = createCoreCodecRegistry();
  return SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: "parent", createdAt: "2026-11-03T00:00:00.000Z", lineage: null,
    createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
}

describe("MainAgentInbox sources", () => {
  it("defaults to task_notification so existing callers keep their behaviour", async () => {
    const handle = session();
    const item = await new MainAgentInbox(handle).enqueue("done");
    expect(item.source).toBe("task_notification");
    expect(handle.journal.events.at(-1)?.data).toMatchObject({ operation: "enqueue", source: "task_notification" });
  });

  it("records subagent notifications and agent messages with their sender, and both wake the Session", async () => {
    const handle = session();
    const inbox = new MainAgentInbox(handle);
    await inbox.enqueue("<subagent_notification/>", undefined, { source: "subagent_notification" });
    expect(inbox.hasPendingNotifications()).toBe(true);
    await inbox.enqueue("<agent_message/>", undefined, { source: "agent_message", senderId: "child-1" });
    expect(inbox.pending().map(item => [item.source, item.senderId])).toEqual([["subagent_notification", undefined], ["agent_message", "child-1"]]);
    const claimed = await inbox.claim();
    expect(claimed).toHaveLength(2);
    expect(handle.journal.events.at(-1)?.data).toMatchObject({ operation: "claim", source: "agent_message", senderId: "child-1" });
    expect(inbox.hasPendingNotifications()).toBe(false);
  });

  it("requires a sender for agent messages", async () => {
    await expect(new MainAgentInbox(session()).enqueue("hi", undefined, { source: "agent_message" })).rejects.toThrow(/senderId/);
  });

  it("keeps notifications and agent messages across discardAll", async () => {
    const handle = session();
    const inbox = new MainAgentInbox(handle);
    await inbox.enqueue("a", undefined, { source: "subagent_notification" });
    await inbox.enqueue("b", undefined, { source: "agent_message", senderId: "child-1" });
    await inbox.discardAll("aborted");
    expect(inbox.pending()).toHaveLength(2);
  });
});
