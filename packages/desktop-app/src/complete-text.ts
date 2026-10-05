import type { LlmMessage, LlmService, LlmUsage } from "@actspace/llm-service";

export async function completeText(llm: LlmService, input: { readonly messages: readonly LlmMessage[]; readonly model?: string; readonly purpose?: "chat" | "utility"; readonly sessionId?: string; readonly signal?: AbortSignal }) {
  const model = input.model ?? "default";
  const routeId = input.purpose === "utility" ? "utility" : llm.routes.list()[0]?.routeId ?? "default";
  const prepared = llm.prepare({ routeId, model, messages: input.messages, ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }), ...(input.signal === undefined ? {} : { signal: input.signal }) });
  let text = "";
  let usage: LlmUsage = { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, cost: null, costCurrency: null, source: "unknown" };
  let stopReason: string | null = null;
  try {
    const stream = await prepared.dispatch();
    for await (const event of stream) {
      if (event.type === "text-delta") text += event.text;
      if (event.type === "error") throw new Error(event.failure.message);
      if (event.type === "aborted") throw new Error(event.reason || "LLM request was aborted.");
      if (event.type === "done") {
        usage = event.usage;
        stopReason = event.stopReason;
        if (!text) text = event.content.filter((block) => block.type === "text").map((block) => block.text).join("");
      }
    }
  } finally { prepared.release(); }
  return Object.freeze({ text, model, provider: routeId, usage, stopReason });
}
