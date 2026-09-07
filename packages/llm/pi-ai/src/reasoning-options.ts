import type { LlmRequestOptions } from "@actspace/llm-service";

/** Provider wire fields shared by direct and proxy transports. */
export function reasoningPayload(route: string, provider: string, options: LlmRequestOptions): Record<string, unknown> {
  if (options.reasoning === undefined && options.reasoningEffort === undefined) return {};
  const enabled = options.reasoning !== false;
  const effort = options.reasoningEffort ?? "high";
  if (route === "openai-responses") return { reasoning: { effort: enabled ? effort : "none", summary: "auto" } };
  if (route !== "openai-completions") return {};
  if (provider === "deepseek" || provider === "kimi") return {
    thinking: { type: enabled ? "enabled" : "disabled" },
    ...(enabled && provider === "deepseek" ? { reasoning_effort: effort } : {}),
  };
  if (provider === "openrouter") return { reasoning: enabled ? { effort } : { enabled: false } };
  return { reasoning_effort: enabled ? effort : "none" };
}
