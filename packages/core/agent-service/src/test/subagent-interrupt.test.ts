import { expect, it, vi } from "vitest";
import { AgentApplication } from "../application.js";

function app(subagents?: Record<string, unknown>) {
  const services: Record<string, unknown> = { "session.runtime": {}, "agent.runtime": { runs: { service: {} }, subagents } };
  return new AgentApplication({ get: (key: string) => services[key] } as never);
}

it("stops a subagent for the 子 Agent panel the way interrupt_agent does", async () => {
  const interrupt = vi.fn(async () => ({ ok: true, text: "Interrupt requested for sa-1." }));
  await expect(app({ activeCount: 1, running: () => [], interrupt }).interruptSubagent("s", "sa-1")).resolves.toEqual({ ok: true, message: "Interrupt requested for sa-1." });
  expect(interrupt).toHaveBeenCalledWith({ sessionId: "s", callId: "user-interrupt:sa-1", agentId: "sa-1" });
});

it("passes a refusal through and says so when the runtime has no subagents", async () => {
  const interrupt = vi.fn(async () => ({ ok: false, code: "UNKNOWN_AGENT", text: "No subagent sa-9." }));
  await expect(app({ activeCount: 0, running: () => [], interrupt }).interruptSubagent("s", "sa-9")).resolves.toEqual({ ok: false, message: "No subagent sa-9." });
  await expect(app().interruptSubagent("s", "sa-1")).rejects.toThrow("Subagents are unavailable");
});
