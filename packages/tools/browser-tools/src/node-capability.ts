import * as net from "node:net";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolArtifactRef, ToolBodyResult, ToolExecutionContext, ToolModelOutputBlock } from "@actspace/tools-runtime";
import type { BrowserCapability } from "./host-port.js";
import { redactBrowserValue } from "./redaction.js";

const PROTOCOL_VERSION = "0.2.0";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_FRAME_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_CHARS = 100_000;
const MAX_IMAGE_BASE64_CHARS = 24 * 1024 * 1024;

type BrowserIdentity = {
  readonly sessionId: string;
  readonly turnId: string;
};

export type BrowserBridgeTransport = {
  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown>;
  dispose(): Promise<void>;
};

export type NodeBrowserCapabilityOptions = {
  readonly ready: boolean;
  readonly socketPath: string;
  readonly timeoutMs?: number;
  readonly maxFrameBytes?: number;
  readonly transportFactory?: (identity: BrowserIdentity) => BrowserBridgeTransport;
};

export function createNodeBrowserCapability(options: NodeBrowserCapabilityOptions): BrowserCapability {
  const transportFactory = options.transportFactory ?? ((identity) => new SocketBrowserBridgeTransport({
    socketPath: options.socketPath,
    sessionId: identity.sessionId,
    turnId: identity.turnId,
    timeoutMs: options.timeoutMs,
    maxFrameBytes: options.maxFrameBytes,
  }));
  return Object.freeze({
    ready: options.ready,
    async command(name, args, context) {
      if (!options.ready) return failure("BROWSER_UNAVAILABLE", "Browser Bridge is unavailable.", true);
      const transport = transportFactory({ sessionId: context.sessionId, turnId: context.turnId });
      try {
        return await executeBrowserCommand(transport, name, args, context);
      } catch (error) {
        const aborted = context.signal.aborted;
        const message = aborted ? "Browser command was aborted." : redactBrowserValue(error instanceof Error ? error.message : String(error));
        return failure(aborted ? "TOOL_ABORTED" : "BROWSER_COMMAND_FAILED", message, aborted);
      } finally {
        await transport.dispose();
      }
    },
  });
}

type SocketBrowserBridgeTransportOptions = {
  readonly socketPath: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly timeoutMs?: number;
  readonly maxFrameBytes?: number;
};

export class SocketBrowserBridgeTransport implements BrowserBridgeTransport {
  readonly #timeoutMs: number;
  readonly #maxFrameBytes: number;
  readonly #pending = new Map<string, PendingRequest>();
  #socket: net.Socket | undefined;
  #connectPromise: Promise<void> | undefined;
  #buffer = Buffer.alloc(0);
  #counter = 0;
  #disposed = false;

  constructor(private readonly options: SocketBrowserBridgeTransportOptions) {
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
  }

