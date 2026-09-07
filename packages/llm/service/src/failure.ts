export type LlmFailureKind = "authentication" | "permission" | "quota" | "rate-limit" | "provider" | "proxy" | "network" | "timeout" | "abort" | "context-overflow" | "invalid-request" | "malformed-stream" | "unsupported-capability" | "unknown";

export type LlmFailure = {
  readonly kind: LlmFailureKind;
  readonly message: string;
  readonly retryable: boolean;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;
  readonly attempt: number;
  readonly providerCode?: string;
  readonly causeCode?: string;
  readonly providerMessage?: string;
};

export class LlmRuntimeError extends Error {
  constructor(readonly failure: LlmFailure, cause?: unknown) { super(failure.message, { cause }); this.name = "LlmRuntimeError"; }
}

export function retryAfterMsFromUnknown(error: unknown): number | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const object = error as { readonly headers?: unknown; readonly retryAfterMs?: unknown; readonly retryAfter?: unknown };
  if (typeof object.retryAfterMs === "number" && Number.isFinite(object.retryAfterMs) && object.retryAfterMs >= 0) return Math.round(object.retryAfterMs);
  const value = object.retryAfter ?? headersValue(object.headers, "retry-after");
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value * 1_000);
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

export function providerCodeFromUnknown(error: unknown): string | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const value = (error as { readonly code?: unknown }).code ?? ((error as { readonly error?: { readonly code?: unknown } }).error?.code);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function headersValue(headers: unknown, name: string): unknown {
  if (headers !== null && typeof headers === "object" && "get" in headers && typeof (headers as { get?: unknown }).get === "function") return (headers as { get(key: string): unknown }).get(name);
  if (headers !== null && typeof headers === "object") {
    const record = headers as Record<string, unknown>;
    return record[name] ?? record[name.toLowerCase()] ?? record["Retry-After"];
  }
  return undefined;
}
