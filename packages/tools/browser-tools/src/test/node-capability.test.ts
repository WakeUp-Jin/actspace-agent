import { describe, expect, it } from "vitest";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ApprovalBroker } from "@actspace/tools-runtime";
import type { ToolCapabilitySet, ToolExecutionContext } from "@actspace/tools-runtime";
import type { ToolJournalPort, ToolPreparedEnvironment } from "@actspace/tools-runtime";
import { ToolRuntime } from "@actspace/tools-runtime";
import { createNodeBrowserCapability, type BrowserBridgeTransport } from "../node-capability.js";
import { registerBrowserTools } from "../plugin.js";
import { redactBrowserValue } from "../redaction.js";

class EmptyCapabilities implements ToolCapabilitySet {
  readonly ids = Object.freeze(["browser"]);
  has(capabilityId: string): boolean { return capabilityId === "browser"; }
  get<T>(): T { throw new Error("unused"); }
}

function context(): ToolExecutionContext {
  return {
    pluginId: "actspace.browser-tools",
    name: "browser_run",
    callId: "call-1",
    sessionId: "session-1",
    workspaceRoot: "/workspace",
    agentRunId: "run-1",
    turnId: "turn-1",
    stepId: "step-1",
    signal: new AbortController().signal,
    capabilities: new EmptyCapabilities(),
    reportProgress: () => undefined,
    createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact-1", mediaType, size: bytes.byteLength, sha256: "sha" }),
    defer: () => undefined,
  };
}

function fakeTransport(trace: Array<{ readonly method: string; readonly params: unknown }>): BrowserBridgeTransport {
  return {
    async request(method, params) {
      trace.push({ method, params });
      if (method.endsWith("command.preflight")) return { actionHash: "hash", approval: "short-lived-token" };
      if (method.endsWith("command.run")) return { actionHash: "hash", results: [{ category: "navigation", action: "goto", status: "completed", result: { url: "https://example.com" } }] };
      return {};
    },
    async dispose() { trace.push({ method: "dispose", params: {} }); },
  };
}

