import type { ToolBodyResult } from "@actspace/tool-runtime";

export type DeepSearchFailure = { readonly code: string; readonly message: string; readonly retryable: boolean };

/** DeepSeek's own error text is cut to this many characters before it reaches the model or the UI. */
export const MAX_UPSTREAM_MESSAGE_CHARS = 500;

/** Removes anything that looks like a credential; failure messages may echo request headers. */
export function redact(message: string): string {
  return message
    .replace(/((?:Bearer|x-api-key|api[_-]?key)[\s:=]+)[^\s,"']+/gi, "$1[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]");
}

export function upstreamMessage(message: string): string {
  return redact(message).slice(0, MAX_UPSTREAM_MESSAGE_CHARS);
}

export function failedResult(failure: DeepSearchFailure): ToolBodyResult {
  const message = redact(failure.message);
  return { status: "failed", summary: message, modelOutput: [{ type: "text", text: message }], failure: { ...failure, message } };
}
