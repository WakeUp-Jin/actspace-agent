import { expect, it, vi } from "vitest";
import { type AuxiliaryRequestStart, EMPTY_LLM_USAGE, LlmRouteRegistry, LlmService } from "@actspace/llm-service";
import { LlmCompactionSummarizer } from "../summarizer.js";
it("counts each repeated between-turn compaction as a distinct auxiliary request", async () => {
  const routes = new LlmRouteRegistry();
  const finish = vi.fn(async () => {}), start = vi.fn(async (_input: AuxiliaryRequestStart) => ({ finish }));
  const route = routes.register({ routeId: "utility", providerId: "fixture", modelPattern: "*", credentialRef: "fixture", defaults: {}, adapter: { adapterVersion: "test", dispatch: async () => (async function* () { yield { type: "done" as const, usage: EMPTY_LLM_USAGE, stopReason: "stop", content: [{ type: "text" as const, text: "Summary" }] }; })() } });
  try {
    const summarizer = new LlmCompactionSummarizer({ llm: new LlmService(routes, { resolve: async () => ({}) }), routeId: "utility", model: "compact-model", recorder: { start } });
    await summarizer.summarize([], { sessionId: "s" });
    await summarizer.summarize([], { sessionId: "s" });
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[0]![0]).toMatchObject({ sessionId: "s", purpose: "compaction", model: "compact-model" });
    expect(start.mock.calls[0]![0]).not.toHaveProperty("agentRunId");
    expect(start.mock.calls[0]![0].attemptId).not.toBe(start.mock.calls[1]![0].attemptId);
    expect(finish).toHaveBeenCalledTimes(2);
    expect(finish).toHaveBeenCalledWith({ status: "completed", usage: EMPTY_LLM_USAGE });
  } finally { await route.dispose(); }
});
