import { describe, expect, it } from "vitest";
import { manifest } from "../manifest.js";
import { apply } from "../plugin.js";
import { HeadlessRunner } from "../runner.js";

describe("headless plugin", () => {
  it("declares a loadable headless runner", () => {
    expect(manifest.behaviors[0]?.entryId).toBe("headless.runner");
    expect(typeof apply).toBe("function");
  });

  it("drives followup through the durable session service", async () => {
    const events: string[] = [];
    const session = { header: { sessionId: "session-1" }, journal: { events: [] }, append: async () => { events.push("append"); }, flush: async () => { events.push("flush"); } } as never;
    const agent = { followup: async () => { events.push("followup"); return { agentRunId: "run-1", turnId: "turn-1", reason: "completed", steps: 1, finalText: "ok" }; }, waitForIdle: async () => { events.push("idle"); } } as never;
    const runner = new HeadlessRunner({
      host: { enabled: true, content: "hello", persistent: false, appExit: (code) => { events.push(`exit:${code}`); } },
      sessions: { create: async () => session, createEphemeral: async () => session, resume: async () => session, snapshot: () => ({ sessionId: "session-1" }) as never },
      agents: { attach: async () => agent } as never,
      context: { parallel: async (type: unknown) => { events.push(String(type)); } },
    });
    const result = await runner.run();
    expect(result.finalText).toBe("ok");
    expect(events).toEqual(["headless/started", "followup", "idle", "flush", "exit:0", "headless/completed"]);
  });
});
