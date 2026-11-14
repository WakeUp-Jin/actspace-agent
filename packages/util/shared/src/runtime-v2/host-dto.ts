export type RuntimeJsonPrimitive = string | number | boolean | null;

export type RuntimeJsonValue =
  | RuntimeJsonPrimitive
  | readonly RuntimeJsonValue[]
  | { readonly [key: string]: RuntimeJsonValue };

export type RuntimeHostKind = "desktop" | "cli-run" | "host";

export type RuntimeHostCapability =
  | "filesystem.read"
  | "filesystem.write"
  | "network"
  | "browser"
  | "tty"
  | "approval"
  | "credential"
  | "renderer"
  | "process";

export type RuntimeHostCapabilityCeiling = readonly RuntimeHostCapability[];

export function narrowRuntimeCapabilityCeiling(
  current: RuntimeHostCapabilityCeiling,
  requested: RuntimeHostCapabilityCeiling,
): RuntimeHostCapabilityCeiling {
  const allowed = new Set(current);
  for (const capability of requested) {
    if (!allowed.has(capability)) {
      throw new TypeError(
        `Runtime v2 capability ceiling cannot add ${capability}.`,
      );
    }
  }
  return Object.freeze([...new Set(requested)]);
}

export type RuntimeHostDescriptor = {
  readonly hostKind: RuntimeHostKind;
  readonly capabilityCeiling: RuntimeHostCapabilityCeiling;
  readonly runtimeContract: string;
  readonly invocationId: string;
  readonly workspaceRef?: string;
};

export type RuntimeHostRequestContext = {
  readonly requestId: string;
  readonly host: RuntimeHostKind;
  readonly sessionId?: string;
  readonly agentRunId?: string;
};

export type RuntimeDiagnosticSeverity = "info" | "warning" | "error" | "fatal";

export type RuntimeDiagnosticCode =
  | "HOST_CAPABILITY_MISMATCH"
  | "FRONTEND_INCOMPATIBLE"
  | "PLUGIN_CONFLICT"
  | "PLUGIN_SKIPPED"
  | "MISSING_SERVICE"
  | "SESSION_CODEC_UNAVAILABLE"
  | "RESTART_REQUIRED"
  | "SHUTDOWN_INCOMPLETE";

export type RuntimeDiagnosticDetails = Readonly<
  Record<string, RuntimeJsonPrimitive>
>;

export type RuntimeHostDiagnostic = {
  readonly code: RuntimeDiagnosticCode;
  readonly severity: RuntimeDiagnosticSeverity;
  readonly message: string;
  readonly origin: string;
  readonly pluginId?: string;
  readonly entryId?: string;
  readonly details?: RuntimeDiagnosticDetails;
};

export function isRuntimeJsonValue(value: unknown): value is RuntimeJsonValue {
  if (value === null) return true;

  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return Number.isFinite(value as number) || typeof value !== "number";
    case "object":
      if (Array.isArray(value)) {
        return value.every(isRuntimeJsonValue);
      }
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
        return false;
      }
      return Object.values(value as Record<string, unknown>).every(
        isRuntimeJsonValue,
      );
    default:
      return false;
  }
}

export function freezeRuntimeJson<T>(value: T): Readonly<T> {
  if (!isRuntimeJsonValue(value)) {
    throw new TypeError("Runtime v2 DTO must contain only JSON-safe values.");
  }
  return freezeJsonValue(value) as Readonly<T>;
}

function freezeJsonValue<T extends RuntimeJsonValue>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      freezeJsonValue(child);
    }
    Object.freeze(value);
  }
  return value;
}
