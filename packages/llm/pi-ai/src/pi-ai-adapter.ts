import { catalogProviderForEndpoint } from "@actspace/shared";
import { createRequestRedactor, type LlmAdapter, type LlmAdapterDispatchInput, type LlmStreamSource } from "@actspace/llm-service";
import { LegacyProxyWireEngine, type LegacyProxyWireEngineOptions } from "./legacy-proxy-wire-engine.js";
import { streamPiAi, type PiAiConnectionOptions } from "./pi-ai-stream.js";

export type PiAiAdapterOptions = {
  readonly wire: PiAiConnectionOptions;
  readonly legacyProxy?: LegacyProxyWireEngineOptions;
};

/** The sole backend selection boundary; no fallback after Provider I/O. */
export class PiAiAdapter implements LlmAdapter {
  constructor(private readonly options: PiAiAdapterOptions, readonly adapterVersion = "pi-ai-0.82.1") {}

  async dispatch(input: LlmAdapterDispatchInput): Promise<LlmStreamSource> {
    const wire = this.options.wire;
    const hasImage = input.request.messages.some((message) => typeof message.content !== "string" && message.content.some((block) => block.type === "image"));
    const endpoint = input.credential.baseUrl ?? wire.baseUrl ?? "";
    const needsLegacy = input.credential.proxyUrl !== undefined
      || (catalogProviderForEndpoint(endpoint) === "openrouter" && wire.route !== "anthropic-messages")
      || (hasImage && wire.providerId === "deepseek" && wire.route === "openai-completions" && wire.deepSeekFiles !== undefined);
    // Host routing may bind credentials after PreparedLlmCall has resolved them.
    // Sanitize with the actual wire credential before failures leave this adapter.
    const redactor = createRequestRedactor(input.credential);
    try {
      const source = needsLegacy
        ? await new LegacyProxyWireEngine(this.options.legacyProxy ?? wire).stream(input)
        : await streamPiAi(wire, input);
      return redactor.stream(source);
    } catch (error) {
      throw redactor.error(error);
    }
  }
}
