import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { JsonSchema } from "./definition.js";
import { ToolRuntimeError } from "./errors.js";

export function materializeToolArguments(
  schema: JsonSchema,
  input: unknown,
): Readonly<Record<string, RuntimeV2JsonValue>> {
  const value = cloneJson(input, "$");
  applyDefaults(schema, value);
  validateSchema(schema, value, "$", true);
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("$", "Tool arguments must be an object.");
  return deepFreeze(value as Record<string, RuntimeV2JsonValue>);
}

function applyDefaults(schema: JsonSchema, value: RuntimeV2JsonValue): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, RuntimeV2JsonValue>;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (!isRecord(childSchema)) continue;
      if (!(key in record) && childSchema.default !== undefined) record[key] = cloneJson(childSchema.default, `$/defaults/${escapePointer(key)}`);
      if (key in record) applyDefaults(childSchema, record[key] as RuntimeV2JsonValue);
    }
  } else if (Array.isArray(value) && isRecord(schema.items)) {
    for (const item of value) applyDefaults(schema.items, item);
  }
}

function validateSchema(schema: JsonSchema, value: RuntimeV2JsonValue, path: string, root = false): void {
  if (schema.const !== undefined && !deepEqual(value, schema.const)) fail(path, "Value does not match const.");
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => deepEqual(value, candidate))) fail(path, "Value is outside enum.");
  const type = schema.type;
  if (typeof type === "string" && !matchesType(type, value)) fail(path, `Expected ${type}.`);
  if ((type === "object" || root) && value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, RuntimeV2JsonValue>;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
    for (const key of required) if (!(key in record)) fail(`${path}/${escapePointer(key)}`, "Required property is missing.");
    for (const [key, child] of Object.entries(record)) {
      const childSchema = properties[key];
      if (isRecord(childSchema)) validateSchema(childSchema, child, `${path}/${escapePointer(key)}`);
      else if (schema.additionalProperties === false) fail(`${path}/${escapePointer(key)}`, "Unknown property.");
      else if (isRecord(schema.additionalProperties)) validateSchema(schema.additionalProperties, child, `${path}/${escapePointer(key)}`);
    }
  }
  if (type === "array" && Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) fail(path, "Array has too few items.");
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) fail(path, "Array has too many items.");
    if (isRecord(schema.items)) value.forEach((item, index) => validateSchema(schema.items as JsonSchema, item, `${path}/${index}`));
  }
  if (type === "string" && typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) fail(path, "String is too short.");
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) fail(path, "String is too long.");
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) fail(path, "String does not match pattern.");
  }
  if ((type === "number" || type === "integer") && typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) fail(path, "Number is below minimum.");
    if (typeof schema.maximum === "number" && value > schema.maximum) fail(path, "Number is above maximum.");
  }
}

function cloneJson(value: unknown, path: string): RuntimeV2JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path, "Number must be finite.");
    return value;
  }
  if (Array.isArray(value)) return value.map((child, index) => cloneJson(child, `${path}/${index}`));
  if (!isRecord(value)) fail(path, "Value must be JSON-safe.");
  const result: Record<string, RuntimeV2JsonValue> = {};
  for (const [key, child] of Object.entries(value)) result[key] = cloneJson(child, `${path}/${escapePointer(key)}`);
  return result;
}

function matchesType(type: string, value: RuntimeV2JsonValue): boolean {
  switch (type) {
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "number": return typeof value === "number";
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: fail("$", `Unsupported JSON Schema type ${type}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function fail(path: string, message: string): never {
  throw new ToolRuntimeError({ code: "INVALID_ARGUMENTS", message: `Invalid tool argument at ${path}: ${message}`, retryable: false, fieldPath: path, phase: "prepare" });
}
