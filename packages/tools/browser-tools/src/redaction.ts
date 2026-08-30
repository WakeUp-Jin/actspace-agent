export function redactBrowserValue(value: string): string {
  return value
    .replace(/("(?:__browser_action_hash|__browser_approval|authorization|cookie|cookies|headers|password|secret|token)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, "$1\"[REDACTED]\"")
    .replace(/((?:authorization|cookie|token|password|secret)\s*[:=]\s*)[^,\s]+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:access_token|api_key|key|token)=)[^&#\s]+/gi, "$1[REDACTED]");
}
