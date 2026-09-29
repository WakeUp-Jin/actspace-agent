import { expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { createSessionProjectionService } from "@actspace/session-projection";
import { codecs } from "../codec.js";
import { TODO_EVENT_TYPE } from "../manifest.js";

it("runs todo_write through Journal and projection, reads it back and removes tools on dispose", async () => {
  const { SessionHandle } = await import("@actspace/session-persistence");
  const { ToolRuntime } = await import("@actspace/tools-runtime");
  const { apply } = await import("../plugin.js");
  const registry = createCoreCodecRegistry(codecs);
  const header = createSessionHeader({ sessionId: "todo-golden", createdAt: "2026-09-28T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } });
  const session = SessionHandle.createEphemeral({ header, registry });
  const tools = new ToolRuntime();
  const projectionService = createSessionProjectionService();
  let cleanup: (() => Promise<void>) | undefined;
  apply({ get: id => ({ "tools.runtime": tools, "session.runtime": { getOpen: () => session }, "session.projection": projectionService })[id], provide: () => undefined, effect: (factory: () => () => Promise<void>) => { cleanup = factory(); } } as never);
  const projection = projectionService.createRegistry();
  projectionService.applyContributors(projection, text => text);
  const env: import("@actspace/tools-runtime").ToolPreparedEnvironment = {
    workspaceRoot: "/workspace", hostCapabilities: new Set(), capabilitySet: { ids: [], has: () => false, get: () => { throw Error("unused"); } },
    journal: { recordDispatch: async () => {}, checkpointBeforeBody: async () => {}, commitResult: async () => {} }, createArtifact: async () => { throw Error("unused"); },
  };
  const run = (name: string, args: unknown) => tools.executeBatch([{ name, callId: name, arguments: args, sessionId: header.sessionId, agentRunId: "run", turnId: "turn", stepId: "step" }], env);
  const write = await run("todo_write", { todos: [{ content: "Complete migration", status: "in_progress" }] });
  expect(write[0]?.status).toBe("completed");
  expect(session.journal.events.map(event => event.type)).toEqual([TODO_EVENT_TYPE]);
  projection.sync(header.sessionId, session.journal.events);
  expect(projection.snapshot(header.sessionId).values.todos).toEqual([expect.objectContaining({ text: "Complete migration", state: "in_progress" })]);
  expect(JSON.stringify(await run("todo_read", {}))).toContain("Complete migration");
  await cleanup!();
  await expect(run("todo_read", {})).rejects.toMatchObject({ failure: { code: "TOOL_NOT_FOUND" } });
  await session.close();
});
