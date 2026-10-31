/** Wire-only contracts: no Node, Electron, transport objects or credentials in projections. */
export const HOST_PROTOCOL = "actspace-host/1" as const;
export const HOST_LIMITS = Object.freeze({ frameBytes: 1024 * 1024, chunkBytes: 256 * 1024, fileBytes: 20 * 1024 * 1024, messageBytes: 50 * 1024 * 1024, messageFiles: 10, concurrentRequests: 32 });
export type SessionRef = { readonly hostId: string; readonly sessionId: string };
export function sessionRefKey(ref: SessionRef): string { return JSON.stringify([ref.hostId, ref.sessionId]); }
export type HostConnectionState = "connecting" | "connected" | "offline" | "revoked" | "incompatible";
export type HostErrorKind = "UNAUTHENTICATED" | "REVOKED" | "INCOMPATIBLE_PROTOCOL" | "CONFLICT" | "MAINTENANCE" | "NOT_FOUND" | "LIMIT_EXCEEDED" | "RECOVERY_BLOCKED" | "FORBIDDEN";
export class HostError extends Error {
  constructor(readonly kind: HostErrorKind, message: string, readonly retryable = false) { super(message); this.name = "HostError"; }
}
export const HOST_METHODS = ["host.hello", "auth.pair", "auth.resume", "host.describe", "host.observe", "host.unobserve", "sessions.list", "sessions.browse", "sessions.create", "sessions.fork", "sessions.update", "sessions.revokeGrant", "sessions.page", "sessions.tool", "sessions.observe", "sessions.unobserve", "sessions.output", "tasks.submit", "tasks.lookup", "tasks.command", "approvals.list", "approvals.decide", "files.reference", "uploads.begin", "uploads.status", "uploads.write", "uploads.finish", "uploads.abort", "artifacts.describe", "artifacts.read", "payloads.read"] as const;
export type HostMethod = typeof HOST_METHODS[number];
export type RpcId = string | number | null;
export interface HostRequest { readonly jsonrpc: "2.0"; readonly id: RpcId; readonly method: HostMethod; readonly params: Readonly<Record<string, unknown>> }
export interface HostHello {
  readonly protocol: typeof HOST_PROTOCOL; readonly hostId: string; readonly epoch: string;
  readonly state: "ready" | "draining" | "blocked";
  readonly limits: typeof HOST_LIMITS;
}
export interface HostEvent { readonly subscriptionId: string; readonly epoch: string; readonly cursor: number; readonly value: unknown }
export function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
export function parseHostRequest(value: unknown): HostRequest {
  if (!isRecord(value) || value.jsonrpc !== "2.0" || !(value.id === null || typeof value.id === "string" || (typeof value.id === "number" && Number.isSafeInteger(value.id))) || typeof value.method !== "string") throw new TypeError("Invalid JSON-RPC request");
  if (!(HOST_METHODS as readonly string[]).includes(value.method)) throw new TypeError("Unknown Host method");
  if (value.params !== undefined && !isRecord(value.params)) throw new TypeError("Host methods require named parameters");
  return { jsonrpc: "2.0", id: value.id, method: value.method as HostMethod, params: value.params ?? {} };
}
export function stringParam(params: Readonly<Record<string, unknown>>, name: string, max = 4096): string {
  const value = params[name];
  if (typeof value !== "string" || !value.length || value.length > max || value.includes("\0")) throw new TypeError(`Invalid ${name}`);
  return value;
}
export function integerParam(params: Readonly<Record<string, unknown>>, name: string, max: number): number {
  const value = params[name];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) throw new TypeError(`Invalid ${name}`);
  return value;
}
export * from "./connections";
export * from "./events";