  async request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (this.#disposed) throw new Error("Browser Bridge transport is disposed.");
    await this.#connect();
    return this.#sendConnected(method, params, signal);
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    if (this.#socket !== undefined && !this.#socket.destroyed) {
      try {
        await this.#sendConnected("agent_browser_bridge.session.end", {
          sessionId: this.options.sessionId,
          turnId: this.options.turnId,
        });
      } catch {
        // Session shutdown is best effort; disconnect still rejects every pending call.
      }
    }
    this.#disposed = true;
    this.#disconnect(new Error("Browser Bridge transport was disposed."));
  }

  async #connect(): Promise<void> {
    if (this.#socket !== undefined && !this.#socket.destroyed) return;
    if (this.#connectPromise === undefined) this.#connectPromise = this.#openAndStart();
    try {
      await this.#connectPromise;
    } finally {
      this.#connectPromise = undefined;
    }
  }

  async #openAndStart(): Promise<void> {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const candidate = net.createConnection(this.options.socketPath);
      const connected = () => {
        candidate.removeListener("error", failed);
        resolve(candidate);
      };
      const failed = (error: Error) => {
        candidate.removeListener("connect", connected);
        candidate.destroy();
        reject(new Error(`Browser Bridge connection failed: ${error.message}`));
      };
      candidate.once("connect", connected);
      candidate.once("error", failed);
    });
    this.#socket = socket;
    socket.on("data", (chunk) => this.#handleData(chunk));
    socket.on("error", (error) => this.#disconnect(error));
    socket.on("close", () => this.#disconnect(new Error("Browser Bridge disconnected.")));
    try {
      await this.#sendConnected("agent_browser_bridge.session.start", {
        sessionId: this.options.sessionId,
        turnId: this.options.turnId,
      });
    } catch (error) {
      this.#disconnect(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  #sendConnected(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    const socket = this.#socket;
    if (socket === undefined || socket.destroyed) return Promise.reject(new Error("Browser Bridge socket is not connected."));
    if (signal?.aborted === true) return Promise.reject(abortError());
    const id = String(++this.#counter);
    const payload = Buffer.from(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, id, method, params }), "utf8");
    if (payload.byteLength > this.#maxFrameBytes) return Promise.reject(new Error(`Browser Bridge request frame exceeds ${this.#maxFrameBytes} bytes.`));
    return new Promise<unknown>((resolve, reject) => {
      const abort = () => {
        const pending = this.#pending.get(id);
        if (pending === undefined) return;
        this.#pending.delete(id);
        clearTimeout(pending.timer);
        signal?.removeEventListener("abort", abort);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        signal?.removeEventListener("abort", abort);
        reject(new Error(`Browser Bridge request timed out: ${method}`));
      }, this.#timeoutMs);
      timer.unref?.();
      this.#pending.set(id, { resolve, reject, timer, signal, abort });
      signal?.addEventListener("abort", abort, { once: true });
      const header = Buffer.allocUnsafe(4);
      header.writeUInt32LE(payload.byteLength, 0);
      socket.write(Buffer.concat([header, payload]));
    });
  }

  #handleData(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    while (this.#buffer.byteLength >= 4) {
      const payloadLength = this.#buffer.readUInt32LE(0);
      if (payloadLength > this.#maxFrameBytes) {
        this.#disconnect(new Error(`Browser Bridge response frame exceeds ${this.#maxFrameBytes} bytes.`));
        return;
      }
      if (this.#buffer.byteLength < payloadLength + 4) return;
      const payload = this.#buffer.subarray(4, payloadLength + 4);
      this.#buffer = this.#buffer.subarray(payloadLength + 4);
      let response: BridgeResponse;
      try {
        response = JSON.parse(payload.toString("utf8")) as BridgeResponse;
      } catch {
        this.#disconnect(new Error("Browser Bridge returned malformed JSON."));
        return;
      }
      if (typeof response.id !== "string") continue;
      const pending = this.#pending.get(response.id);
      if (pending === undefined) continue;
      this.#pending.delete(response.id);
      clearTimeout(pending.timer);
      pending.signal?.removeEventListener("abort", pending.abort);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(`${response.error?.code ?? "BROWSER_BRIDGE_ERROR"}: ${response.error?.message ?? "Browser Bridge request failed."}`));
    }
  }

  #disconnect(error: Error): void {
    const socket = this.#socket;
    this.#socket = undefined;
    this.#buffer = Buffer.alloc(0);
    socket?.destroy();
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.signal?.removeEventListener("abort", pending.abort);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

type PendingRequest = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly signal?: AbortSignal;
  readonly abort: () => void;
};

type BridgeResponse = {
  readonly id?: string;
  readonly ok?: boolean;
  readonly result?: unknown;
  readonly error?: { readonly code?: string; readonly message?: string };
};