describe("v2 Browser Bridge capability", () => {
  it("binds preflight and run to exact actions, Session and Turn without exposing the token", async () => {
    const trace: Array<{ readonly method: string; readonly params: unknown }> = [];
    const browser = createNodeBrowserCapability({ ready: true, socketPath: "/unused", transportFactory: () => fakeTransport(trace) });
    const args = { actions: [{ category: "navigation", action: "goto", params: { url: "https://example.com" } }], stop_on_error: true } as unknown as Readonly<Record<string, RuntimeV2JsonValue>>;
    const result = await browser.command("browser_run", args, context());
    expect(result.status).toBe("completed");
    expect(trace).toEqual([
      { method: "agent_browser_bridge.command.preflight", params: { actions: args.actions, sessionId: "session-1", turnId: "turn-1" } },
      { method: "agent_browser_bridge.command.run", params: { actions: args.actions, stopOnError: true, approval: "short-lived-token", sessionId: "session-1", turnId: "turn-1" } },
      { method: "dispose", params: {} },
    ]);
    expect(JSON.stringify(result)).not.toContain("short-lived-token");
    expect(JSON.stringify(trace)).not.toContain("agentRunId");
  });

  it("runs Host approval and durability checkpoint before Browser preflight", async () => {
    const order: string[] = [];
    let approvalSummary: Readonly<Record<string, unknown>> | undefined;
    const browser = createNodeBrowserCapability({
      ready: true,
      socketPath: "/unused",
      transportFactory: () => ({
        async request(method) {
          order.push(method.endsWith("preflight") ? "preflight" : method.endsWith("run") ? "run" : method);
          return method.endsWith("preflight") ? { approval: "token" } : { results: [{ category: "navigation", action: "goto", status: "completed", result: { url: "https://example.com" } }] };
        },
        async dispose() { order.push("dispose"); },
      }),
    });
    const runtime = new ToolRuntime();
    registerBrowserTools(runtime, browser);
    const broker: ApprovalBroker = { async requestApproval(request) { order.push("approval"); approvalSummary = request.argumentSummary; return { requestId: request.requestId, decision: "allow", decidedAt: "now" }; } };
    const journal: ToolJournalPort = {
      async recordDispatch() { order.push("dispatch"); },
      async checkpointBeforeBody() { order.push("checkpoint"); },
      async commitResult() { order.push("commit"); },
    };
    const environment: ToolPreparedEnvironment = {
      workspaceRoot: "/workspace",
      hostCapabilities: new Set(["browser"]),
      capabilitySet: new EmptyCapabilities(),
      approvalBroker: broker,
      journal,
      createArtifact: context().createArtifact,
    };
    const [result] = await runtime.executeBatch([{
      callId: "call-1",
      name: "browser_run",
      arguments: { actions: [{ category: "navigation", action: "goto", params: { url: "https://secret.example.com" } }] },
      sessionId: "session-1",
      agentRunId: "run-1",
      turnId: "turn-1",
      stepId: "step-1",
    }], environment);
    expect(result?.status).toBe("completed");
    expect(order).toEqual(["approval", "dispatch", "checkpoint", "preflight", "run", "dispose", "commit"]);
    expect(approvalSummary).toEqual({ actions: "[REDACTED]", stop_on_error: true });
    expect(JSON.stringify(approvalSummary)).not.toContain("secret.example.com");
  });

  it("executes canonical read-only actions without approval and rejects unknown actions before the Bridge", async () => {
    let browserCalls = 0;
    let approvalCalls = 0;
    const runtime = new ToolRuntime();
    registerBrowserTools(runtime, {
      ready: true,
      async command() { browserCalls += 1; return { status: "completed", summary: "tabs listed", modelOutput: [{ type: "text", text: "tabs listed" }] }; },
    });
    const environment: ToolPreparedEnvironment = {
      workspaceRoot: "/workspace",
      hostCapabilities: new Set(["browser"]),
      capabilitySet: new EmptyCapabilities(),
      approvalBroker: { async requestApproval(request) { approvalCalls += 1; return { requestId: request.requestId, decision: "allow", decidedAt: "now" }; } },
      journal: { async recordDispatch() {}, async checkpointBeforeBody() {}, async commitResult() {} },
      createArtifact: context().createArtifact,
    };
    const base = { callId: "call-read", sessionId: "session-1", agentRunId: "run-1", turnId: "turn-1", stepId: "step-1" } as const;
    const [readOnly] = await runtime.executeBatch([{ ...base, name: "browser_tabs", arguments: { action: "list" } }], environment);
    expect(readOnly?.status).toBe("completed");
    expect(approvalCalls).toBe(0);
    expect(browserCalls).toBe(1);

    const [unknown] = await runtime.executeBatch([{ ...base, callId: "call-unknown", name: "browser_tabs", arguments: { action: "not-a-command" } }], environment);
    expect(unknown).toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS" } });
    expect(browserCalls).toBe(1);
  });

  it("preserves the eleven existing Browser tool names and forwards flattened category args", async () => {
    const trace: Array<{ readonly method: string; readonly params: unknown }> = [];
    const browser = createNodeBrowserCapability({
      ready: true,
      socketPath: "/unused",
      transportFactory: () => ({
        async request(method, params) { trace.push({ method, params }); return { category: "tabs", action: "list", status: "completed", result: { tabs: [] } }; },
        async dispose() { trace.push({ method: "dispose", params: {} }); },
      }),
    });
    const result = await browser.command("browser_tabs", { action: "list", active: true }, context());
    expect(result.status).toBe("completed");
    expect(trace[0]).toEqual({ method: "agent_browser_bridge.command.execute", params: { category: "tabs", action: "list", params: { active: true } } });
  });

  it("returns a failed tool result for failed Bridge executions and redacts structured secrets", async () => {
    const browser = createNodeBrowserCapability({
      ready: true,
      socketPath: "/unused",
      transportFactory: () => ({
        async request() { return { category: "navigation", action: "goto", status: "failed", error: { code: "NAVIGATION_FAILED", message: 'request failed with {"authorization":"Bearer secret-token"}' } }; },
        async dispose() {},
      }),
    });
    const result = await browser.command("browser_navigation", { action: "goto", tab_id: 1, url: "https://example.com" }, context());
    expect(result).toMatchObject({ status: "failed", failure: { code: "NAVIGATION_FAILED" } });
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(redactBrowserValue("https://example.com/?access_token=abc&key=def Bearer ghi")).not.toMatch(/abc|def|ghi/);
  });
});
