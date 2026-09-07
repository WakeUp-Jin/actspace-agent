import { SessionError } from "./errors.js";
import { snapshotSessionJson } from "./event-envelope.js";

export const SESSION_FORMAT = "actspace-session" as const;
export const SESSION_FORMAT_VERSION = 1 as const;
export const SESSION_BACKEND = "raw-jsonl" as const;
export const SESSION_BACKEND_SCHEMA_VERSION = 1 as const;

export type SessionPluginProvenance = {
  readonly id: string;
  readonly version: string;
};

export type SessionLineageV1 = {
  readonly parentSessionId: string;
  readonly parentBoundarySeq: number;
  readonly origin: "fork" | "delegation";
  readonly delegationDepth: number;
  readonly parentCallId?: string;
  readonly seedDigest?: string;
};

export type SessionCreatedWithV1 = {
  readonly profileId: string;
  readonly presetId?: string;
  readonly runtimeContractVersion: string;
  readonly manifestDigest: string;
  readonly plugins: readonly SessionPluginProvenance[];
  readonly codecSetDigest: string;
};

export type SessionHeaderV1 = {
  readonly recordKind: "header";
  readonly format: typeof SESSION_FORMAT;
  readonly formatVersion: typeof SESSION_FORMAT_VERSION;
  readonly backend: typeof SESSION_BACKEND;
  readonly backendSchemaVersion: typeof SESSION_BACKEND_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly createdAt: string;
  readonly cwd?: string;
  readonly lineage: SessionLineageV1 | null;
  readonly createdWith: SessionCreatedWithV1;
};

export type CreateSessionHeaderInput = Omit<
  SessionHeaderV1,
  | "recordKind"
  | "format"
  | "formatVersion"
  | "backend"
  | "backendSchemaVersion"
>;

export function createSessionHeader(input: CreateSessionHeaderInput): SessionHeaderV1 {
  const header: SessionHeaderV1 = {
    recordKind: "header",
    format: SESSION_FORMAT,
    formatVersion: SESSION_FORMAT_VERSION,
    backend: SESSION_BACKEND,
    backendSchemaVersion: SESSION_BACKEND_SCHEMA_VERSION,
    ...input,
  };
  validateSessionHeader(header);
  return snapshotSessionJson(header);
}

export function validateSessionHeader(value: unknown, expectedSessionId?: string): asserts value is SessionHeaderV1 {
  if (!isRecord(value)) throw invalidHeader("Header must be a JSON object.");
  if (value.recordKind !== "header") throw invalidHeader("Header must be the first header record.");
  if (value.format !== SESSION_FORMAT || value.formatVersion !== SESSION_FORMAT_VERSION) {
    throw invalidHeader("Unsupported Session format.");
  }
  if (value.backend !== SESSION_BACKEND || value.backendSchemaVersion !== SESSION_BACKEND_SCHEMA_VERSION) {
    throw invalidHeader("Unsupported Session backend schema.");
  }
  requireString(value.sessionId, "sessionId");
  if (expectedSessionId !== undefined && value.sessionId !== expectedSessionId) {
    throw invalidHeader("Header sessionId does not match the Session directory.");
  }
  requireTimestamp(value.createdAt, "createdAt");
  if (value.cwd !== undefined) requireString(value.cwd, "cwd");
  if (value.lineage !== null) validateLineage(value.lineage);
  if (!isRecord(value.createdWith)) throw invalidHeader("createdWith must be an object.");
  requireString(value.createdWith.profileId, "createdWith.profileId");
  if (value.createdWith.presetId !== undefined) requireString(value.createdWith.presetId, "createdWith.presetId");
  requireString(value.createdWith.runtimeContractVersion, "createdWith.runtimeContractVersion");
  requireString(value.createdWith.manifestDigest, "createdWith.manifestDigest");
  requireString(value.createdWith.codecSetDigest, "createdWith.codecSetDigest");
  if (!Array.isArray(value.createdWith.plugins)) throw invalidHeader("createdWith.plugins must be an array.");
  const pluginIds = new Set<string>();
  for (const plugin of value.createdWith.plugins) {
    if (!isRecord(plugin)) throw invalidHeader("Plugin provenance must be an object.");
    requireString(plugin.id, "createdWith.plugins[].id");
    requireString(plugin.version, "createdWith.plugins[].version");
    if (pluginIds.has(plugin.id)) throw invalidHeader(`Duplicate plugin provenance ${plugin.id}.`);
    pluginIds.add(plugin.id);
  }
  snapshotSessionJson(value);
}

function validateLineage(value: unknown): asserts value is SessionLineageV1 {
  if (!isRecord(value)) throw invalidHeader("lineage must be null or an object.");
  requireString(value.parentSessionId, "lineage.parentSessionId");
  if (!Number.isSafeInteger(value.parentBoundarySeq) || (value.parentBoundarySeq as number) < -1) {
    throw invalidHeader("lineage.parentBoundarySeq must be an integer >= -1.");
  }
  if (value.origin !== "fork" && value.origin !== "delegation") {
    throw invalidHeader("lineage.origin must be fork or delegation.");
  }
  if (!Number.isSafeInteger(value.delegationDepth) || (value.delegationDepth as number) < 0) {
    throw invalidHeader("lineage.delegationDepth must be a non-negative integer.");
  }
  if (value.parentCallId !== undefined) requireString(value.parentCallId, "lineage.parentCallId");
  if (value.seedDigest !== undefined) requireString(value.seedDigest, "lineage.seedDigest");
}

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw invalidHeader(`${field} must be a non-empty string.`);
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  requireString(value, field);
  if (!Number.isFinite(Date.parse(value))) throw invalidHeader(`${field} must be an RFC3339 timestamp.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidHeader(message: string): SessionError {
  return new SessionError("INVALID_HEADER", message);
}
