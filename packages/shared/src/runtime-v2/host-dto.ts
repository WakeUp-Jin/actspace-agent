export type RuntimeV2JsonPrimitive = string | number | boolean | null;

export type RuntimeV2JsonValue =
  | RuntimeV2JsonPrimitive
  | readonly RuntimeV2JsonValue[]
  | { readonly [key: string]: RuntimeV2JsonValue };

export type RuntimeV2HostKind = "desktop" | "cli-run";

export type RuntimeV2HostCapability =
  | "filesystem.read"
  | "filesystem.write"
  | "network"
  | "browser"
  | "tty"
  | "approval"
  | "credential"
  | "renderer"
  | "process";

export type RuntimeV2HostCapabilityCeiling = readonly RuntimeV2HostCapability[];

export function narrowRuntimeV2CapabilityCeiling(
  current: RuntimeV2HostCapabilityCeiling,
  requested: RuntimeV2HostCapabilityCeiling,
): RuntimeV2HostCapabilityCeiling {
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

export type RuntimeV2HostDescriptor = {
  readonly hostKind: RuntimeV2HostKind;
  readonly capabilityCeiling: RuntimeV2HostCapabilityCeiling;
  readonly runtimeContract: string;
  readonly invocationId: string;
  readonly workspaceRef?: string;
};

export type RuntimeV2HostRequestContext = {
  readonly requestId: string;
  readonly host: RuntimeV2HostKind;
  readonly sessionId?: string;
  readonly agentRunId?: string;
};

export type RuntimeV2DiagnosticSeverity = "info" | "warning" | "error" | "fatal";

export type RuntimeV2DiagnosticCode =
  | "HOST_CAPABILITY_MISMATCH"
  | "FRONTEND_INCOMPATIBLE"
  | "PLUGIN_CONFLICT"
  | "PLUGIN_SKIPPED"
  | "MISSING_SERVICE"
  | "SESSION_CODEC_UNAVAILABLE"
  | "RESTART_REQUIRED"
  | "SHUTDOWN_INCOMPLETE";

export type RuntimeV2DiagnosticDetails = Readonly<
  Record<string, RuntimeV2JsonPrimitive>
>;

export type RuntimeV2HostDiagnostic = {
  readonly code: RuntimeV2DiagnosticCode;
  readonly severity: RuntimeV2DiagnosticSeverity;
  readonly message: string;
  readonly origin: string;
  readonly pluginId?: string;
  readonly entryId?: string;
  readonly details?: RuntimeV2DiagnosticDetails;
};

export function isRuntimeV2JsonValue(value: unknown): value is RuntimeV2JsonValue {
  if (value === null) return true;

  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return Number.isFinite(value as number) || typeof value !== "number";
    case "object":
      if (Array.isArray(value)) {
        return value.every(isRuntimeV2JsonValue);
      }
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
        return false;
      }
      return Object.values(value as Record<string, unknown>).every(
        isRuntimeV2JsonValue,
      );
    default:
      return false;
  }
}

export function freezeRuntimeV2Json<T>(value: T): Readonly<T> {
  if (!isRuntimeV2JsonValue(value)) {
    throw new TypeError("Runtime v2 DTO must contain only JSON-safe values.");
  }
  return freezeJsonValue(value) as Readonly<T>;
}

function freezeJsonValue<T extends RuntimeV2JsonValue>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      freezeJsonValue(child);
    }
    Object.freeze(value);
  }
  return value;
}
