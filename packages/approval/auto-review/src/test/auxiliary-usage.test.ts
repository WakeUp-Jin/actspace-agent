import { expect, it, vi } from "vitest";
import { type AuxiliaryRequestStart, EMPTY_LLM_USAGE, LlmRouteRegistry, LlmService } from "@actspace/llm-service";
import { createAutoReviewer } from "../review.js";
it("accounts a completed provider request even when review JSON is invalid", async () => {
  const routes = new LlmRouteRegistry();
  const usage = { ...EMPTY_LLM_USAGE, inputTokens: 7, outputTokens: 3, source: "provider-reported" as const };
  const finish = vi.fn(async () => {}), start = vi.fn(async (_input: AuxiliaryRequestStart) => ({ finish }));
  const route = routes.register({ routeId: "auto-review", providerId: "fixture", modelPattern: "*", credentialRef: "fixture", defaults: {}, adapter: { adapterVersion: "test", dispatch: async () => (async function* () { yield { type: "done" as const, usage, stopReason: "stop", content: [{ type: "text" as const, text: "invalid JSON" }] }; })() } });
  try {
    const reviewer = createAutoReviewer(new LlmService(routes, { resolve: async () => ({}) }), { start });
    await expect(reviewer.review({ sessionId: "s", agentRunId: "r", turnId: "t", stepId: "step", callId: "c", logicalRequestId: "review-logical", model: "review-model", snapshot: {}, signal: new AbortController().signal })).rejects.toThrow();
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s", agentRunId: "r", turnId: "t", stepId: "step", callId: "c", purpose: "auto-review", model: "review-model", logicalRequestId: "review-logical" }));
    expect(finish).toHaveBeenCalledExactlyOnceWith({ status: "completed", usage });
  } finally { await route.dispose(); }
});
