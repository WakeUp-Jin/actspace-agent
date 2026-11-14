import { describe, expect, it } from "vitest";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { ToolExecutionContext } from "@actspace/tool-runtime";
import type { ToolBodyResult } from "@actspace/tool-runtime";

function context(sessionId = "session", notifyAgent?: (content: RuntimeJsonValue) => Promise<void>, workspaceRoot = ""): ToolExecutionContext { return { pluginId: "actspace.web-tools", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeJsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeJsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeJsonValue) => Promise<void>, workspaceRoot = "") { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot)); }

import { createNodeWebToolPorts as createNodeToolPorts } from "../node-ports.js";
describe("web-tools ports", () => {
  it.each([{ action: "search" }, { action: "search", query: "  " }, { action: "open" }])("rejects missing action-specific arguments before network access: %j", async (args) => {
    let requests = 0;
    const ports = createNodeToolPorts({ credentials: { tavily: "fixture" }, fetchImpl: (async () => { requests++; throw new Error("must not reach network"); }) as typeof fetch });
    await expect(invoke(ports.web, args)).resolves.toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS", retryable: false } });
    expect(requests).toBe(0);
  });
  it("searches through Host-injected credentials without exposing the key", async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
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
    const fetchImpl = (async (input: string | URL | Request) => String(input).includes("api.tavily.com")
      ? new Response(JSON.stringify({ results: [{ title: "Result", url: "https://example.com/page", content: "Useful result" }] }), { status: 200, headers: { "content-type": "application/json" } })
      : new Response("public body", { status: 200, headers: { "content-type": "text/plain" } })) as typeof fetch;
    const ports = createNodeToolPorts({  credentials: { tavily: "key" }, fetchImpl, requestPage: (url) => fetchImpl(url), resolveHostname: async () => ["93.184.216.34"] });
    await expect(invoke(ports.web, { action: "search", query: "ActSpace" })).resolves.toMatchObject({ status: "completed" });
    await expect(invoke(ports.web, { action: "open", url: "https://example.com/page" })).resolves.toMatchObject({ status: "completed" });
    await expect(invoke(ports.web, { action: "invalid" })).resolves.toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS", retryable: false } });
  });
  it("blocks private Web fetch targets and revalidates every redirect", async () => {
    let requests = 0;
    const requestPage = async () => { requests += 1; return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }); };
    const ports = createNodeToolPorts({  requestPage, resolveHostname: async () => ["93.184.216.34"] });
    await expect(invoke(ports.web_fetch, { url: "http://127.0.0.1/secret" })).resolves.toMatchObject({ status: "failed", failure: { code: "WEB_FETCH_FAILED" } });
    expect(requests).toBe(0);
    await expect(invoke(ports.web_fetch, { url: "https://example.com/start" })).resolves.toMatchObject({ status: "failed", failure: { code: "WEB_FETCH_FAILED" } });
    expect(requests).toBe(1);
  });
  it("fetches bounded public text and serves the second read from its local cache", async () => {
    let requests = 0;
    const requestPage = async () => { requests += 1; return new Response("public body", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } }); };
    const ports = createNodeToolPorts({  requestPage, resolveHostname: async () => ["93.184.216.34"] });
    const first = await invoke(ports.web_fetch, { url: "https://example.com/read" }); expect(JSON.stringify(first)).toContain("public body");
    const second = await invoke(ports.web_fetch, { url: "https://example.com/read" }); expect(second).toMatchObject({ status: "completed" });
    expect(requests).toBe(1);
  });
  it("opens each hop at the addresses its own check returned, asking for every name once", async () => {
    // A resolver that changes its answer: public for the first question about a name, loopback from then on.
    const asked: string[] = [];
    const resolveHostname = async (name: string) => { asked.push(name); return asked.filter((item) => item === name).length === 1 ? [name === "start.example" ? "93.184.216.34" : "2606:4700:4700::1111"] : ["127.0.0.1"]; };
    const opened: Array<readonly [string, readonly string[]]> = [];
    const requestPage = async (url: URL, addresses: readonly string[]) => {
      opened.push([url.toString(), addresses]);
      return url.hostname === "start.example" ? new Response(null, { status: 301, headers: { location: "https://next.example/final" } }) : new Response("final body", { status: 200, headers: { "content-type": "text/plain" } });
    };
    const ports = createNodeToolPorts({ requestPage, resolveHostname });
    const result = await invoke(ports.web_fetch, { url: "https://start.example/begin" });
    expect(result).toMatchObject({ status: "completed", summary: "Fetched https://next.example/final locally" });
    expect(JSON.stringify(result)).toContain("URL: https://next.example/final");
    expect(asked).toEqual(["start.example", "next.example"]);
    expect(opened).toEqual([["https://start.example/begin", ["93.184.216.34"]], ["https://next.example/final", ["2606:4700:4700::1111"]]]);
  });
  it("opens a public IPv6 literal and refuses a loopback one written the same way", async () => {
    const opened: Array<readonly string[]> = [];
    const requestPage = async (_url: URL, addresses: readonly string[]) => { opened.push(addresses); return new Response("six", { status: 200, headers: { "content-type": "text/plain" } }); };
    const ports = createNodeToolPorts({ requestPage, resolveHostname: async () => { throw new Error("a literal is never resolved"); } });
    await expect(invoke(ports.web_fetch, { url: "http://[2606:4700:4700::1111]/" })).resolves.toMatchObject({ status: "completed" });
    for (const url of ["http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[fd00::1]/"]) await expect(invoke(ports.web_fetch, { url })).resolves.toMatchObject({ status: "failed", failure: { code: "WEB_FETCH_FAILED", message: expect.stringContaining("not allowed") } });
    expect(opened).toEqual([["2606:4700:4700::1111"]]);
  });
});
