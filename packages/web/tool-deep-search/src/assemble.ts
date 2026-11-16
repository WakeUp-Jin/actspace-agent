import type { ToolBodyResult } from "@actspace/tool-runtime";

export type DeepSearchSource = { readonly title: string; readonly url: string; readonly site?: string };
export type DeepSearchAnnotation = { readonly url: string; readonly title?: string; readonly startIndex: number; readonly endIndex: number };
export type DeepSearchOutcome = {
  /** The key-point findings as DeepSeek wrote them; annotation indexes count code points of this string. */
  readonly content: string;
  readonly annotations: readonly DeepSearchAnnotation[];
  readonly queries: readonly string[];
  readonly lookup: ReadonlyMap<string, { readonly title?: string; readonly site?: string }>;
  readonly failedPages: readonly { readonly url: string; readonly code: string }[];
  readonly billed: { readonly searches?: number; readonly fetches?: number };
  /** Queries of search calls that returned; the search count when DeepSeek reports no billing. */
  readonly searchQueryCount: number;
  readonly finishReason: "stop" | "length";
};

export const DEEP_SEARCH_DETAIL_LABEL = "deep-search";
export const LIMITS = Object.freeze({ findings: 20_000, queries: 50, queryChars: 200, sources: 50, titleChars: 200, urlChars: 2_000, siteChars: 100, failedPages: 20 });

/** Turns a finished stream into the text the main model reads, the row summary, and the detail the UI expands. */
export function assembleDeepSearchResult(outcome: DeepSearchOutcome): ToolBodyResult {
  const content = Array.from(outcome.content);
  const citations = outcome.annotations.filter(item => isWebUrl(item.url));
  const inRange = (item: DeepSearchAnnotation) => Number.isInteger(item.endIndex) && item.endIndex >= 0 && item.endIndex <= content.length;
  // Numbers follow the first citation in reading order; citations that point outside the text come last.
  const ordered = [...citations.filter(inRange).sort((a, b) => a.endIndex - b.endIndex), ...citations.filter(item => !inRange(item))];
  const numbers = new Map<string, number>();
  const sources: DeepSearchSource[] = [];
  for (const item of ordered) {
    if (numbers.has(item.url)) continue;
    numbers.set(item.url, numbers.size + 1);
    const found = outcome.lookup.get(item.url);
    const title = clip(found?.title || item.title || item.url, LIMITS.titleChars);
    const site = found?.site ? clip(found.site, LIMITS.siteChars) : undefined;
    sources.push({ title, url: item.url, ...(site ? { site } : {}) });
  }
  const markers = new Map<number, Set<number>>();
  for (const item of citations.filter(inRange)) {
    const set = markers.get(item.endIndex) ?? new Set<number>();
    set.add(numbers.get(item.url)!);
    markers.set(item.endIndex, set);
  }
  for (const [index, set] of [...markers].sort((a, b) => b[0] - a[0])) {
    content.splice(index, 0, [...set].sort((a, b) => a - b).map(number => `[${number}]`).join(""));
  }
  let findings = content.join("").trim();
  if (Array.from(findings).length > LIMITS.findings) findings = `${clip(findings, LIMITS.findings)}\n\n[Findings truncated at 20,000 characters.]`;

  const searches = outcome.billed.searches ?? outcome.searchQueryCount;
  const failedPages = outcome.failedPages.filter(item => isWebUrl(item.url));
  const sections = [findings];
  if (outcome.finishReason === "length") sections.push("[The findings were cut off at DeepSeek's length limit.]");
  if (sources.length) sections.push(`Sources:\n${sources.map((item, index) => `[${index + 1}] ${item.title === item.url ? item.url : `${item.title} — ${item.url}`}`).join("\n")}`);
  else if (searches === 0 && outcome.queries.length === 0) sections.push("No web search was performed; these findings have no sources.");
  else sections.push("No sources were cited.");
  if (failedPages.length) sections.push(`Pages that could not be opened:\n${failedPages.map(item => `- ${item.url} (${item.code})`).join("\n")}`);

  return {
    status: "completed",
    summary: `${plural(searches, "search", "searches")} · ${plural(sources.length, "source", "sources")}`,
    modelOutput: [{ type: "text", text: sections.join("\n\n") }],
    detail: [{
      label: DEEP_SEARCH_DETAIL_LABEL,
      value: {
        queries: outcome.queries.slice(0, LIMITS.queries).map(query => clip(query, LIMITS.queryChars)),
        sources: sources.slice(0, LIMITS.sources).map(item => ({ ...item, url: clip(item.url, LIMITS.urlChars) })),
        failedPages: failedPages.slice(0, LIMITS.failedPages).map(item => ({ url: clip(item.url, LIMITS.urlChars), code: clip(item.code, LIMITS.queryChars) })),
        billed: { searches, fetches: outcome.billed.fetches ?? 0 },
      },
    }],
  };
}

export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return Array.from(value).slice(0, max).join("");
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
