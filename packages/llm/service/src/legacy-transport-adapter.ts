import type { LlmAdapter, LlmAdapterDispatchInput } from "./adapter.js";
import type { LlmStreamSource } from "./stream.js";

export interface LegacyLlmTransport {
  send(input: LlmAdapterDispatchInput): Promise<LlmStreamSource>;
}

export class LegacyTransportAdapter implements LlmAdapter {
  readonly adapterVersion = "actspace-legacy-transport-v2";
  constructor(private readonly transport: LegacyLlmTransport) {}
  dispatch(input: LlmAdapterDispatchInput): Promise<LlmStreamSource> { return this.transport.send(input); }
}
