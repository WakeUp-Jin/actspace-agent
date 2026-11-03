import { describe, expect, it } from "vitest";
import { CordisContextClass } from "@actspace/cordis-adapter";
import type { RunningSubagent } from "@actspace/subagent";
import { apply } from "../plugin.js";
import { createSubagentsSource } from "../source.js";

const agent = (agentId: string, label = "general"): RunningSubagent => ({ agentId, description: `task ${agentId}`, label, startedAt: "2026-11-03T06:02:11.000Z", transcriptPath: `/data/sessions-v2/${agentId}/transcript.md` });
const hhmm = (() => { const time = new Date("2026-11-03T06:02:11.000Z"); return `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`; })();

function run(source: ReturnType<typeof createSubagentsSource>, turnId: string, sessionId = "s") {
  const written: string[] = [];
  void source.get({ request: { sessionId, turnId } } as never, content => { for (const item of content.supplements ?? []) written.push(item.text); });
  return written;
}

describe("running subagents context source", () => {
  it("writes nothing while no subagent runs", () => {
    expect(run(createSubagentsSource({ running: () => [] }), "t1")).toEqual([]);
  });

  it("lists running subagents once per turn", () => {
    let running = [agent("a"), agent("b", "explore")];
    const asked: string[] = [];
    const source = createSubagentsSource({ running: sessionId => { asked.push(sessionId); return running; } });
    const first = run(source, "t1");
    expect(first).toEqual([[
      "Running subagents (this list supersedes earlier ones):",
      `- a · task a · general · started ${hhmm} · transcript: /data/sessions-v2/a/transcript.md`,
      `- b · task b · explore · started ${hhmm} · transcript: /data/sessions-v2/b/transcript.md`,
    ].join("\n")]);
    running = [agent("b", "explore")];
    expect(run(source, "t1")).toEqual(first);
    expect(run(source, "t2")[0]).not.toContain("- a ·");
    running = [];
    expect(run(source, "t3")).toEqual([]);
    expect(asked).toEqual(["s", "s", "s"]);
  });

  it("publishes and disposes its source factory", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("context.source.subagents")).toHaveProperty("create");
    await ctx.fiber.dispose();
    expect(ctx.get("context.source.subagents")).toBeUndefined();
  });
});