async function executeBrowserCommand(
  transport: BrowserBridgeTransport,
  name: string,
  args: Readonly<Record<string, RuntimeV2JsonValue>>,
  context: ToolExecutionContext,
): Promise<ToolBodyResult> {
  if (name === "browser_help") return browserHelp(transport, args, context.signal);
  if (name === "browser_run") return browserRun(transport, args, context);
  const category = name === "browser_action" ? stringValue(args.category) : name.replace(/^browser_/, "");
  const action = stringValue(args.action);
  if (!category || !action) return failure("INVALID_ARGUMENTS", "Browser category and action are required.", false);
  const params = name === "browser_action"
    ? recordValue(args.params) ?? {}
    : Object.fromEntries(Object.entries(args).filter(([key]) => key !== "action"));
  const execution = await transport.request("agent_browser_bridge.command.execute", { category, action, params }, context.signal);
  return renderExecutions([execution], context, "Browser action completed");
}

async function browserHelp(transport: BrowserBridgeTransport, args: Readonly<Record<string, RuntimeV2JsonValue>>, signal: AbortSignal): Promise<ToolBodyResult> {
  const category = stringValue(args.category);
  const action = stringValue(args.action);
  const query = stringValue(args.query)?.toLowerCase();
  if (category && action) {
    const result = await transport.request("agent_browser_bridge.command.describe", { category, action }, signal);
    return completed(truncate(redactBrowserValue(JSON.stringify(result, null, 2)), 20_000), "Described Browser command");
  }
  const result = await transport.request("agent_browser_bridge.command.list", {}, signal);
  const report = recordValue(result);
  const commands = Array.isArray(report?.commands) ? report.commands.filter((command) => {
    const item = recordValue(command);
    if (category && item?.category !== category) return false;
    return !query || JSON.stringify(item).toLowerCase().includes(query);
  }) : [];
  return completed(truncate(redactBrowserValue(JSON.stringify({ count: commands.length, categories: report?.categories ?? [], commands }, null, 2)), 20_000), "Listed Browser commands");
}

async function browserRun(transport: BrowserBridgeTransport, args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext): Promise<ToolBodyResult> {
  const actions = normalizeActions(args.actions);
  if (actions.length === 0) return failure("INVALID_ARGUMENTS", "browser_run requires at least one action.", false);
  const identity = { sessionId: context.sessionId, turnId: context.turnId };
  const preflight = recordValue(await transport.request("agent_browser_bridge.command.preflight", { actions, ...identity }, context.signal));
  const approval = stringValue(preflight?.approval);
  if (!approval) return failure("BROWSER_PREFLIGHT_REJECTED", "Browser Bridge preflight did not issue an action-bound token.", false);
  const result = recordValue(await transport.request("agent_browser_bridge.command.run", {
    actions,
    stopOnError: args.stop_on_error !== false,
    approval,
    ...identity,
  }, context.signal));
  const executions = Array.isArray(result?.results) ? result.results : [];
  return renderExecutions(executions, context, `Browser run completed: ${executions.length} actions`);
}

