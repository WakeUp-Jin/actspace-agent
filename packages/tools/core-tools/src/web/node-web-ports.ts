import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolExecutionContext } from "@actspace/tools-runtime";
import type { CoreToolPorts } from "../plugin.js";

const SEARCH_TIMEOUT_MS = 15_000;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_MARKDOWN_CHARS = 50_000;
const MAX_SNIPPET_CHARS = 800;
const MAX_REDIRECTS = 5;
const CACHE_TTL_MS = 15 * 60_000;
const CACHE_MAX_ENTRIES = 32;

export type WebSearchProviderId = "zhipu" | "tavily" | "tinyfish" | "exa";
export type WebSearchCredentials = Partial<Readonly<Record<WebSearchProviderId, string>>>;

export type NodeWebToolPortsOptions = {
  readonly credentials?: WebSearchCredentials;
  readonly fetchImpl?: typeof fetch;
  readonly resolveHostname?: (hostname: string) => Promise<readonly string[]>;
};

export type NodeWebToolPorts = Pick<CoreToolPorts, "web_search" | "web_fetch"> & { readonly dispose: () => Promise<void> };

export function createNodeWebToolPorts(options: NodeWebToolPortsOptions = {}): NodeWebToolPorts {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveHostname = options.resolveHostname ?? resolveHostnameAddresses;
  const cache = new Map<string, { readonly expiresAt: number; readonly value: string }>();
  return Object.freeze({
    web_search: (args, context) => webSearch(args, context, options.credentials ?? {}, fetchImpl),
    web_fetch: (args, context) => webFetch(args, context, fetchImpl, resolveHostname, cache),
    dispose: async () => { cache.clear(); },
  });
}

type SearchResult = { readonly title: string; readonly url: string; readonly snippet: string; readonly publishedDate?: string };
type SearchOutcome = { readonly provider?: WebSearchProviderId; readonly results: readonly SearchResult[]; readonly failure?: string };

async function webSearch(args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext, credentials: WebSearchCredentials, fetchImpl: typeof fetch): Promise<ToolBodyResult> {
  const query = stringArg(args, "query").trim();
  if (!query) return failed("INVALID_ARGUMENTS", "query is required", false);
  const maxResults = clampInteger(args.max_results, 5, 1, 10);
  const domestic = credentials.zhipu ? provider("zhipu", credentials.zhipu, fetchImpl) : undefined;
  const international = (["tavily", "tinyfish", "exa"] as const).flatMap((id) => credentials[id] ? [provider(id, credentials[id]!, fetchImpl)] : []);
  if (domestic === undefined && international.length === 0) return failed("WEB_SEARCH_NOT_CONFIGURED", "Web search is unavailable: configure at least one Zhipu, Tavily, TinyFish, or Exa API key, then restart the Runtime.", false);
  const [domesticResult, internationalResult] = await Promise.all([
    domestic === undefined ? Promise.resolve<SearchOutcome>({ results: [] }) : runProvider(domestic, query, maxResults, context.signal),
    runProviderFallback(international, query, maxResults, context.signal),
  ]);
  const lanes = [{ label: "international", outcome: internationalResult }, { label: "domestic", outcome: domesticResult }] as const;
  if (lanes.every(({ outcome }) => outcome.results.length === 0)) {
    const details = lanes.flatMap(({ label, outcome }) => outcome.failure ? [`${label}: ${outcome.failure}`] : []);
    return failed("WEB_SEARCH_FAILED", details.length ? `Web search failed. ${details.join(" | ")}` : `Web search returned no results for "${query}".`, true);
  }
  return completed(formatSearchResults(query, lanes), `Web search completed for ${query}`);
}

type SearchProvider = { readonly id: WebSearchProviderId; search(query: string, maxResults: number, signal: AbortSignal): Promise<readonly SearchResult[]> };

