import { expect, it, vi } from "vitest";
import { AgentApplication } from "../application.js";

function app(subagents?: Record<string, unknown>) {
  const services: Record<string, unknown> = { "session.runtime": {}, "agent.runtime": { runs: { service: {} }, subagents } };
  return new AgentApplication({ get: (key: string) => services[key] } as never);
}

it("stops a subagent for the 子 Agent panel through the manager's user stop", async () => {
  const stopByUser = vi.fn(async () => ({ ok: true, message: "Stopped subagent sa-1." }));
  await expect(app({ activeCount: 1, runningCount: () => 1, stopByUser }).interruptSubagent("s", "sa-1")).resolves.toEqual({ ok: true, message: "Stopped subagent sa-1." });
  expect(stopByUser).toHaveBeenCalledWith("s", "sa-1");
});

it("passes a refusal through and says so when the runtime has no subagents", async () => {
  const stopByUser = vi.fn(async () => ({ ok: false, message: "Subagent sa-9 is not running." }));
  await expect(app({ activeCount: 0, runningCount: () => 0, stopByUser }).interruptSubagent("s", "sa-9")).resolves.toEqual({ ok: false, message: "Subagent sa-9 is not running." });
  await expect(app().interruptSubagent("s", "sa-1")).rejects.toThrow("Subagents are unavailable");
});
