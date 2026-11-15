import type { DeepSearchAnnotation, DeepSearchOutcome } from "./assemble.js";
import { upstreamMessage, type DeepSearchFailure } from "./failure.js";

type Json = Record<string, unknown>;
type StepCount = { queries: number; pages: number };
type Collected = { queries: string[]; lookup: Map<string, { title?: string; site?: string }>; failedPages: { url: string; code: string }[]; searchQueryCount: number };

export type DeepSearchStreamResult = { readonly ok: true; readonly outcome: DeepSearchOutcome } | { readonly ok: false; readonly failure: DeepSearchFailure };

/**
 * Folds DeepSeek deep-search chunks into an outcome. Stream events only drive progress; the final chunk's
 * `server_tool_calls` is the complete record and replaces what the events collected. Unknown fields are ignored.
 */
export class DeepSearchStreamState {
  private readonly contentParts: string[] = [];
  private readonly steps = new Map<number, StepCount>();
  private readonly streamed: Collected = emptyCollected();
  /** Started calls by id, so a completion can be matched to its queries or page URL. */
  private readonly pendingSearch = new Map<string, number>();
  private readonly pendingPage = new Map<string, string>();
  private final: Collected | undefined;
  private annotations: DeepSearchAnnotation[] = [];
  private billed: { searches?: number; fetches?: number } = {};
  private finishReason: string | undefined;
  private failure: DeepSearchFailure | undefined;
  private progress = "";
  private maxStep = -1;
  private summarizing = false;

  get failed(): boolean { return this.failure !== undefined; }

  /** Feeds one parsed chunk; returns the new progress message when it changed. */
  push(chunk: unknown): string | undefined {
    if (this.failure || !isRecord(chunk)) return undefined;
    if (chunk.error !== undefined && chunk.error !== null) {
      this.failure = errorChunkFailure(chunk.error);
      return undefined;
    }
    if (isRecord(chunk.usage) && isRecord(chunk.usage.server_tool_use)) {
      const use = chunk.usage.server_tool_use;
      this.billed = { ...(count(use.tool_search) === undefined ? {} : { searches: count(use.tool_search) }), ...(count(use.tool_fetch) === undefined ? {} : { fetches: count(use.tool_fetch) }) };
    }
    const choice = Array.isArray(chunk.choices) && isRecord(chunk.choices[0]) ? chunk.choices[0] : undefined;
    if (!choice) return undefined;
    if (isRecord(choice.server_tool_event)) this.onEvent(choice.server_tool_event);
    const delta = isRecord(choice.delta) ? choice.delta : undefined;
    if (delta && typeof delta.content === "string" && delta.content) {
      this.contentParts.push(delta.content);
      this.summarizing = true;
    }
    if (typeof choice.finish_reason === "string" && choice.finish_reason) {
      this.finishReason = choice.finish_reason;
      if (delta) {
        if (Array.isArray(delta.annotations)) this.annotations = parseAnnotations(delta.annotations);
        if (Array.isArray(delta.server_tool_calls)) this.final = collectFinal(delta.server_tool_calls);
      }
    }
    const next = this.currentProgress();
    if (next === this.progress) return undefined;
    this.progress = next;
    return next || undefined;
  }

  finish(): DeepSearchStreamResult {
    if (this.failure) return { ok: false, failure: this.failure };
    if (this.finishReason === undefined) return fail("DEEP_SEARCH_FAILED", "DeepSeek deep search stream ended before the answer finished.", true);
    if (this.finishReason === "content_filter") return fail("DEEPSEEK_CONTENT_RISK", "DeepSeek withheld the answer under its content safety policy.", false);
    if (this.finishReason !== "stop" && this.finishReason !== "length") return fail("DEEP_SEARCH_FAILED", `DeepSeek deep search finished unexpectedly (${this.finishReason.slice(0, 50)}).`, false);
    const content = this.contentParts.join("");
    if (!content.trim()) return fail("DEEP_SEARCH_FAILED", "DeepSeek deep search returned an empty answer.", false);
    const collected = this.final ?? this.streamed;
    return {
      ok: true,
      outcome: {
        content, annotations: this.annotations, queries: collected.queries, lookup: collected.lookup, failedPages: collected.failedPages,
        billed: this.billed, searchQueryCount: collected.searchQueryCount, finishReason: this.finishReason,
      },
    };
  }

