import type { DeepSearchPreviewFields } from "@actspace/shared";
import type { RuntimeJsonValue, RuntimeToolView } from "@actspace/shared/runtime-v2";
import { deepSearchFailureText } from "./tool-failure-text.js";

type EventRecord = Readonly<Record<string, RuntimeJsonValue>>;
const PROGRESS = /^(?:searching \d+ quer(?:y|ies)|reading \d+ pages?|summarizing)$/;
const STATS = /^\d+ search(?:es)? · \d+ sources?$/;
const MAX_QUESTION_DISPLAY = 240;
const LIMITS = { queries: 50, queryChars: 200, sources: 50, titleChars: 200, urlChars: 2_000, siteChars: 100, failedPages: 20 } as const;

/**
 * The `deep_search` row (agent-deep-search-and-document-parsing.md §9.1). Lists come only from the `deep-search` detail
 * block, validated item by item; a deferred history row has no detail and keeps the question and stats it can recover.
 */
export function deepSearchPreview(input: {
  readonly tool: RuntimeToolView | undefined;
  readonly data: EventRecord;
  readonly args: EventRecord;
  readonly phase: "streaming" | "prepared" | "running" | "finished";
}): DeepSearchPreviewFields {
  const { tool, data, args, phase } = input;
  const question = text(args.question) ?? tool?.argsSummary?.fields.find(field => field.name === "question" && !field.redacted)?.value ?? "";
  const head = question ? `Deep Search ${clip(question, MAX_QUESTION_DISPLAY, "…")}` : "Deep Search";
  if (phase !== "finished") {
    const progress = phase === "running" ? text(data.summary) : null;
    return { kind: "deep_search", question, displayText: progress && PROGRESS.test(progress) ? `${head} · ${progress}` : head };
  }
  const state = text(data.status) ?? tool?.state;
  const failure = isRecord(data.failure) ? data.failure : undefined;
  const row: DeepSearchPreviewFields = { kind: "deep_search", question, displayText: head };
  if (state === "aborted") return row;
  if (state !== undefined && state !== "completed") {
    row.errorText = deepSearchFailureText(text(failure?.code) ?? tool?.failure?.code, text(failure?.message) ?? tool?.failure?.message);
    return row;
  }
  const summary = tool?.summary ?? text(data.summary);
  if (summary && STATS.test(summary)) row.stats = summary;
  const detail = detailValue(data, "deep-search");
  if (!isRecord(detail)) return row;
  if (Array.isArray(detail.queries)) row.queries = detail.queries.flatMap(item => typeof item === "string" && item ? [clip(item, LIMITS.queryChars)] : []).slice(0, LIMITS.queries);
  if (Array.isArray(detail.sources)) {
    row.sources = detail.sources.flatMap((item) => {
      if (!isRecord(item)) return [];
      const url = webUrl(item.url);
      if (!url) return [];
      const site = text(item.site);
      return [{ title: clip(text(item.title) ?? url, LIMITS.titleChars), url, ...(site ? { site: clip(site, LIMITS.siteChars) } : {}) }];
    }).slice(0, LIMITS.sources);
  }
  if (Array.isArray(detail.failedPages)) {
    row.failedPages = detail.failedPages.flatMap((item) => {
      if (!isRecord(item)) return [];
      const url = webUrl(item.url);
      return url ? [{ url, code: clip(text(item.code) ?? "unknown", LIMITS.queryChars) }] : [];
    }).slice(0, LIMITS.failedPages);
  }
  return row;
}

function webUrl(value: RuntimeJsonValue | undefined): string | null {
  const raw = text(value);
  if (!raw || raw.length > LIMITS.urlChars) return null;
  try {
    const { protocol } = new URL(raw);
    return protocol === "http:" || protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

function clip(value: string, max: number, suffix = ""): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max).join("")}${suffix}`;
}

function detailValue(data: EventRecord, label: string): RuntimeJsonValue | undefined {
  if (!Array.isArray(data.detail)) return undefined;
  for (const entry of data.detail) if (isRecord(entry) && entry.label === label) return entry.value;
  return undefined;
}

function isRecord(value: RuntimeJsonValue | undefined): value is EventRecord {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: RuntimeJsonValue | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
