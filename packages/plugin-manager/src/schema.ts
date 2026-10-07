/** Supported by the existing Tool Runtime validator; reject silently ignored keywords. */
export function validateInputSchema(value: unknown, depth = 0): void {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 16) throw new Error("Invalid inputSchema object or nesting depth");
  const schema = value as Record<string, unknown>;
  const allowed = new Set(["type", "description", "title", "properties", "required", "additionalProperties", "items", "enum", "const", "default", "minItems", "maxItems", "minLength", "maxLength", "pattern", "minimum", "maximum"]);
  for (const key of Object.keys(schema)) if (!allowed.has(key)) throw new Error(`Unsupported inputSchema keyword: ${key}`);
  if ((schema.type !== undefined && (typeof schema.type !== "string" || !["object", "array", "string", "number", "integer", "boolean", "null"].includes(schema.type))) || (depth === 0 && schema.type !== "object")) throw new Error("inputSchema requires a supported type (root: object)");
  if (schema.properties !== undefined) {
    if (schema.type !== "object" || !schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) throw new Error("Invalid schema properties");
    for (const child of Object.values(schema.properties)) validateInputSchema(child, depth + 1);
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== "string" || !Object.hasOwn(schema.properties ?? {}, key)))) throw new Error("required must reference defined properties");
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") validateInputSchema(schema.additionalProperties, depth + 1);
  if (schema.items !== undefined) validateInputSchema(schema.items, depth + 1);
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length)) throw new Error("enum must be a nonempty array");
  for (const key of ["minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum"]) {
    if (schema[key] !== undefined && (typeof schema[key] !== "number" || !Number.isFinite(schema[key]) || (!["minimum", "maximum"].includes(key) && (!Number.isInteger(schema[key]) || (schema[key] as number) < 0)))) throw new Error(`Invalid inputSchema ${key}`);
  }
  if (schema.pattern !== undefined) { if (typeof schema.pattern !== "string") throw new Error("Invalid schema pattern"); new RegExp(schema.pattern); }
}
