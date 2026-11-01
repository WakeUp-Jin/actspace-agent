import type { JsonValue } from "@actspace/cordis-adapter";
export type DiagnosticProvenance = { readonly source: string; readonly pluginId?: string; readonly entryId?: string };
export type BootDiagnostic = { readonly severity: "info" | "warning" | "error" | "fatal"; readonly code: string; readonly message: string; readonly provenance: DiagnosticProvenance; readonly details: JsonValue };
export class BootDiagnostics {
  readonly #items: BootDiagnostic[] = [];
  record(input: Omit<BootDiagnostic, "details" | "provenance"> & { readonly details?: JsonValue; readonly provenance?: DiagnosticProvenance }): BootDiagnostic { const item = Object.freeze({ ...input, provenance: input.provenance ?? { source: "boot" }, details: redact(input.details ?? {}) }); this.#items.push(item); return item; }
  snapshot(): readonly BootDiagnostic[] { return Object.freeze([...this.#items]); }
}
function redact(value: JsonValue): JsonValue { if (value === null || typeof value !== "object") return value; if (Array.isArray(value)) return value.map(redact); return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, /authorization|api[_-]?key|password|secret|token|cookie/i.test(key) ? "[REDACTED]" : redact(child)])); }
