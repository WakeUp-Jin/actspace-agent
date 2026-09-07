export function assertJsonSafe(value: unknown): void {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") throw new TypeError("Expected JSON-safe value");
  JSON.stringify(value);
}

export * from "./service-fixtures.js";
