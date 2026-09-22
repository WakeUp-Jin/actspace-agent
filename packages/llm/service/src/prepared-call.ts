import type { LlmAdapterDispatchInput, LlmPreparedAdapterCall, ResolvedLlmRequest } from "./adapter.js";
import type { CredentialResolver } from "./credential-port.js";
import { LlmRuntimeError, type LlmFailure } from "./failure.js";
import type { CapturedLlmRoute } from "./route-registry.js";
import { LlmStreamHandle } from "./stream.js";

export class PreparedLlmCall {
  #dispatched = false;
  #released = false;
  readonly #lease;
  constructor(
    readonly registration: CapturedLlmRoute,
    readonly request: ResolvedLlmRequest,
    private readonly credentials: CredentialResolver,
    private readonly signal: AbortSignal,
    lease = registration.leaseOwner.acquire(),
    private readonly adapterCall?: LlmPreparedAdapterCall,
  ) { this.#lease = lease; }

  async dispatch(): Promise<LlmStreamHandle> {
    if (this.#dispatched) throw new LlmRuntimeError(failure("invalid-request", "Prepared LLM call can only dispatch once."));
    if (this.#released) throw new LlmRuntimeError(failure("abort", "Prepared LLM call has been released."));
    this.#dispatched = true;
    try {
      const credential = await this.credentials.resolve(this.request.credentialRef, this.signal);
      const dispatchInput = { request: this.request, credential, signal: this.signal } satisfies LlmAdapterDispatchInput;
      const source = await (this.adapterCall?.dispatch(dispatchInput) ?? this.registration.adapter.dispatch(dispatchInput));
      const stream = new LlmStreamHandle(source, () => this.release(), async (reason) => { await this.adapterCall?.cancel?.(this.request.requestId); await this.registration.adapter.cancel?.(this.request.requestId); void reason; });
      if (this.signal.aborted) await stream.abort("signal-aborted");
      else this.signal.addEventListener("abort", () => { void stream.abort("signal-aborted"); }, { once: true });
      return stream;
    } catch (error) {
      this.release();
      throw error;
    }
  }

  release(): void { if (this.#released) return; this.#released = true; this.#lease.release(); }
  get dispatched(): boolean { return this.#dispatched; }
  get released(): boolean { return this.#released; }
  get preparedAdapterCall(): LlmPreparedAdapterCall | undefined { return this.adapterCall; }
}

function failure(kind: LlmFailure["kind"], message: string): LlmFailure { return { kind, message, retryable: false, attempt: 1 }; }
