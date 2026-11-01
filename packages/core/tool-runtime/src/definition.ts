import { createHash } from "node:crypto";

export type JsonSchema = Readonly<Record<string, unknown>>;

export type ToolEffect = {
  readonly capabilityId: string;
  readonly mode: "read" | "write" | "execute" | "use";
  readonly resourceScope: string | null;
};

export type ToolConcurrency = "exclusive" | "read-only" | "declared-safe";

export type ToolDefinition = {
  readonly abiVersion: 2;
  readonly pluginId: string;
  readonly name: string;
  readonly definitionVersion: number;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly effects: readonly ToolEffect[];
  readonly concurrency: ToolConcurrency;
  readonly sensitiveArgumentPaths: readonly string[];
  readonly resultSchemaVersion: number;
};

export type NormalizedToolDefinition = ToolDefinition & {
  readonly definitionDigest: string;
};

export const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidToolName(name: string): boolean {
  return TOOL_NAME_PATTERN.test(name);
}

export function normalizeToolDefinition(definition: ToolDefinition): NormalizedToolDefinition {
  if (definition.abiVersion !== 2) throw new TypeError("Tool abiVersion must be 2.");
  if (!definition.pluginId) throw new TypeError("Tool pluginId is required.");
  if (!isValidToolName(definition.name)) throw new TypeError("Tool name must match ^[a-zA-Z0-9_-]+$.");
  if (!Number.isSafeInteger(definition.definitionVersion) || definition.definitionVersion < 1) {
    throw new TypeError("definitionVersion must be a positive integer.");
  }
  if (!Number.isSafeInteger(definition.resultSchemaVersion) || definition.resultSchemaVersion < 1) {
    throw new TypeError("resultSchemaVersion must be a positive integer.");
  }
  if (!definition.description) throw new TypeError("Tool description is required.");
  const normalized = deepFreeze({ ...definition, effects: [...definition.effects], sensitiveArgumentPaths: [...definition.sensitiveArgumentPaths] });
  const definitionDigest = createHash("sha256").update(canonicalJson(normalized)).digest("hex");
  return deepFreeze({ ...normalized, definitionDigest });
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
