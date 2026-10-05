import { expect, it } from "vitest";
import { AgentScope } from "@actspace/core-scope";
import { taskCodecs, type RunFactory } from "@actspace/agent-service";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { SessionStore } from "@actspace/session-persistence";
import { MemorySessionStorage } from "@actspace/session-storage/testing";
import type { HarnessLease } from "@actspace/boot";
import { RuntimeSessionController } from "../session/session-controller.js";
import { ManagedRuns } from "./managed-runs.js";

it.each(["completed", "cancelled", "failed"] as const)("returns arbitrary %s Run values after disposal and lease release", async outcome => {
  const registry = createCoreCodecRegistry(); taskCodecs.forEach(codec => registry.register(codec));
  const storage = new MemorySessionStorage(registry);
  const sessions = new RuntimeSessionController({ dataRoot: "/unused", runtimeId: "test", registry, profileId: "test", manifestDigest: "test", plugins: [] }, new SessionStore({ registry }, storage));
  const order: string[] = [];
  const factory: RunFactory = { create: async () => ({ execute: async () => ({ outcome, value: ["custom", { count: 1 }] }), dispose: async () => { order.push("dispose"); } }) };
  const runs = new ManagedRuns(sessions, { acquire: async () => ({ harnessId: "main", generationId: "g1", revision: 1, scope: new AgentScope("run"), context: {}, getService: () => factory, release: async () => { order.push("release"); } }) as unknown as HarnessLease });
  try {
    const session = await sessions.createEphemeral("test");
    const result = await runs.run(session.header.sessionId, { content: "hello" });
    expect(result).toMatchObject({ outcome, value: ["custom", { count: 1 }], taskId: expect.any(String), agentRunId: expect.any(String) });
    expect(order).toEqual(["dispose", "release"]);
  } finally { await runs.dispose(); await sessions.closeAll(); await storage.close(); }
});
