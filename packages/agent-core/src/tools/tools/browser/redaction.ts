import type { ToolResult } from "../../../internal-tools";

export const BROWSER_PERSISTENCE_PLACEHOLDER = "[browser output omitted from persistence]";
export const BROWSER_REDACTED_VALUE = "[redacted]";

const SENSITIVE_ARGUMENT_KEYS = new Set([
  "__browser_action_hash",
  "__browser_approval",
  "authorization",
  "base64",
  "body",
  "cookie",
  "cookies",
  "data",
  "headers",
  "items",
  "password",
  "secret",
  "text",
  "token",
  "value",
]);

export function isBrowserToolName(toolName: string): boolean {
  return toolName.startsWith("browser_");
}

/**
 * Browser inputs may contain passwords, clipboard payloads or page text. Keep
 * routing fields useful for diagnostics while removing payload-bearing fields.
 */
export function sanitizeBrowserToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (!isBrowserToolName(toolName)) return args;
  return sanitizeRecord(args);
}

export function shouldRedactToolResult(toolName: string, result?: ToolResult): boolean {
  return isBrowserToolName(toolName) || result?.redactInPersistence === true;
}

export function browserPersistenceOutput(ok: boolean): string {
  return ok ? BROWSER_PERSISTENCE_PLACEHOLDER : "[browser error details omitted from persistence]";
}

export function sanitizeBrowserToolResult(
  toolName: string,
  result: ToolResult,
): ToolResult {
  if (!shouldRedactToolResult(toolName, result)) return result;
  return {
    success: result.success,
    data: browserPersistenceOutput(result.success),
    ...(result.success ? {} : { error: "Browser command failed; details omitted from persistence." }),
    redactInPersistence: true,
  };
}

function sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, sanitizeValue(key, value)]),
  );
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (SENSITIVE_ARGUMENT_KEYS.has(key.toLowerCase())) return BROWSER_REDACTED_VALUE;

  if (key === "files" && Array.isArray(value)) {
    return value.map((entry) => typeof entry === "string" ? fileName(entry) : BROWSER_REDACTED_VALUE);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => isRecord(entry) ? sanitizeRecord(entry) : entry);
  }

  if (isRecord(value)) return sanitizeRecord(value);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "[file]";
}
