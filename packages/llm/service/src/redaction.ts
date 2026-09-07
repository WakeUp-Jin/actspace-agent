export function redactLlmText(value: string): string {
  return value
    .replace(/\b(?:sk|key|token)-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+@/gi, "$1[REDACTED]@");
}
export function redactLlmHeaders(headers: Readonly<Record<string, string>>): Readonly<Record<string, string>> { const output: Record<string, string> = {}; for (const [key, value] of Object.entries(headers)) output[key] = /authorization|api[-_]?key|secret|password|cookie|proxy/i.test(key) ? "[REDACTED]" : redactLlmText(value); return Object.freeze(output); }
