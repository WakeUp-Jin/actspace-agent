import { expect, it, vi } from "vitest";
import { type AuxiliaryRequestStart, EMPTY_LLM_USAGE, LlmRouteRegistry, LlmService } from "@actspace/llm-service";
import { completeText } from "../complete-text.js";
it("records title usage against its Session without inventing a Run", async () => {
  const routes = new LlmRouteRegistry();
  const usage = { ...EMPTY_LLM_USAGE, inputTokens: 41, outputTokens: 0, source: "provider-reported" as const };
  const finish = vi.fn(async () => {}), start = vi.fn(async (_input: AuxiliaryRequestStart) => ({ finish }));
  const route = routes.register({ routeId: "utility", providerId: "fixture", modelPattern: "*", credentialRef: "fixture", defaults: {}, adapter: { adapterVersion: "test", dispatch: async () => (async function* () { yield { type: "done" as const, usage, stopReason: "stop", content: [{ type: "text" as const, text: "Title" }] }; })() } });
  try {
    const result = await completeText(new LlmService(routes, { resolve: async () => ({}) }), { sessionId: "s", purpose: "utility", model: "title-model", messages: [], auxiliary: { recorder: { start }, owner: { sessionId: "s", purpose: "session-title" } } });
    expect(result.text).toBe("Title");
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s", purpose: "session-title", routeId: "utility", model: "title-model", attempt: 1, attemptId: expect.any(String) }));
    expect(start.mock.calls[0]![0]).not.toHaveProperty("agentRunId");
    expect(finish).toHaveBeenCalledExactlyOnceWith({ status: "completed", usage });
  } finally { await route.dispose(); }
});
