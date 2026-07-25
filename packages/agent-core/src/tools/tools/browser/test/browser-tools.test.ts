// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import { createToolManager } from "../../../index";
import type { ApprovalGate } from "../../../scheduler";

const PROTOCOL_VERSION = "0.2.0";
const allowBrowser: ApprovalGate = {
  waitForDecision: async (request) => ({
    requestId: request.id,
    decision: "approve_once",
    decidedAt: Date.now(),
  }),
};

function createExpandedBrowserToolManager(config: Parameters<typeof createToolManager>[0]) {
  const manager = createToolManager(config);
  manager.activateProgressiveDisclosure("browser");
  return manager;
}

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
      approvalGate: allowBrowser,
    });

    expect(withoutBridge.has("browser_tabs")).toBe(false);
    expect(withBridge.has("browser_tabs")).toBe(true);
    expect(withBridge.has("browser_locator")).toBe(true);
    expect(withBridge.has("browser_help")).toBe(true);
    expect(withBridge.has("browser_run")).toBe(true);
    expect(withBridge.has("browser_click")).toBe(false);
    expect(withBridge.getAll().filter((tool) => tool.category === "browser")).toHaveLength(11);
    expect(withBridge.getToolDefinitions().filter((tool) => tool.name.startsWith("browser_"))).toEqual([
      expect.objectContaining({ name: "browser_help" }),
    ]);
    const locator = withBridge.get("browser_locator");
    expect(locator?.description).toContain("accessible name");
    expect(locator?.parameters).toMatchObject({
      properties: {
        selector: { type: "string" },
        target: {
          type: "object",
          required: ["kind"],
          properties: {
            kind: { enum: ["css", "role", "text", "label", "placeholder", "test_id"] },
            frame_path: { type: "array" },
          },
        },
      },
    });

    const disabled = createToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: "/tmp/browser-bridge-test.sock",
      disabledTools: ["browser"],
    });
    expect(disabled.has("browser_help")).toBe(false);
    expect(disabled.getToolDefinitions().some((tool) => tool.name.startsWith("browser_"))).toBe(false);
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

    const manager = createExpandedBrowserToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
      approvalGate: allowBrowser,
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
    const manager = createExpandedBrowserToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
      approvalGate: allowBrowser,
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
    const manager = createExpandedBrowserToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
      approvalGate: allowBrowser,
    });

    const result = await manager.execute("browser_io", { action: "clipboard_read_text", tab_id: 42 });

    expect(result.success).toBe(true);
    expect(result.data).toContain("private clipboard payload");
    expect(result.redactInPersistence).toBe(true);
    await manager.dispose();
  });

  it("requires session approval before any real browser action", async () => {
    const manager = createExpandedBrowserToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: "/tmp/browser-bridge-test.sock",
      sessionId: "session-test",
      turnId: "turn-test",
    });

    const result = await manager.execute("browser_tabs", { action: "list" });

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ status: "awaiting_approval" });
    await manager.dispose();
  });

  it("keeps the category tool visible while denying a disabled high-risk capability", async () => {
    const manager = createExpandedBrowserToolManager({
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
    const manager = createExpandedBrowserToolManager({
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
    const manager = createExpandedBrowserToolManager({
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
    expect(result.error).toContain("用户拒绝了本轮浏览器授权");
    expect(result.error).toContain("当前 Turn 不得再次调用任何 browser_* 工具");
    expect(methods).toContain("agent_browser_bridge.command.preflight");
    expect(methods).not.toContain("agent_browser_bridge.command.run");
    await manager.dispose();
  });

  it("preserves a large DOM snapshot with compact node lines instead of flash summarizing it", async () => {
    const dir = await mkdtemp(join("/private/tmp", "actspace-browser-dom-fidelity-"));
    tempDirs.push(dir);
    const socketPath = join(dir, "bridge.sock");
    const nodes = Array.from({ length: 400 }, (_, index) => ({
      nodeId: `4:${index + 1}`,
      tagName: "a",
      text: index === 319 ? "动画" : `频道-${index + 1}-${"x".repeat(60)}`,
      href: index === 319 ? "//www.bilibili.com/c/douga/" : `/channel/${index + 1}`,
      visible: true,
      enabled: true,
      boundingBox: { x: index, y: 203, width: 90, height: 32 },
    }));
    const server = createServer((socket) => {
      handleFrames(socket, (request) => request.method === "agent_browser_bridge.command.execute"
        ? {
            commandId: "dom_cua_get_visible_dom",
            category: "dom",
            action: "snapshot",
            result: { generation: 4, total: 400, returned: 400, truncated: false, nodes },
          }
        : { status: "ok" });
    });
    servers.push(server);
    await listen(server, socketPath);
    const manager = createExpandedBrowserToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
      approvalGate: allowBrowser,
    });

    const result = await manager.execute("browser_dom", { action: "snapshot", tab_id: 42 });
    const output = String(result.data);

    expect(output.length).toBeGreaterThan(20_000);
    expect(output.length).toBeLessThanOrEqual(50_000);
    expect(output).toContain('[4:320] <a> text="动画"');
    expect(output).toContain('href="//www.bilibili.com/c/douga/"');
    expect(output).not.toContain("[已压缩摘要");
    expect(output).not.toContain("...[truncated]");
    await manager.dispose();
  });

  it("truncates DOM snapshots only at node boundaries with an explicit marker", async () => {
    const dir = await mkdtemp(join("/private/tmp", "actspace-browser-dom-cap-"));
    tempDirs.push(dir);
    const socketPath = join(dir, "bridge.sock");
    const nodes = Array.from({ length: 500 }, (_, index) => ({
      nodeId: `4:${index + 1}`,
      tagName: "button",
      text: `button-${index + 1}-${"y".repeat(180)}`,
      visible: true,
      boundingBox: { x: 0, y: index, width: 100, height: 20 },
    }));
    const server = createServer((socket) => {
      handleFrames(socket, (request) => request.method === "agent_browser_bridge.command.execute"
        ? {
            commandId: "dom_cua_get_visible_dom",
            category: "dom",
            action: "snapshot",
            result: { generation: 4, total: 500, returned: 500, truncated: false, nodes },
          }
        : { status: "ok" });
    });
    servers.push(server);
    await listen(server, socketPath);
    const manager = createExpandedBrowserToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
      approvalGate: allowBrowser,
    });

    const result = await manager.execute("browser_dom", { action: "snapshot", tab_id: 42 });
    const output = String(result.data);

    expect(output.length).toBeLessThanOrEqual(50_000);
    expect(output).toContain("[DOM_SNAPSHOT_TRUNCATED]");
    expect(output.split("\n").at(-1)).toMatch(/^\[DOM_SNAPSHOT_TRUNCATED\]/);
    expect(output).not.toContain("[已压缩摘要");
    await manager.dispose();
  });

  it("keeps exact browser_help action schemas up to 20K without generic summarization", async () => {
    const dir = await mkdtemp(join("/private/tmp", "actspace-browser-help-fidelity-"));
    tempDirs.push(dir);
    const socketPath = join(dir, "bridge.sock");
    const description = `schema-${"z".repeat(9_000)}`;
    const server = createServer((socket) => {
      handleFrames(socket, (request) => request.method === "agent_browser_bridge.command.describe"
        ? { category: "locator", action: "read_all", description }
        : { status: "ok" });
    });
    servers.push(server);
    await listen(server, socketPath);
    const manager = createToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
    });

    expect(manager.getToolDefinitions().map((tool) => tool.name)).toContain("browser_help");
    expect(manager.getToolDefinitions().map((tool) => tool.name)).not.toContain("browser_locator");

    const result = await manager.execute("browser_help", { category: "locator", action: "read_all" });
    const output = String(result.data);

    expect(output.length).toBeGreaterThan(9_000);
    expect(output).toContain(description);
    expect(output).not.toContain("[已压缩摘要");
    expect(manager.getToolDefinitions().map((tool) => tool.name)).not.toContain("browser_locator");
    manager.commitProgressiveDisclosure();
    expect(manager.getToolDefinitions().map((tool) => tool.name)).toContain("browser_locator");
    await manager.dispose();
  });

  it("forwards locator pagination and returns page metadata without flash summarization", async () => {
    const dir = await mkdtemp(join("/private/tmp", "actspace-browser-pagination-"));
    tempDirs.push(dir);
    const socketPath = join(dir, "bridge.sock");
    let executeParams: Record<string, unknown> | undefined;
    const server = createServer((socket) => {
      handleFrames(socket, (request) => {
        if (request.method === "agent_browser_bridge.command.execute") {
          executeParams = request.params as Record<string, unknown>;
          return {
            commandId: "playwright_locator_read_all",
            category: "locator",
            action: "read_all",
            result: {
              values: [{ attributes: { href: "/target" }, inner_text: "target", text_content: "target" }],
              total: 1537,
              offset: 200,
              returned: 1,
              has_more: true,
            },
          };
        }
        return { status: "ok" };
      });
    });
    servers.push(server);
    await listen(server, socketPath);
    const manager = createExpandedBrowserToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
      approvalGate: allowBrowser,
    });

    const result = await manager.execute("browser_locator", {
      action: "read_all",
      tab_id: 42,
      selector: "a",
      offset: 200,
      limit: 1,
    });
    const output = String(result.data);

    expect(executeParams).toMatchObject({
      category: "locator",
      action: "read_all",
      params: { tab_id: 42, selector: "a", offset: 200, limit: 1 },
    });
    expect(output).toContain("read_all total=1537 offset=200 returned=1 has_more=true");
    expect(output).toContain('[200] {"attributes":{"href":"/target"}');
    expect(output).not.toContain("[已压缩摘要");
    await manager.dispose();
  });

  it("returns real per-action results from browser_run", async () => {
    const dir = await mkdtemp(join("/private/tmp", "actspace-browser-run-results-"));
    tempDirs.push(dir);
    const socketPath = join(dir, "bridge.sock");
    const server = createServer((socket) => {
      handleFrames(socket, (request) => {
        if (request.method === "agent_browser_bridge.command.preflight") {
          return {
            actionHash: "hash-results",
            highestRisk: "low",
            readOnly: true,
            approval: "signed-token",
            expiresAt: Date.now() + 60_000,
            actions: [],
          };
        }
        if (request.method === "agent_browser_bridge.command.run") {
          return {
            actionHash: "hash-results",
            results: [
              {
                commandId: "list_tabs",
                category: "tabs",
                action: "list",
                result: [{ id: 42, title: "Bilibili", url: "https://www.bilibili.com/", active: true }],
              },
              {
                commandId: "playwright_locator_all_text_contents",
                category: "locator",
                action: "all_text_contents",
                result: { values: ["番剧", "动画"], total: 2, offset: 0, returned: 2, has_more: false },
              },
              { commandId: "cua_move", category: "cua", action: "move", result: {} },
            ],
          };
        }
        return { status: "ok" };
      });
    });
    servers.push(server);
    await listen(server, socketPath);
    const manager = createExpandedBrowserToolManager({
      workspaceRoot: "/tmp",
      browserBridgeSocketPath: socketPath,
      sessionId: "session-test",
      turnId: "turn-test",
      approvalGate: allowBrowser,
    });

    const result = await manager.execute("browser_run", {
      actions: [{ category: "tabs", action: "list" }],
    });
    const output = String(result.data);

    expect(output).toContain("## 1. tabs.list (list_tabs)");
    expect(output).toContain("[42] * Bilibili — https://www.bilibili.com/");
    expect(output).toContain("## 2. locator.all_text_contents");
    expect(output).toContain('[1] "动画"');
    expect(output).toContain("## 3. cua.move (cua_move)");
    expect(output).not.toContain("[已压缩摘要");
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
