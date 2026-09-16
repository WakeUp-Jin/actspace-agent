import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekFileUploader, filesEndpoint } from "../deepseek-files.js";
import { LegacyProxyWireEngine } from "../legacy-proxy-wire-engine.js";
import type { LlmAdapterDispatchInput } from "@actspace/llm-service";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9wAAAABJRU5ErkJggg==", "base64");

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("DeepSeek Files API", () => {
  it("uploads a session artifact as multipart form data and reuses the cached file id", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ id: "file-api-fixture", created_at: Math.floor(Date.now() / 1_000), expires_at: Math.floor(Date.now() / 1_000) + 100_000 }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const uploader = new DeepSeekFileUploader();
    const input = { apiKey: "secret", baseUrl: "https://api.deepseek.com/v1", sessionId: "session", artifactId: "artifact", bytes: png, mimeType: "image/png" as const, fetchImpl };

    await expect(uploader.resolve(input)).resolves.toBe("file-api-fixture");
    await expect(uploader.resolve(input)).resolves.toBe("file-api-fixture");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe("https://api.deepseek.com/files");
    expect(calls[0].init).toMatchObject({ method: "POST", headers: { Authorization: "Bearer secret", Accept: "application/json" } });
    const form = calls[0].init.body;
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get("purpose")).toBe("user_data");
    expect((form as FormData).get("expires_after[anchor]")).toBe("created_at");
    expect((form as FormData).get("expires_after[seconds]")).toBe("86400");
    expect((form as FormData).get("file")).toBeInstanceOf(Blob);
    expect((form as FormData).get("file")).toMatchObject({ type: "image/png", name: "artifact.png" });
  });

  it("retries a transient upload failure and rejects malformed file ids", async () => {
    let attempts = 0;
    const retryFetch = vi.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? new Response("busy", { status: 503 })
        : new Response(JSON.stringify({ id: "file-api-after-retry" }), { status: 200 });
    });
    const uploader = new DeepSeekFileUploader();
    await expect(uploader.resolve({ apiKey: "secret", baseUrl: "https://api.deepseek.com", sessionId: "s", artifactId: "a", bytes: png, mimeType: "image/png", fetchImpl: retryFetch })).resolves.toBe("file-api-after-retry");
    expect(retryFetch).toHaveBeenCalledTimes(2);

    const malformed = new DeepSeekFileUploader();
    await expect(malformed.resolve({ apiKey: "secret", baseUrl: "https://api.deepseek.com", sessionId: "s", artifactId: "bad", bytes: png, mimeType: "image/png", fetchImpl: vi.fn(async () => new Response(JSON.stringify({ id: "not-a-file-id" }), { status: 200 })) })).rejects.toThrow("invalid file id");
    await expect(malformed.resolve({ apiKey: "", baseUrl: "https://api.deepseek.com", sessionId: "s", artifactId: "no-key", bytes: png, mimeType: "image/png", fetchImpl: vi.fn() })).rejects.toThrow("requires an API key");
    await expect(malformed.resolve({ apiKey: "secret", baseUrl: "https://api.deepseek.com", sessionId: "s", artifactId: "large", bytes: new Uint8Array(64 * 1024 * 1024 + 1), mimeType: "image/png", fetchImpl: vi.fn() })).rejects.toThrow("64 MiB");
  });

  it("re-uploads when the remote id is inside the safety expiry window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T08:00:00Z"));
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify({ id: `file-api-expiring-${calls}`, created_at: 1_000, expires_at: 1_010 }), { status: 200 });
    });
    const uploader = new DeepSeekFileUploader();
    const input = { apiKey: "secret", baseUrl: "https://api.deepseek.com", sessionId: "s", artifactId: "expiry", bytes: png, mimeType: "image/png" as const, fetchImpl };
    await expect(uploader.resolve(input)).resolves.toBe("file-api-expiring-1");
    await expect(uploader.resolve(input)).resolves.toBe("file-api-expiring-2");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sends a DeepSeek file block on the direct OpenAI-compatible route", async () => {
    const fileFetch = vi.fn(async () => new Response(JSON.stringify({ id: "file-api-image" }), { status: 200 }));
    vi.stubGlobal("fetch", fileFetch);
    let body: any;
    const engine = new LegacyProxyWireEngine({
      providerId: "deepseek",
      route: "openai-completions",
      baseUrl: "https://api.deepseek.com/v1",
      deepSeekFiles: new DeepSeekFileUploader(),
      readArtifact: async () => ({ data: png, mimeType: "image/png" }),
      loadSdk: async () => class {
        readonly chat = { completions: { create: async (params: unknown) => { body = params; return (async function* () { yield { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }; })(); } } };
      } as never,
    });
    const input: LlmAdapterDispatchInput = {
      request: {
        requestId: "r", sessionId: "s", routeId: "deepseek", model: "deepseek-flash",
        messages: [{ role: "user", content: [{ type: "text", text: "describe" }, { type: "image", artifactId: "image", mimeType: "image/png" }] }],
        tools: [], options: {},
      },
      credential: { apiKey: "secret" },
      signal: new AbortController().signal,
    };
    const events = [];
    for await (const event of await engine.stream(input)) events.push(event);

    expect(events.at(-1)?.type).toBe("done");
    expect(body.messages[0].content).toContainEqual({ type: "file", file_id: "file-api-image" });
    expect(fileFetch).toHaveBeenCalledTimes(1);
  });
});

it("normalizes DeepSeek file endpoints across compatible base URL forms", () => {
  expect(filesEndpoint("https://api.deepseek.com/v1/")).toBe("https://api.deepseek.com/files");
  expect(filesEndpoint("https://api.deepseek.com/anthropic/beta")).toBe("https://api.deepseek.com/files");
});