function provider(id: WebSearchProviderId, apiKey: string, fetchImpl: typeof fetch): SearchProvider {
  return Object.freeze({
    id,
    async search(query, maxResults, signal) {
      if (id === "zhipu") {
        const value = record(await jsonRequest(id, fetchImpl, "https://open.bigmodel.cn/api/paas/v4/web_search", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ search_engine: "search_pro", search_query: query, count: maxResults }) }, signal));
        return normalizeResults(value?.search_result, { url: "link", snippet: "content", date: "publish_date" }, maxResults);
      }
      if (id === "tavily") {
        const value = record(await jsonRequest(id, fetchImpl, "https://api.tavily.com/search", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, max_results: maxResults, search_depth: "basic", include_answer: false, include_raw_content: false }) }, signal));
        return normalizeResults(value?.results, { url: "url", snippet: "content", date: "published_date" }, maxResults);
      }
      if (id === "tinyfish") {
        const url = new URL("https://api.search.tinyfish.ai"); url.searchParams.set("query", query);
        const value = record(await jsonRequest(id, fetchImpl, url.toString(), { headers: { "X-API-Key": apiKey } }, signal));
        return normalizeResults(value?.results, { url: "url", snippet: "snippet" }, maxResults);
      }
      const value = record(await jsonRequest(id, fetchImpl, "https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ query, numResults: maxResults, type: "auto", contents: { text: { maxCharacters: MAX_SNIPPET_CHARS } } }) }, signal));
      return normalizeResults(value?.results, { url: "url", snippet: "text", date: "publishedDate" }, maxResults);
    },
  });
}

async function jsonRequest(id: WebSearchProviderId, fetchImpl: typeof fetch, url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  const response = await fetchImpl(url, { ...init, signal: combinedSignal(signal, SEARCH_TIMEOUT_MS), redirect: "error" });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`${id} HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return response.json();
}

async function runProvider(candidate: SearchProvider, query: string, maxResults: number, signal: AbortSignal): Promise<SearchOutcome> {
  try { return { provider: candidate.id, results: await candidate.search(query, maxResults, signal) }; }
  catch (error) { return { results: [], failure: safeError(candidate.id, error) }; }
}

async function runProviderFallback(candidates: readonly SearchProvider[], query: string, maxResults: number, signal: AbortSignal): Promise<SearchOutcome> {
  const failures: string[] = [];
  for (const candidate of candidates) {
    const outcome = await runProvider(candidate, query, maxResults, signal);
    if (outcome.provider !== undefined) return outcome;
    if (outcome.failure) failures.push(outcome.failure);
  }
  return { results: [], ...(failures.length ? { failure: failures.join("; ") } : {}) };
}

function normalizeResults(value: RuntimeV2JsonValue | undefined, fields: { readonly url: string; readonly snippet: string; readonly date?: string }, maxResults: number): readonly SearchResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = record(entry); const url = stringValue(item?.[fields.url]);
    if (!url) return [];
    const title = stringValue(item?.title)?.trim() || url;
    const rawSnippet = stringValue(item?.[fields.snippet])?.replace(/\s+/g, " ").trim() ?? "";
    const snippet = rawSnippet.length > MAX_SNIPPET_CHARS ? `${rawSnippet.slice(0, MAX_SNIPPET_CHARS)}...` : rawSnippet;
    const publishedDate = fields.date ? stringValue(item?.[fields.date]) : undefined;
    return [{ title, url, snippet, ...(publishedDate ? { publishedDate } : {}) }];
  }).slice(0, maxResults);
}

function formatSearchResults(query: string, lanes: readonly { readonly label: string; readonly outcome: SearchOutcome }[]): string {
  const seen = new Set<string>(); const sections: string[] = []; const providers: string[] = [];
  for (const { label, outcome } of lanes) {
    if (!outcome.provider) continue;
    const results = outcome.results.filter((item) => { const key = item.url.replace(/\/+$/, ""); if (seen.has(key)) return false; seen.add(key); return true; });
    if (!results.length) continue;
    providers.push(outcome.provider);
    sections.push([`## ${outcome.provider} (${label})`, ...results.map((item, index) => [`${index + 1}. ${item.title}`, `   URL: ${item.url}`, item.publishedDate ? `   Published: ${item.publishedDate}` : "", item.snippet ? `   ${item.snippet}` : ""].filter(Boolean).join("\n"))].join("\n"));
  }
  const failures = lanes.flatMap(({ label, outcome }) => outcome.failure ? [`Note: ${label} lane failed - ${outcome.failure}`] : []);
  return [`Query: ${query}`, `Providers: ${providers.join(", ")}`, `Searched at: ${new Date().toISOString()}`, "", ...sections, ...failures, "", "Tip: call web_fetch with a result URL to read the full page content."].join("\n");
}

