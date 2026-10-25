import type { HarnessEvaluationHostPort, HarnessModelEnvironment } from "@actspace/harness-evaluation/types";
import type { NodePiAiProvider } from "./llm-adapter.js";

/** The CLI's model connection: `LLM_PROVIDER`, `LLM_API`, `<PROVIDER>_BASE_URL`, `<PROVIDER>_API_KEY`, `LLM_PROXY_URL`. */
export function resolveEnvModelProvider(env: NodeJS.ProcessEnv): NodePiAiProvider {
  const providerId = (env.LLM_PROVIDER ?? "deepseek").toLowerCase();
  const route = env.LLM_API === "openai-responses" || env.LLM_API === "anthropic-messages" ? env.LLM_API : "openai-completions";
  const prefix = providerId.toUpperCase();
  const baseUrl = env[`${prefix}_BASE_URL`] ?? (providerId === "kimi" ? "https://api.moonshot.cn/v1" : providerId === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.deepseek.com");
  return Object.freeze({ providerId, route, baseUrl, apiKey: env[`${prefix}_API_KEY`], ...(env.LLM_PROXY_URL === undefined ? {} : { proxyUrl: env.LLM_PROXY_URL }) });
}

/**
 * The candidate gets the same model connection as this process, as variables the CLI reads. The proxy is not passed on:
 * the evaluation sandbox forwards allowed connections through it, so the candidate cannot reach anything else.
 */
export function evaluationModelEnvironment(env: NodeJS.ProcessEnv): HarnessModelEnvironment {
  const provider = resolveEnvModelProvider(env);
  const prefix = provider.providerId.toUpperCase();
  const url = new URL(provider.baseUrl);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // Clients bypass the sandbox proxy for loopback, so a local model is reached through an opened port instead of a domain.
  const loopback = host === "localhost" || host === "::1" || /^127\./.test(host);
  return Object.freeze({
    env: Object.freeze({ LLM_PROVIDER: provider.providerId, LLM_API: provider.route, [`${prefix}_BASE_URL`]: provider.baseUrl, ...(provider.apiKey ? { [`${prefix}_API_KEY`]: provider.apiKey } : {}) }),
    domains: loopback ? [] : [host],
    ...(loopback ? { localPorts: [Number(url.port || (url.protocol === "https:" ? 443 : 80))] } : {}),
    ...(provider.proxyUrl === undefined ? {} : { upstreamProxy: proxyAddress(provider.proxyUrl) }),
  });
}

/** `cliEntry` is the built CLI (`apps/cli/dist/cli.js`); this package cannot locate an application itself. */
export function createNodeHarnessEvaluationHostPort(options: { readonly cliEntry: string; readonly artifactRoot: string; readonly env?: NodeJS.ProcessEnv; readonly nodePath?: string }): HarnessEvaluationHostPort {
  const env = options.env ?? process.env;
  return Object.freeze({
    launcher: Object.freeze([options.nodePath ?? process.execPath, options.cliEntry]),
    artifactRoot: options.artifactRoot,
    // The model id goes to the CLI as `--model`; the connection does not depend on it.
    modelEnvironment: async () => evaluationModelEnvironment(env),
  });
}

function proxyAddress(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:") throw new Error(`The evaluation sandbox forwards only through an http:// proxy (LLM_PROXY_URL is ${url.protocol}//…).`);
  return `${url.hostname}:${url.port || 80}`;
}
