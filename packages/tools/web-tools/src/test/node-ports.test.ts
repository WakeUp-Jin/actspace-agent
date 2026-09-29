import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import type { ToolBodyResult } from "@actspace/tools-runtime";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function workspace(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "actspace-v2-node-tools-")); roots.push(root); return root; }
function context(sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = ""): ToolExecutionContext { return { pluginId: "actspace.web-tools", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeV2JsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = "") { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot)); }

import { createNodeWebToolPorts as createNodeToolPorts } from "../node-ports.js";
describe("web-tools ports", () => {
  it("searches through Host-injected credentials without exposing the key", async () => {
    const root = await workspace(); const calls: Array<{ url: string; authorization: string | null }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers); calls.push({ url: String(input), authorization: headers.get("authorization") });
      return new Response(JSON.stringify({ results: [{ title: "Result", url: "https://example.com/page", content: "Useful result" }] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const ports = createNodeToolPorts({  credentials: { tavily: "secret-search-key" }, fetchImpl });
    const result = await invoke(ports.web_search, { query: "ActSpace", max_results: 3 });
    expect(result).toMatchObject({ status: "completed" });
    expect(JSON.stringify(result)).toContain("https://example.com/page");
    expect(JSON.stringify(result)).not.toContain("secret-search-key");
    expect(calls).toEqual([{ url: "https://api.tavily.com/search", authorization: "Bearer secret-search-key" }]);
  });
  it("routes the Chat web facade to search and open while rejecting unknown actions", async () => {
    const root = await workspace();
    const fetchImpl = (async (input: string | URL | Request) => String(input).includes("api.tavily.com")
      ? new Response(JSON.stringify({ results: [{ title: "Result", url: "https://example.com/page", content: "Useful result" }] }), { status: 200, headers: { "content-type": "application/json" } })
      : new Response("public body", { status: 200, headers: { "content-type": "text/plain" } })) as typeof fetch;
    const ports = createNodeToolPorts({  credentials: { tavily: "key" }, fetchImpl, resolveHostname: async () => ["93.184.216.34"] });
    await expect(invoke(ports.web, { action: "search", query: "ActSpace" })).resolves.toMatchObject({ status: "completed" });
    await expect(invoke(ports.web, { action: "open", url: "https://example.com/page" })).resolves.toMatchObject({ status: "completed" });
    await expect(invoke(ports.web, { action: "invalid" })).resolves.toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS", retryable: false } });
  });
  it("blocks private Web fetch targets and revalidates every redirect", async () => {
    const root = await workspace(); let requests = 0;
    const fetchImpl = (async () => { requests += 1; return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }); }) as typeof fetch;
    const ports = createNodeToolPorts({  fetchImpl, resolveHostname: async () => ["93.184.216.34"] });
    await expect(invoke(ports.web_fetch, { url: "http://127.0.0.1/secret" })).resolves.toMatchObject({ status: "failed", failure: { code: "WEB_FETCH_FAILED" } });
    expect(requests).toBe(0);
    await expect(invoke(ports.web_fetch, { url: "https://example.com/start" })).resolves.toMatchObject({ status: "failed", failure: { code: "WEB_FETCH_FAILED" } });
    expect(requests).toBe(1);
  });
  it("fetches bounded public text and serves the second read from its local cache", async () => {
    const root = await workspace(); let requests = 0;
    const fetchImpl = (async () => { requests += 1; return new Response("public body", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } }); }) as typeof fetch;
    const ports = createNodeToolPorts({  fetchImpl, resolveHostname: async () => ["93.184.216.34"] });
    const first = await invoke(ports.web_fetch, { url: "https://example.com/read" }); expect(JSON.stringify(first)).toContain("public body");
    const second = await invoke(ports.web_fetch, { url: "https://example.com/read" }); expect(second).toMatchObject({ status: "completed" });
    expect(requests).toBe(1);
  });
});
async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for asynchronous notification.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}
