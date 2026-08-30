import type { LlmAdapter, LlmAdapterDispatchInput } from "@actspace/llm-service";
import type { LlmStreamSource } from "@actspace/llm-service";

export interface PiAiEngine {
  stream(input: LlmAdapterDispatchInput): Promise<LlmStreamSource>;
  dispose?(): Promise<void>;
}

export type PiAiAdapterOptions = { readonly engine: PiAiEngine; readonly legacyProxyEngine?: PiAiEngine };

/** The pi-ai SDK stays behind this boundary; proxied calls use the explicit legacy backend. */
export class PiAiAdapter implements LlmAdapter {
  readonly adapterVersion: string;
  readonly #engine: PiAiEngine;
  readonly #legacyProxyEngine: PiAiEngine | undefined;
  constructor(engine: PiAiEngine | PiAiAdapterOptions, adapterVersion = "pi-ai-0.82.1") {
    this.#engine = "engine" in engine ? engine.engine : engine;
    this.#legacyProxyEngine = "engine" in engine ? engine.legacyProxyEngine : undefined;
    this.adapterVersion = adapterVersion;
  }
  async dispatch(input: LlmAdapterDispatchInput): Promise<LlmStreamSource> {
    if (input.credential.proxyUrl !== undefined) {
      if (this.#legacyProxyEngine === undefined) throw new Error("pi-ai scoped proxy is unavailable; this route requires the ActSpace legacy proxy backend.");
      return this.#legacyProxyEngine.stream(input);
    }
    return this.#engine.stream(input);
  }
  async dispose(): Promise<void> {
    await Promise.all([this.#engine.dispose?.(), this.#legacyProxyEngine?.dispose?.()]);
  }
}
