import { describe, expect, it } from "vitest";
import { createCordisRoot, onHook, type CordisContext } from "@actspace/cordis-adapter";
import { LOOP_CHECKPOINT_VIEW } from "../loop.js";
import { runToolStreamFixture } from "../testing.js";

/** 真实的 Cordis 根 context，带上 Loop 必须有的 checkpoint 服务。监听器用 onHook 注册，和插件的写法一样。 */
async function withRoot<T>(run: (context: CordisContext) => Promise<T>): Promise<T> {
  const root = await createCordisRoot();
  root.context.provide?.(LOOP_CHECKPOINT_VIEW.id, { flush: async () => {} });
  try {
    return await run(root.context);
  } finally {
    await root.dispose();
  }
}

describe("Loop hooks registered with onHook", () => {
  it("writes what agent/pre-step returns into the step's start record", async () => {
    const agents: unknown[] = [];
    const run = await withRoot(async (context) => {
      onHook(context, "agent/pre-step", async (payload, next) => {
        agents.push(payload.agent);
        return { ...(await next()), note: `step ${payload.stepIndex}` };
      });
      return await runToolStreamFixture({ context });
    });
    const starts = run.journal
      .filter((event) => event.type === "step/start")
      .map((event) => event.data as { stepId: string; metadata: Record<string, unknown> });
    expect(starts).toMatchObject([
      { stepIndex: 1, metadata: { stepIndex: 1, note: "step 1" } },
      { stepIndex: 2, metadata: { stepIndex: 2, note: "step 2" } },
    ]);
    // 内置行为返回的是分发方给的字段：和记录本身同一步，不带 dispatcher 填的 agent。
    for (const start of starts) {
      expect(start.metadata.stepId).toBe(start.stepId);
      expect(start.metadata).not.toHaveProperty("agent");
    }
    expect(agents).toEqual([
      { agentId: "main:test", scopeId: "main:test" },
      { agentId: "main:test", scopeId: "main:test" },
    ]);
  });

  it("ends the turn whatever agent/turn-stopping returns", async () => {
    const calls: string[] = [];
    const run = await withRoot(async (context) => {
      onHook(context, "agent/turn-stopping", (payload) => {
        calls.push(`first: ${payload.reason} after ${payload.stepCount} steps`);
        return "keep going";
      });
      onHook(context, "agent/turn-stopping", () => {
        calls.push("second");
      });
      return await runToolStreamFixture({ context });
    });
    // 第一个监听器返回了值，后面的不再被调用；Loop 不读这个值。
    expect(calls).toEqual(["first: completed after 2 steps"]);
    expect(run.result).toMatchObject({ reason: "completed", steps: 2 });
    expect(run.journal.filter((event) => event.type === "turn/end").map((event) => event.data)).toMatchObject([
      { reason: "completed" },
    ]);
  });
});
