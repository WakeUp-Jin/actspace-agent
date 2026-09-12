import type { LlmRequestOptions } from "@actspace/llm-service";

/** Provider wire fields shared by direct and proxy transports. */
export function reasoningPayload(route: string, provider: string, options: LlmRequestOptions): Record<string, unknown> {
  if (options.reasoning === undefined && options.reasoningEffort === undefined) return {};
  const enabled = options.reasoning !== false;
  const effort = options.reasoningEffort ?? (provider === "custom" ? undefined : "high");
  if (provider === "custom" && enabled && effort === undefined) return {};
  if (provider === "custom" && route === "anthropic-messages") {
    if (!enabled) return { thinking: { type: "disabled" } };
    if (!["low", "medium", "high", "xhigh", "max"].includes(effort!)) throw new Error("Anthropic effort must be low, medium, high, xhigh or max.");
    return { thinking: { type: "adaptive" }, output_config: { effort } };
  }
  if (route === "openai-responses") return { reasoning: { effort: enabled ? effort : "none", summary: "auto" } };
  if (route !== "openai-completions") return {};
  if (provider === "deepseek" || provider === "kimi") return {
    thinking: { type: enabled ? "enabled" : "disabled" },
    ...(enabled && provider === "deepseek" ? { reasoning_effort: effort } : {}),
  };
  if (provider === "openrouter") return { reasoning: enabled ? { effort } : { enabled: false } };
  return { reasoning_effort: enabled ? effort : "none" };
}

/** Remove SDK inferred defaults for generic connections before applying explicit choices. */
export function withReasoningPayload(payload: Record<string, unknown>, route: string, provider: string, options: LlmRequestOptions): Record<string, unknown> {
  const result = { ...payload };
  if (provider === "custom") {
    delete result.reasoning; delete result.reasoning_effort; delete result.thinking;
    if (result.output_config && typeof result.output_config === "object") {
      const output = { ...result.output_config as Record<string, unknown> }; delete output.effort;
      if (Object.keys(output).length) result.output_config = output; else delete result.output_config;
    }
  }
  const patch = reasoningPayload(route, provider, options);
  return { ...result, ...patch, ...(patch.output_config ? { output_config: { ...(result.output_config as Record<string, unknown> | undefined), ...(patch.output_config as Record<string, unknown>) } } : {}) };
}
