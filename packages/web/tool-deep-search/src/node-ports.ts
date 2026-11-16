import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolExecutionContext } from "@actspace/tool-runtime";
import { assembleDeepSearchResult } from "./assemble.js";
import { failedResult, upstreamMessage, type DeepSearchFailure } from "./failure.js";
import type { ToolPorts } from "./plugin.js";
import { readSseData } from "./sse.js";
import { DeepSearchStreamState } from "./stream-state.js";

export const DEEP_SEARCH_ENDPOINT = "https://api.deepseek.com/chat/completions";
export const DEEP_SEARCH_MODEL = "deepseek-flash";
/** Checked against the real API on 2026-11-15 (PA.1): key points only, so the main model does not rewrite a full answer. */
export const DEEP_SEARCH_SYSTEM_PROMPT = "Search the web to answer the user's question, then reply with key points only: a short list of facts, numbers and dates. No introduction, no conclusion, no advice. If sources disagree, or you cannot find reliable information, say so plainly. Reply in the language of the question.";
const MAX_QUESTION_CHARS = 4000;
const MAX_ERROR_BODY_BYTES = 64 * 1024;

export type NodeDeepSearchPortsOptions = {
  /** Read on every call, so a key saved or cleared in Settings applies to the next search. */
  readonly apiKey: () => string | undefined;
  readonly available: () => boolean;
  readonly fetchImpl?: typeof fetch;
  /** No data chunk for this long fails the search; `: keep-alive` comments do not count. */
  readonly idleTimeoutMs?: number;
  readonly totalTimeoutMs?: number;
};

export function createNodeDeepSearchPorts(options: NodeDeepSearchPortsOptions): ToolPorts {
  return { deep_search: (args, context) => deepSearch(options, args, context) };
}

type StopReason = "idle" | "total";
class Stop extends Error { constructor(readonly reason: StopReason) { super(reason); } }

async function deepSearch(options: NodeDeepSearchPortsOptions, args: Readonly<Record<string, RuntimeJsonValue>>, context: ToolExecutionContext): Promise<ToolBodyResult> {
  const apiKey = options.apiKey()?.trim();
  if (!options.available() || !apiKey) return failedResult({ code: "DEEP_SEARCH_UNAVAILABLE", message: "Deep search is turned off or DeepSeek is not connected.", retryable: false });
  const question = typeof args.question === "string" ? args.question.trim() : "";
  if (!question || question.length > MAX_QUESTION_CHARS) return failedResult({ code: "INVALID_ARGUMENTS", message: `question must be 1-${MAX_QUESTION_CHARS} characters after trimming.`, retryable: false });
  if (context.signal.aborted) return aborted();

  const idle = new AbortController();
  const total = new AbortController();
  const idleMs = options.idleTimeoutMs ?? 40_000;
  let idleTimer = setTimeout(() => idle.abort(new Stop("idle")), idleMs);
  const totalTimer = setTimeout(() => total.abort(new Stop("total")), options.totalTimeoutMs ?? 120_000);
  const touch = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => idle.abort(new Stop("idle")), idleMs); };
  const signal = AbortSignal.any([context.signal, idle.signal, total.signal]);
  const stopped = (): ToolBodyResult | undefined => {
    if (context.signal.aborted) return aborted();
    if (idle.signal.aborted) return failedResult({ code: "DEEP_SEARCH_IDLE_TIMEOUT", message: `No data from DeepSeek for ${Math.round(idleMs / 1000)} seconds; deep search stopped.`, retryable: true });
    if (total.signal.aborted) return failedResult({ code: "DEEP_SEARCH_TIMEOUT", message: `Deep search did not finish within ${Math.round((options.totalTimeoutMs ?? 120_000) / 1000)} seconds.`, retryable: true });
    return undefined;
  };

  try {
    const response = await (options.fetchImpl ?? fetch)(DEEP_SEARCH_ENDPOINT, {
      method: "POST",
      redirect: "error",
      signal,
      headers: { "content-type": "application/json", accept: "text/event-stream", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: DEEP_SEARCH_MODEL,
        stream: true,
        stream_options: { include_usage: true },
        thinking: { type: "enabled" },
        tools: [{ type: "deepseek_web_search" }],
        messages: [{ role: "system", content: DEEP_SEARCH_SYSTEM_PROMPT }, { role: "user", content: question }],
      }),
    });
    touch();
    if (!response.ok) return failedResult(httpFailure(response.status, await readErrorMessage(response, signal)));
    if (!response.body || !(response.headers.get("content-type") ?? "").toLowerCase().includes("text/event-stream")) {
      await response.body?.cancel().catch(() => undefined);
      return failedResult({ code: "DEEP_SEARCH_FAILED", message: "DeepSeek did not return an event stream.", retryable: false });
    }

    const state = new DeepSearchStreamState();
    for await (const data of readSseData(response.body, touch, signal)) {
      if (data === "[DONE]") break;
      let chunk: unknown;
      try { chunk = JSON.parse(data); }
      catch { return failedResult({ code: "DEEP_SEARCH_FAILED", message: "DeepSeek sent a malformed stream chunk.", retryable: true }); }
      const progress = state.push(chunk);
      if (state.failed) break;
      if (progress !== undefined) context.reportProgress({ message: progress });
    }
    const finished = state.finish();
    return finished.ok ? assembleDeepSearchResult(finished.outcome) : failedResult(finished.failure);
  } catch (error) {
    return stopped() ?? failedResult({ code: "DEEP_SEARCH_FAILED", message: `DeepSeek deep search request failed: ${upstreamMessage(errorText(error))}`, retryable: true });
  } finally {
    clearTimeout(idleTimer);
    clearTimeout(totalTimer);
  }
}

function httpFailure(status: number, message: string): DeepSearchFailure {
  if (status === 401) return { code: "DEEPSEEK_AUTH_FAILED", message: "DeepSeek rejected the API key (HTTP 401).", retryable: false };
  if (status === 402) return { code: "DEEPSEEK_INSUFFICIENT_BALANCE", message: "The DeepSeek account balance is insufficient (HTTP 402).", retryable: false };
  if (status === 429) return { code: "DEEPSEEK_RATE_LIMITED", message: "DeepSeek is rate limiting requests (HTTP 429). Try again later.", retryable: true };
  if (status === 400 && /Content Exists Risk/i.test(message)) return { code: "DEEPSEEK_CONTENT_RISK", message: "DeepSeek rejected the question under its content safety policy.", retryable: false };
  return { code: "DEEP_SEARCH_FAILED", message: `DeepSeek deep search failed: HTTP ${status}${message ? ` ${upstreamMessage(message)}` : ""}`, retryable: status >= 500 };
}

async function readErrorMessage(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) return "";
  let text = "";
  try {
    const decoder = new TextDecoder();
    for await (const piece of boundedChunks(response.body, signal)) text += decoder.decode(piece, { stream: true });
  } catch { /* the status code alone is enough */ }
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string") return parsed.error.message;
  } catch { /* not JSON */ }
  return text.trim();
}

async function* boundedChunks(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let size = 0;
  try {
    while (size < MAX_ERROR_BODY_BYTES && !signal.aborted) {
      const { done, value } = await reader.read();
      if (done) return;
      size += value.byteLength;
      yield value.subarray(0, Math.max(0, value.byteLength - Math.max(0, size - MAX_ERROR_BODY_BYTES)));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function aborted(): ToolBodyResult {
  return failedResult({ code: "TOOL_ABORTED", message: "Deep search was aborted.", retryable: false });
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
  return String(error);
}