async function renderExecutions(executions: readonly unknown[], context: ToolExecutionContext, summary: string): Promise<ToolBodyResult> {
  if (executions.length === 0) return failure("BROWSER_INVALID_RESPONSE", "Browser Bridge returned no execution results.", false);
  const output: string[] = [summary];
  const artifacts: ToolArtifactRef[] = [];
  const modelOutput: ToolModelOutputBlock[] = [];
  let firstFailure: { readonly code: string; readonly message: string } | undefined;
  for (const [index, value] of executions.entries()) {
    const execution = recordValue(value);
    const category = stringValue(execution?.category) ?? "unknown";
    const action = stringValue(execution?.action) ?? "unknown";
    const status = stringValue(execution?.status) ?? "unknown";
    const error = recordValue(execution?.error);
    output.push("", `## ${index + 1}. ${category}.${action} (${status})`);
    if (error !== undefined) {
      const code = stringValue(error.code) ?? "BROWSER_ACTION_FAILED";
      const message = stringValue(error.message) ?? "unknown error";
      firstFailure ??= { code, message };
      output.push(`Browser action failed (${code}): ${message}`);
      continue;
    }
    if (status !== "completed") {
      firstFailure ??= { code: "BROWSER_ACTION_FAILED", message: `Browser action ended with status ${status}.` };
      output.push(firstFailure.message);
      continue;
    }
    const result = execution?.result;
    if (isImageResult(result)) {
      const artifact = await createImageArtifact(result, context);
      artifacts.push(artifact);
      modelOutput.push({ type: "artifact", artifact, label: `${category}.${action} screenshot` });
      output.push(`Screenshot stored as artifact ${artifact.artifactId} (${artifact.mediaType}, ${artifact.size} bytes).`);
    } else {
      output.push(renderBrowserValue(result, category, action));
    }
    if (output.join("\n").length >= MAX_TEXT_CHARS) {
      output.push("[BROWSER_OUTPUT_TRUNCATED]");
      break;
    }
  }
  const text = truncate(redactBrowserValue(output.join("\n")), MAX_TEXT_CHARS);
  const safeFailure = firstFailure === undefined ? undefined : { code: firstFailure.code, message: redactBrowserValue(firstFailure.message) };
  return firstFailure === undefined
    ? { status: "completed", summary, modelOutput: [{ type: "text", text }, ...modelOutput], artifacts }
    : { status: "failed", summary: safeFailure!.message, modelOutput: [{ type: "text", text }, ...modelOutput], artifacts, failure: { ...safeFailure!, retryable: false } };
}

function renderBrowserValue(value: unknown, category: string, action: string): string {
  const record = recordValue(value);
  if (typeof record?.dom_snapshot === "string") return truncate(record.dom_snapshot, 50_000);
  if (category === "dom" && action === "snapshot" && Array.isArray(record?.nodes)) {
    return truncate(JSON.stringify({ generation: record.generation, total: record.total, returned: record.returned, truncated: record.truncated, nodes: record.nodes }, null, 2), 50_000);
  }
  return truncate(JSON.stringify(value ?? {}, null, 2), 20_000);
}

async function createImageArtifact(value: { readonly mimeType: string; readonly data: string }, context: ToolExecutionContext): Promise<ToolArtifactRef> {
  if (!/^image\/(?:png|jpeg|gif|webp)$/.test(value.mimeType)) throw new Error(`Unsupported Browser image type: ${value.mimeType}`);
  if (value.data.length > MAX_IMAGE_BASE64_CHARS || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) throw new Error("Browser screenshot payload is invalid or too large.");
  const bytes = Buffer.from(value.data, "base64");
  return context.createArtifact({ bytes, mediaType: value.mimeType });
}

function normalizeActions(value: RuntimeV2JsonValue | undefined): readonly Readonly<Record<string, RuntimeV2JsonValue>>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const action = recordValue(item);
    const category = stringValue(action?.category);
    const name = stringValue(action?.action);
    if (!category || !name) return [];
    return [{ category, action: name, params: recordValue(action?.params) ?? {} }];
  });
}

function isImageResult(value: unknown): value is { readonly mimeType: string; readonly data: string } {
  const record = recordValue(value);
  return typeof record?.mimeType === "string" && typeof record.data === "string";
}

function recordValue(value: unknown): Readonly<Record<string, RuntimeV2JsonValue>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : undefined;
}

function stringValue(value: RuntimeV2JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function completed(text: string, summary: string): ToolBodyResult {
  return { status: "completed", summary, modelOutput: [{ type: "text", text }] };
}

function failure(code: string, message: string, retryable: boolean): ToolBodyResult {
  return { status: "failed", summary: message, modelOutput: [{ type: "text", text: message }], failure: { code, message, retryable } };
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}\n...[truncated]`;
}

function abortError(): Error {
  const error = new Error("Browser Bridge request was aborted.");
  error.name = "AbortError";
  return error;
}
