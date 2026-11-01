import type { LlmCredential } from "./credential-port.js";
import { LlmRuntimeError, type LlmFailure } from "./failure.js";
import { redactLlmText } from "./redaction.js";
import type { LlmStreamSource } from "./stream.js";

/** Lives with one call, never shared across credentials or retained in a global registry. */
export function createRequestRedactor(credential?: LlmCredential) {
  const secrets = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value) return;
    secrets.add(value);
    secrets.add(encodeURIComponent(value));
  };
  add(credential?.apiKey);
  for (const [key, value] of Object.entries(credential?.headers ?? {})) {
    if (!/authorization|api[-_]?key|secret|password|cookie|token/i.test(key)) continue;
    add(value);
    if (/authorization/i.test(key)) add(value.replace(/^\S+\s+/, ""));
  }
  for (const address of [credential?.proxyUrl, credential?.baseUrl]) {
    if (!address) continue;
    try {
      const url = new URL(address);
      for (const part of [url.username, url.password]) {
        add(part);
        try { add(decodeURIComponent(part)); } catch { /* Already encoded malformed input. */ }
      }
    } catch { /* URL-shaped credentials are also handled by the format fallback. */ }
  }
  const patterns = [...secrets].sort((a, b) => b.length - a.length).map((value) => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Very short secrets are matched as fields/tokens, not inside arbitrary prose.
    return new RegExp(value.length < 4 ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped, "gu");
  });
  const text = (value: string): string => {
    for (const pattern of patterns) value = value.replace(pattern, "[REDACTED]");
    return redactLlmText(value);
  };
  const failure = (value: LlmFailure): LlmFailure => ({
    kind: value.kind, message: text(value.message), retryable: value.retryable, attempt: value.attempt,
    ...(value.httpStatus === undefined ? {} : { httpStatus: value.httpStatus }),
    ...(value.retryAfterMs === undefined ? {} : { retryAfterMs: value.retryAfterMs }),
    ...(value.providerCode === undefined ? {} : { providerCode: text(value.providerCode) }),
    ...(value.causeCode === undefined ? {} : { causeCode: text(value.causeCode) }),
    ...(value.providerMessage === undefined ? {} : { providerMessage: text(value.providerMessage) }),
  });
  const error = (value: unknown): LlmRuntimeError => new LlmRuntimeError(
    value instanceof LlmRuntimeError ? failure(value.failure) : {
      kind: "unknown", message: text(value instanceof Error ? value.message : String(value)), retryable: false, attempt: 1,
    },
  ); // Deliberately omit cause, raw stack, headers, and arbitrary provider properties.
  async function* stream(source: LlmStreamSource): LlmStreamSource {
    try {
      for await (const event of source) {
        if (event.type === "error") yield { type: "error", failure: failure(event.failure), ...(event.usage === undefined ? {} : { usage: event.usage }) };
        else if (event.type === "aborted") yield { type: "aborted", reason: text(event.reason), ...(event.usage === undefined ? {} : { usage: event.usage }) };
        else yield event;
      }
    } catch (caught) { throw error(caught); }
  }
  return { text, failure, error, stream };
}
