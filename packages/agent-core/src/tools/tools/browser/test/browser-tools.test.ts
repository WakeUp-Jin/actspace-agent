// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import { createToolManager } from "../../../index";
import type { ApprovalGate } from "../../../scheduler";

const PROTOCOL_VERSION = "0.2.0";

describe("browser tool runtime", () => {
  const tempDirs: string[] = [];
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => closeServer(server)));
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("registers browser tools only when a bridge socket is configured", () => {
    const withoutBridge = createToolManager({ workspaceRoot: "/tmp" });
    const withBridge = createToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: "/tmp/browser-bridge-test.sock",
      sessionId: "session-test",
      turnId: "turn-test",
    });

    expect(withoutBridge.has("browser_tabs")).toBe(false);
    expect(withBridge.has("browser_tabs")).toBe(true);
    expect(withBridge.has("browser_locator")).toBe(true);
    expect(withBridge.has("browser_help")).toBe(true);
    expect(withBridge.has("browser_run")).toBe(true);
    expect(withBridge.has("browser_click")).toBe(false);
    expect(withBridge.getAll().filter((tool) => tool.category === "browser")).toHaveLength(11);
  });

  it("uses one persistent connection for session lifecycle and browser requests", async () => {
    const dir = await mkdtemp(join("/private/tmp", "actspace-browser-tools-"));
    tempDirs.push(dir);
    const socketPath = join(dir, "bridge.sock");
    const methods: string[] = [];
    let connections = 0;
    const server = createServer((socket) => {
      connections += 1;
      handleFrames(socket, (request) => {
        methods.push(request.method);
        if (request.method === "agent_browser_bridge.command.execute") {
          return {
            commandId: "list_tabs",
            category: "tabs",
            action: "list",
            result: [{ id: 42, title: "Example", url: "https://example.com", active: true }],
          };
        }
        return { status: "ok" };
      });
    });
    servers.push(server);
    await listen(server, socketPath);

    const manager = createToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
    });

    const result = await manager.execute("browser_tabs", { action: "list" });
    expect(result).toMatchObject({ success: true });
    expect(String(result.data)).toContain("[42] * Example");
    await manager.dispose();

    expect(connections).toBe(1);
    expect(methods).toEqual([
      "agent_browser_bridge.session.start",
      "agent_browser_bridge.command.execute",
      "agent_browser_bridge.session.end",
    ]);
  });

  it("preserves screenshot output on the native image content path", async () => {
    const dir = await mkdtemp(join("/private/tmp", "actspace-browser-image-"));
    tempDirs.push(dir);
    const socketPath = join(dir, "bridge.sock");
    const server = createServer((socket) => {
      handleFrames(socket, (request) => {
        if (request.method === "agent_browser_bridge.command.execute") {
          return {
            commandId: "cua_get_visible_screenshot",
            category: "cua",
            action: "screenshot",
            status: "completed",
            durationMs: 3,
            result: { mimeType: "image/jpeg", data: "AQID", width: 100, height: 50 },
          };
        }
        return { status: "ok" };
      });
    });
    servers.push(server);
    await listen(server, socketPath);
    const manager = createToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
    });

    const result = await manager.execute("browser_cua", { action: "screenshot", tab_id: 42 });

    expect(result.success).toBe(true);
    expect(result.content).toEqual([{ type: "image", data: "AQID", mimeType: "image/jpeg" }]);
    await manager.dispose();
  });

  it("keeps clipboard output available to the current model path but marks it ephemeral", async () => {
    const dir = await mkdtemp(join("/private/tmp", "actspace-browser-clipboard-"));
    tempDirs.push(dir);
    const socketPath = join(dir, "bridge.sock");
    const server = createServer((socket) => {
      handleFrames(socket, (request) => {
        if (request.method === "agent_browser_bridge.command.execute") {
          return {
            commandId: "clipboard_read_text",
            category: "io",
            action: "clipboard_read_text",
            result: { text: "private clipboard payload" },
          };
        }
        return { status: "ok" };
      });
    });
    servers.push(server);
    await listen(server, socketPath);
    const manager = createToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
    });

    const result = await manager.execute("browser_io", { action: "clipboard_read_text", tab_id: 42 });

    expect(result.success).toBe(true);
    expect(result.data).toContain("private clipboard payload");
    expect(result.redactInPersistence).toBe(true);
    await manager.dispose();
  });

  it("requires approval before mutating the real browser", async () => {
    const manager = createToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: "/tmp/browser-bridge-test.sock",
      sessionId: "session-test",
      turnId: "turn-test",
    });

    const result = await manager.execute("browser_navigation", {
      action: "goto",
      tab_id: 42,
      url: "https://example.com",
    });

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ status: "awaiting_approval" });
    await manager.dispose();
  });

  it("keeps the category tool visible while denying a disabled high-risk capability", async () => {
    const manager = createToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: "/tmp/browser-bridge-test.sock",
      sessionId: "session-test",
      turnId: "turn-test",
      disabledTools: ["browser_capability_clipboard_write"],
    });

    expect(manager.has("browser_io")).toBe(true);
    const result = await manager.execute("browser_io", {
      action: "clipboard_write_text",
      tab_id: 42,
      text: "must-not-write",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("clipboard_write capability 已在设置中禁用");
    await manager.dispose();
  });

  it("preflights browser_run and forwards the bridge-issued approval token after approval", async () => {
    const dir = await mkdtemp(join("/private/tmp", "actspace-browser-run-"));
    tempDirs.push(dir);
    const socketPath = join(dir, "bridge.sock");
    const methods: string[] = [];
    let runParams: Record<string, unknown> | undefined;
    const server = createServer((socket) => {
      handleFrames(socket, (request) => {
        methods.push(request.method);
        if (request.method === "agent_browser_bridge.command.preflight") {
          return {
            actionHash: "hash-1",
            highestRisk: "high",
            readOnly: false,
            approval: "signed-token",
            expiresAt: Date.now() + 60_000,
            actions: [{
              index: 0,
              commandId: "clipboard_write_text",
              category: "io",
              action: "clipboard_write_text",
              riskLevel: "high",
              readOnly: false,
              effect: "clipboard_write",
              originPolicy: "session",
              status: "implemented",
            }],
          };
        }
        if (request.method === "agent_browser_bridge.command.run") {
          runParams = request.params as Record<string, unknown>;
          return { actionHash: "hash-1", results: [] };
        }
        return { status: "ok" };
      });
    });
    servers.push(server);
    await listen(server, socketPath);

    const approvalGate: ApprovalGate = {
      waitForDecision: async (request) => ({
        requestId: request.id,
        decision: "approve_once",
        decidedAt: Date.now(),
      }),
    };
    const manager = createToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
      approvalGate,
    });
    const actions = [{
      category: "io",
      action: "clipboard_write_text",
      params: { tab_id: 42, text: "secret" },
    }];

    const result = await manager.execute("browser_run", { actions, stop_on_error: false });

    expect(result.success).toBe(true);
    expect(methods).toContain("agent_browser_bridge.command.preflight");
    expect(methods).toContain("agent_browser_bridge.command.run");
    expect(runParams).toMatchObject({
      actions,
      stopOnError: true,
      approval: "signed-token",
      sessionId: "session-test",
      turnId: "turn-test",
    });
    await manager.dispose();
  });

  it("does not send any batch action when the user denies browser_run", async () => {
    const dir = await mkdtemp(join("/private/tmp", "actspace-browser-run-deny-"));
    tempDirs.push(dir);
    const socketPath = join(dir, "bridge.sock");
    const methods: string[] = [];
    const server = createServer((socket) => {
      handleFrames(socket, (request) => {
        methods.push(request.method);
        if (request.method === "agent_browser_bridge.command.preflight") {
          return {
            actionHash: "hash-denied",
            highestRisk: "high",
            readOnly: false,
            approval: "signed-denied-token",
            expiresAt: Date.now() + 60_000,
            actions: [{
              index: 0,
              commandId: "clipboard_write_text",
              category: "io",
              action: "clipboard_write_text",
              riskLevel: "high",
              readOnly: false,
              effect: "clipboard_write",
              originPolicy: "target_origin",
              target: "tab 42",
              origin: "https://example.test",
              status: "implemented",
            }],
          };
        }
        return { status: "ok" };
      });
    });
    servers.push(server);
    await listen(server, socketPath);

    const approvalGate: ApprovalGate = {
      waitForDecision: async (request) => ({
        requestId: request.id,
        decision: "deny",
        decidedAt: Date.now(),
      }),
    };
    const manager = createToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
      approvalGate,
    });

    const result = await manager.execute("browser_run", {
      actions: [{
        category: "io",
        action: "clipboard_write_text",
        params: { tab_id: 42, text: "must-not-run" },
      }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("User denied tool: browser_run");
    expect(methods).toContain("agent_browser_bridge.command.preflight");
    expect(methods).not.toContain("agent_browser_bridge.command.run");
    await manager.dispose();
  });
});

type RequestEnvelope = {
  protocolVersion: string;
  id: string;
  method: string;
  params?: unknown;
};

function handleFrames(socket: Socket, resultFor: (request: RequestEnvelope) => unknown): void {
  let buffer = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) return;
      const request = JSON.parse(buffer.subarray(4, 4 + length).toString("utf8")) as RequestEnvelope;
      buffer = buffer.subarray(4 + length);
      const payload = Buffer.from(JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        id: request.id,
        ok: true,
        result: resultFor(request),
      }));
      const header = Buffer.alloc(4);
      header.writeUInt32LE(payload.length);
      socket.write(Buffer.concat([header, payload]));
    }
  });
}

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
}

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(() => resolve()));
}
