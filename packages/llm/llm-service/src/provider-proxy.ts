type ProviderFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type ProxyDispatcher = { close(): Promise<void> };
type UndiciModule = {
  readonly ProxyAgent: new (url: string) => ProxyDispatcher;
  readonly fetch: (input: unknown, init?: Record<string, unknown>) => Promise<Response>;
};

export type ProviderProxyPoolLoader = () => Promise<UndiciModule>;

export class ProviderProxyError extends Error {
  constructor(options?: { readonly cause?: unknown }) {
    super("Provider proxy connection failed.", options);
    this.name = "ProviderProxyError";
  }
}

export class ProviderProxyPool {
  readonly #entries = new Map<string, { readonly dispatcher: ProxyDispatcher; readonly fetch: ProviderFetch }>();
  constructor(private readonly load: ProviderProxyPoolLoader = loadUndici) {}

  async getFetch(rawUrl: string): Promise<ProviderFetch> {
    const url = normalizeProviderProxyUrl(rawUrl);
    const existing = this.#entries.get(url);
    if (existing !== undefined) return existing.fetch;
    let undici: UndiciModule;
    let dispatcher: ProxyDispatcher;
    try {
      undici = await this.load();
      dispatcher = new undici.ProxyAgent(url);
    } catch (cause) {
      throw new ProviderProxyError({ cause });
    }
    const fetch: ProviderFetch = async (input, init) => {
      try {
        return await undici.fetch(input, { ...(init as Record<string, unknown> | undefined), dispatcher });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        throw new ProviderProxyError({ cause: error });
      }
    };
    this.#entries.set(url, { dispatcher, fetch });
    return fetch;
  }

  async dispose(): Promise<void> {
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    const results = await Promise.allSettled(entries.map(({ dispatcher }) => dispatcher.close()));
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failed !== undefined) throw failed.reason;
  }
}

export function normalizeProviderProxyUrl(rawUrl: string): string {
  let parsed: URL;
  try { parsed = new URL(rawUrl.trim()); } catch { throw new ProviderProxyError(); }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password || !parsed.hostname) throw new ProviderProxyError();
  parsed.username = ""; parsed.password = ""; parsed.search = ""; parsed.hash = ""; parsed.pathname = "/";
  return parsed.toString();
}

async function loadUndici(): Promise<UndiciModule> {
  const name: string = "undici";
  return import(name) as Promise<UndiciModule>;
}