  private onEvent(event: Json): void {
    const step = count(event.step);
    if (step === undefined) return;
    const call = isRecord(event.call) ? event.call : undefined;
    if (event.type === "call_started" && call && isRecord(call.action)) {
      if (call.action.type !== "search" && call.action.type !== "open_page") return;
      const counts = this.steps.get(step) ?? { queries: 0, pages: 0 };
      this.steps.set(step, counts);
      this.maxStep = Math.max(this.maxStep, step);
      if (call.action.type === "search") {
        const queries = strings(call.action.queries);
        counts.queries += queries.length;
        addQueries(this.streamed.queries, queries);
        this.pendingSearch.set(callKey(step, call), queries.length);
      } else {
        counts.pages += 1;
        if (typeof call.action.url === "string") this.pendingPage.set(callKey(step, call), call.action.url);
      }
    } else if (event.type === "call_completed" && call) {
      const key = callKey(step, call);
      recordCompletion(this.streamed, call, this.pendingSearch.get(key) ?? 0, this.pendingPage.get(key));
    }
  }

  private currentProgress(): string {
    if (this.summarizing) return "summarizing";
    const counts = this.steps.get(this.maxStep);
    if (!counts) return "";
    if (counts.pages > 0) return `reading ${counts.pages} ${counts.pages === 1 ? "page" : "pages"}`;
    if (counts.queries > 0) return `searching ${counts.queries} ${counts.queries === 1 ? "query" : "queries"}`;
    return "";
  }
}

function emptyCollected(): Collected {
  return { queries: [], lookup: new Map(), failedPages: [], searchQueryCount: 0 };
}

function collectFinal(steps: readonly unknown[]): Collected {
  const collected = emptyCollected();
  for (const step of steps) {
    if (!isRecord(step) || !Array.isArray(step.calls)) continue;
    for (const call of step.calls) {
      if (!isRecord(call) || !isRecord(call.action)) continue;
      if (call.action.type === "search") {
        const queries = strings(call.action.queries);
        addQueries(collected.queries, queries);
        recordCompletion(collected, call, queries.length, undefined);
      } else if (call.action.type === "open_page") {
        recordCompletion(collected, call, 0, typeof call.action.url === "string" ? call.action.url : undefined);
      }
    }
  }
  return collected;
}

function recordCompletion(target: Collected, call: Json, searchQueries: number, pageUrl: string | undefined): void {
  if (call.status === "completed") {
    if (Array.isArray(call.sources)) {
      target.searchQueryCount += searchQueries;
      for (const source of call.sources) if (isRecord(source)) remember(target.lookup, source.url, source.title, source.site_name);
    }
    if (isRecord(call.page)) remember(target.lookup, call.page.url, call.page.title, undefined);
  } else if (call.status === "failed" && pageUrl !== undefined) {
    const code = isRecord(call.error) && typeof call.error.code === "string" && call.error.code ? call.error.code : "unknown";
    target.failedPages.push({ url: decodeUrl(pageUrl), code });
  }
}

function remember(lookup: Map<string, { title?: string; site?: string }>, url: unknown, title: unknown, site: unknown): void {
  if (typeof url !== "string" || !url) return;
  const key = decodeUrl(url);
  const previous = lookup.get(key) ?? {};
  const next = { ...previous };
  if (typeof title === "string" && title && !next.title) next.title = title;
  if (typeof site === "string" && site && !next.site) next.site = site;
  lookup.set(key, next);
}

function parseAnnotations(values: readonly unknown[]): DeepSearchAnnotation[] {
  const out: DeepSearchAnnotation[] = [];
  for (const value of values) {
    if (!isRecord(value) || value.type !== "url_citation" || !isRecord(value.url_citation)) continue;
    const citation = value.url_citation;
    if (typeof citation.url !== "string" || !citation.url) continue;
    if (typeof citation.start_index !== "number" || typeof citation.end_index !== "number") continue;
    out.push({
      url: decodeUrl(citation.url), startIndex: citation.start_index, endIndex: citation.end_index,
      ...(typeof citation.title === "string" && citation.title ? { title: citation.title } : {}),
    });
  }
  return out;
}

function errorChunkFailure(error: unknown): DeepSearchFailure {
  const message = isRecord(error) && typeof error.message === "string" ? error.message : typeof error === "string" ? error : "unknown error";
  if (/Content Exists Risk/i.test(message)) return { code: "DEEPSEEK_CONTENT_RISK", message: "DeepSeek rejected the question under its content safety policy.", retryable: false };
  return { code: "DEEP_SEARCH_FAILED", message: `DeepSeek deep search failed: ${upstreamMessage(message)}`, retryable: false };
}

function fail(code: string, message: string, retryable: boolean): DeepSearchStreamResult {
  return { ok: false, failure: { code, message, retryable } };
}

/** DeepSeek sometimes HTML-escapes `&` in URLs, the same way in citations and sources. */
function decodeUrl(url: string): string {
  return url.replaceAll("&amp;", "&");
}

function addQueries(target: string[], queries: readonly string[]): void {
  for (const query of queries) if (!target.includes(query)) target.push(query);
}

function callKey(step: number, call: Json): string {
  return typeof call.id === "string" && call.id ? call.id : `${step}:${String(call.index)}`;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