async function webFetch(
  args: Readonly<Record<string, RuntimeV2JsonValue>>,
  context: ToolExecutionContext,
  fetchImpl: typeof fetch,
  resolveHostname: (hostname: string) => Promise<readonly string[]>,
  cache: Map<string, { readonly expiresAt: number; readonly value: string }>,
): Promise<ToolBodyResult> {
  const raw = stringArg(args, "url").trim();
  if (!raw) return failed("INVALID_ARGUMENTS", "url is required", false);
  const parsed = parsePublicUrl(raw);
  if (parsed instanceof Error) return failed("WEB_FETCH_URL_DENIED", parsed.message, false);
  const cached = cache.get(parsed.toString());
  if (cached !== undefined && cached.expiresAt >= Date.now()) return completed(cached.value, `Fetched ${parsed.toString()} from cache`);
  if (cached !== undefined) cache.delete(parsed.toString());
  let response: Response;
  try { response = await fetchFollowingSafeRedirects(parsed, context.signal, fetchImpl, resolveHostname); }
  catch (error) { return failed("WEB_FETCH_FAILED", safeError("web_fetch", error), true); }
  if (!response.ok) return failed("WEB_FETCH_HTTP_ERROR", `Fetching ${raw} returned HTTP ${response.status} ${response.statusText}.`, response.status >= 500 || response.status === 429);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE_BYTES) return failed("WEB_FETCH_TOO_LARGE", `Response exceeds ${MAX_RESPONSE_BYTES} bytes.`, false);
  const bytes = await readBoundedBody(response, MAX_RESPONSE_BYTES).catch((error) => error);
  if (bytes instanceof Error) return failed("WEB_FETCH_TOO_LARGE", bytes.message, false);
  const contentType = response.headers.get("content-type") ?? "";
  const mime = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  if (!(mime.startsWith("text/") || mime.includes("json") || mime.includes("xml") || mime.includes("javascript") || mime === "")) return failed("WEB_FETCH_UNSUPPORTED_TYPE", `Unsupported content type "${mime || "unknown"}".`, false);
  const body = decodeBody(bytes, contentType);
  const title = mime.includes("html") ? extractHtmlTitle(body) : undefined;
  let content = mime.includes("html") ? await htmlToMarkdown(body) : body.trim();
  if (!content) return failed("WEB_FETCH_EMPTY", `Fetched ${raw} but found no readable text content.`, false);
  const originalChars = content.length;
  if (content.length > MAX_MARKDOWN_CHARS) content = `${content.slice(0, MAX_MARKDOWN_CHARS)}\n\n[Content truncated: showing first ${MAX_MARKDOWN_CHARS} of ${originalChars} characters]`;
  const value = [`URL: ${response.url || raw}`, title ? `Title: ${title}` : "", `Content-Type: ${mime || "unknown"}`, `Fetched at: ${new Date().toISOString()}`, "", content].filter((line, index) => line || index >= 4).join("\n");
  if (cache.size >= CACHE_MAX_ENTRIES) { const oldest = cache.keys().next().value; if (oldest) cache.delete(oldest); }
  cache.set(parsed.toString(), { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return completed(value, `Fetched ${response.url || raw}`);
}

async function fetchFollowingSafeRedirects(start: URL, signal: AbortSignal, fetchImpl: typeof fetch, resolveHostname: (hostname: string) => Promise<readonly string[]>): Promise<Response> {
  let current = start;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicHostname(current.hostname, resolveHostname);
    const response = await fetchImpl(current, { redirect: "manual", signal: combinedSignal(signal, FETCH_TIMEOUT_MS), headers: { "User-Agent": "actspace-agent", Accept: "text/markdown;q=1.0, text/html;q=0.9, text/plain;q=0.8, application/json;q=0.7, */*;q=0.1" } });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect response is missing Location.");
    if (redirect === MAX_REDIRECTS) throw new Error(`Redirect limit exceeded (${MAX_REDIRECTS}).`);
    const next = parsePublicUrl(new URL(location, current).toString());
    if (next instanceof Error) throw next;
    current = next;
  }
  throw new Error("Redirect limit exceeded.");
}

