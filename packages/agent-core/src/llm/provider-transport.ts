import { ProxyAgent, fetch as undiciFetch } from "undici";
import type { ProviderFetch } from "./types";

type CachedProxyTransport = {
  dispatcher: ProxyAgent;
  fetch: ProviderFetch;
};

const proxyTransports = new Map<string, CachedProxyTransport>();

export class ProviderProxyError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Provider proxy connection failed.", options);
    this.name = "ProviderProxyError";
  }
}

export function normalizeProxyUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new ProviderProxyError();
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProviderProxyError();
  }
  if (parsed.username || parsed.password) {
    throw new ProviderProxyError();
  }
  if (!parsed.hostname) {
    throw new ProviderProxyError();
  }

  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = "/";
  return parsed.toString();
}

export function isProviderProxyError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (current instanceof ProviderProxyError) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

export function createProviderFetch(proxyUrl?: string): ProviderFetch | undefined {
  if (!proxyUrl?.trim()) return undefined;

  const normalizedUrl = normalizeProxyUrl(proxyUrl);
  const cached = proxyTransports.get(normalizedUrl);
  if (cached) return cached.fetch;

  const dispatcher = new ProxyAgent(normalizedUrl);
  const providerFetch: ProviderFetch = async (input, init) => {
    try {
      return await undiciFetch(input as Parameters<typeof undiciFetch>[0], {
        ...(init as unknown as Parameters<typeof undiciFetch>[1]),
        dispatcher,
      }) as unknown as Response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new ProviderProxyError({ cause: error });
    }
  };

  proxyTransports.set(normalizedUrl, { dispatcher, fetch: providerFetch });
  return providerFetch;
}

export async function closeProviderTransports(): Promise<void> {
  const transports = [...proxyTransports.values()];
  proxyTransports.clear();
  await Promise.allSettled(transports.map(({ dispatcher }) => dispatcher.close()));
}
