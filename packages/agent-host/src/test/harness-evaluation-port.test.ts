import { describe, expect, it } from "vitest";
import { createNodeHarnessEvaluationHostPort, evaluationModelEnvironment, resolveEnvModelProvider } from "../node-ports/harness-evaluation.js";

describe("harness evaluation Host port", () => {
  it("passes the CLI model connection on, allowing only the model's domain and forwarding through the proxy", () => {
    const env = { LLM_PROVIDER: "OpenRouter", OPENROUTER_API_KEY: "sk-or", LLM_PROXY_URL: "http://127.0.0.1:7897", DEEPSEEK_API_KEY: "sk-other", SECRET: "x" };
    expect(resolveEnvModelProvider(env)).toEqual({ providerId: "openrouter", route: "openai-completions", baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-or", proxyUrl: "http://127.0.0.1:7897" });
    expect(evaluationModelEnvironment(env)).toEqual({ env: { LLM_PROVIDER: "openrouter", LLM_API: "openai-completions", OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1", OPENROUTER_API_KEY: "sk-or" }, domains: ["openrouter.ai"], upstreamProxy: "127.0.0.1:7897" });
    expect(evaluationModelEnvironment({})).toEqual({ env: { LLM_PROVIDER: "deepseek", LLM_API: "openai-completions", DEEPSEEK_BASE_URL: "https://api.deepseek.com" }, domains: ["api.deepseek.com"] });
  });

  it("opens the port of a model served on loopback instead of naming a domain", () => {
    expect(evaluationModelEnvironment({ LLM_PROVIDER: "fake", FAKE_BASE_URL: "http://127.0.0.1:4100/v1", FAKE_API_KEY: "k", LLM_API: "openai-responses" })).toEqual({ env: { LLM_PROVIDER: "fake", LLM_API: "openai-responses", FAKE_BASE_URL: "http://127.0.0.1:4100/v1", FAKE_API_KEY: "k" }, domains: [], localPorts: [4100] });
    expect(evaluationModelEnvironment({ LLM_PROVIDER: "fake", FAKE_BASE_URL: "http://localhost/v1" })).toMatchObject({ domains: [], localPorts: [80] });
    expect(() => evaluationModelEnvironment({ LLM_PROXY_URL: "socks5://127.0.0.1:7897" })).toThrow("http:// proxy");
  });

  it("launches the given CLI entry with this Node", async () => {
    const port = createNodeHarnessEvaluationHostPort({ cliEntry: "/repo/apps/cli/dist/cli.js", artifactRoot: "/data/harness-artifacts", env: { LLM_PROVIDER: "kimi", KIMI_API_KEY: "sk-k" } });
    expect(port.launcher).toEqual([process.execPath, "/repo/apps/cli/dist/cli.js"]);
    expect(port.artifactRoot).toBe("/data/harness-artifacts");
    expect(await port.modelEnvironment("kimi/k2")).toMatchObject({ domains: ["api.moonshot.cn"], env: { KIMI_API_KEY: "sk-k" } });
  });
});