function parsePublicUrl(raw: string): URL | Error {
  if (raw.length > 2_000) return new Error("URL is too long.");
  let value: URL; try { value = new URL(raw); } catch { return new Error("URL is invalid."); }
  if (value.protocol !== "http:" && value.protocol !== "https:") return new Error("URL must use HTTP or HTTPS.");
  if (value.username || value.password) return new Error("URLs with embedded credentials are not allowed.");
  return value;
}

async function assertPublicHostname(hostname: string, resolveHostname: (hostname: string) => Promise<readonly string[]>): Promise<void> {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) throw new Error("Local and private network hosts are not allowed.");
  const addresses = isIP(normalized) ? [normalized] : await resolveHostname(normalized);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("Local and private network addresses are not allowed.");
}

async function resolveHostnameAddresses(hostname: string): Promise<readonly string[]> { return (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address); }

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::" || value === "::1" || value === "0.0.0.0" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value)) return true;
  if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
  const parts = value.split(".").map(Number); if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a, b] = parts as [number, number, number, number];
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > maxBytes) { await reader.cancel(); throw new Error(`Response exceeds ${maxBytes} bytes.`); } chunks.push(next.value); }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function decodeBody(buffer: Buffer, contentType: string): string {
  const utf8 = buffer.toString("utf8");
  const charset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ?? utf8.match(/<meta\b[^>]*charset\s*=\s*["']?([^"'\s/>]+)/i)?.[1];
  if (!charset || /^utf-?8$/i.test(charset)) return utf8;
  try { return new TextDecoder(charset).decode(buffer); } catch { return utf8; }
}

let turndown: { turndown(value: string): string } | undefined;
async function htmlToMarkdown(html: string): Promise<string> {
  if (turndown === undefined) {
    const module = await import("turndown");
    const service = new module.default({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced", emDelimiter: "*" });
    service.remove(["script", "style", "noscript", "iframe", "object", "embed", "link", "meta", "canvas", "form", "button", "input", "select", "textarea", "nav", "header", "footer", "aside"]);
    const rules = service as unknown as { addRule(key: string, rule: { readonly filter: (node: { readonly nodeName: string }) => boolean; readonly replacement: () => string }): void };
    rules.addRule("remove-svg", { filter: (node) => node.nodeName === "SVG", replacement: () => "" });
    turndown = service;
  }
  return turndown.turndown(html).trim();
}

function extractHtmlTitle(html: string): string | undefined { const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim(); return title?.replace(/\s+/g, " "); }
function combinedSignal(signal: AbortSignal, timeoutMs: number): AbortSignal { return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]); }
function safeError(source: string, error: unknown): string { const message = error instanceof Error ? error.message : String(error); return `${source}: ${message.replace(/((?:Bearer|x-api-key|api[_-]?key)\s+)[^\s,]+/gi, "$1[REDACTED]")}`; }
function record(value: unknown): Readonly<Record<string, RuntimeV2JsonValue>> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : undefined; }
function stringValue(value: RuntimeV2JsonValue | undefined): string | undefined { return typeof value === "string" && value ? value : undefined; }
function stringArg(args: Readonly<Record<string, RuntimeV2JsonValue>>, key: string): string { return stringValue(args[key]) ?? ""; }
function clampInteger(value: RuntimeV2JsonValue | undefined, fallback: number, min: number, max: number): number { return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback; }
function completed(text: string, summary: string): ToolBodyResult { return { status: "completed", summary, modelOutput: [{ type: "text", text }] }; }
function failed(code: string, message: string, retryable: boolean): ToolBodyResult { return { status: "failed", summary: message, modelOutput: [{ type: "text", text: message }], failure: { code, message, retryable } }; }
