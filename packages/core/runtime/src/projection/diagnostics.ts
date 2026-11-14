import { randomUUID } from "node:crypto";
import type {
  RuntimeDiagnostic,
  RuntimeDiagnosticSeverity,
  RuntimeDiagnosticSource,
  RuntimeDiagnosticsSnapshot,
  RuntimeJsonValue,
} from "@actspace/shared/runtime-v2";
import { redactProjectionText, toSafeJson } from "./redaction.js";

export type DiagnosticInput = {
  readonly severity: RuntimeDiagnosticSeverity;
  readonly source: RuntimeDiagnosticSource;
  readonly code: string;
  readonly message: string;
  readonly pluginId?: string | null;
  readonly name?: string | null;
  readonly callId?: string | null;
  readonly details?: Record<string, unknown>;
  readonly occurredAt?: string;
};

export class DiagnosticsCollector {
  readonly runtimeInstanceId: string;
  readonly #maxEntries: number;
  readonly #diagnostics: RuntimeDiagnostic[] = [];
  readonly #seen = new Set<string>();

  constructor(options: { readonly runtimeInstanceId?: string; readonly maxEntries?: number } = {}) {
    this.runtimeInstanceId = options.runtimeInstanceId ?? randomUUID();
    this.#maxEntries = Math.max(1, options.maxEntries ?? 256);
  }

  record(input: DiagnosticInput): RuntimeDiagnostic {
    const pluginId = input.pluginId ?? null;
    const name = input.name ?? null;
    const callId = input.callId ?? null;
    const dedupeKey = [input.source, input.code, pluginId, name, callId, input.message].join("\u0000");
    const existing = this.#diagnostics.find((item) => item.diagnosticId === this.#seenId(dedupeKey));
    if (existing !== undefined) return existing;
    const diagnostic: RuntimeDiagnostic = Object.freeze({
      kind: "runtime-diagnostic",
      schemaVersion: 1,
      runtimeInstanceId: this.runtimeInstanceId,
      diagnosticId: this.#seenId(dedupeKey),
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      severity: input.severity,
      code: input.code,
      source: input.source,
      message: redactProjectionText(input.message),
      pluginId: pluginId === null ? null : redactProjectionText(pluginId, 160),
      name: name === null ? null : redactProjectionText(name, 240),
      callId: callId === null ? null : redactProjectionText(callId, 160),
      details: toSafeJson(input.details ?? {}) as Readonly<Record<string, RuntimeJsonValue>>,
    });
    this.#seen.add(dedupeKey);
    this.#diagnostics.push(diagnostic);
    while (this.#diagnostics.length > this.#maxEntries) this.#diagnostics.shift();
    return diagnostic;
  }

  recordError(input: Omit<DiagnosticInput, "message"> & { readonly error: unknown }): RuntimeDiagnostic {
    const message = input.error instanceof Error ? input.error.message : String(input.error);
    return this.record({ ...input, message });
  }

  snapshot(): RuntimeDiagnosticsSnapshot {
    return Object.freeze({
      kind: "runtime-diagnostics",
      schemaVersion: 1,
      runtimeInstanceId: this.runtimeInstanceId,
      diagnostics: Object.freeze([...this.#diagnostics]),
    });
  }

  #seenId(key: string): string {
    return `diag-${Buffer.from(key).toString("base64url").slice(0, 32)}`;
  }
}
