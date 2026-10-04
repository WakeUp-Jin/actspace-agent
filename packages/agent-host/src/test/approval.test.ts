import { expect, it, vi } from "vitest";
import { HostApprovalBroker } from "../approval.js";
import type { ApprovalRequest } from "@actspace/shared/runtime-v2";
const request = (): ApprovalRequest => ({ schemaVersion: 1, requestId: "approval", sessionId: "session", agentRunId: "run", agentId: "main", callId: "call", pluginId: "tool", toolName: "write", definitionDigest: "d", normalizedArgsDigest: "a", reasons: [], resources: [], grantSuggestions: [], supportedLifetimes: ["once"], requestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1000).toISOString() });
it("accepts only the first valid device decision and abort settles pending approval", async () => {
  const broker = new HostApprovalBroker(); const controller = new AbortController();
  const pending = broker.requestApproval(request(), controller.signal);
  expect(() => broker.decide("other", "approval", "once")).toThrow("unavailable");
  broker.decide("session", "approval", "once");
  expect(() => broker.decide("session", "approval", "deny")).toThrow("settled");
  expect(await pending).toMatchObject({ kind: "once" });
  const next = broker.requestApproval(request(), controller.signal); controller.abort();
  expect(await next).toMatchObject({ kind: "deny", code: "aborted" }); expect(broker.list()).toEqual([]);
});
it("expires independently of device connections", async () => {
  vi.useFakeTimers();
  try { const broker = new HostApprovalBroker(); const pending = broker.requestApproval(request(), new AbortController().signal); await vi.advanceTimersByTimeAsync(1001); expect(await pending).toMatchObject({ kind: "deny", code: "timeout" }); }
  finally { vi.useRealTimers(); }
});
