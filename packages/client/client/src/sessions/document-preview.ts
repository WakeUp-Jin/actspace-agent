import type { DocumentReadInfo, ToolUiPreview } from "@actspace/shared";
import { documentFailureText } from "./tool-failure-text.js";

/** `<name> · 2 pages`, `<name> · 1 page`, `<name> · pages 31-45`, `<name> · pages 7`; the name may itself contain ` · `. */
const SUMMARY = /^(.+) · (\d+ pages?|pages \d+(?:-\d+)?)$/;
const PAGE_MARKER = /^--- Page \d+ ---$/;
const MAX_PREVIEW_LINES = 8;
const MAX_LINE_CHARS = 240;
const MAX_NAME = 255;
const MAX_LISTED_WARNING_PAGES = 5;

type ReadPreview = Extract<ToolUiPreview, { kind: "read" }>;

/**
 * The `read_document` row (agent-deep-search-and-document-parsing.md §9.2): a `read` preview with `document`. A deferred
 * history row has no args, detail or output, only the summary, so its name and stats come from the summary.
 */
export function documentPreview(input: {
  readonly path?: string;
  readonly displayPath: (path: string) => string;
  readonly phase: "streaming" | "prepared" | "running" | "finished";
  readonly state?: string;
  readonly summary: string;
  readonly progress?: string;
  readonly output: string;
  readonly detail: unknown;
  readonly failureCode?: string;
  readonly failureMessage?: string;
}): ReadPreview {
  const finished = input.phase === "finished";
  const completed = finished && (input.state === undefined || input.state === "completed");
  const match = completed ? SUMMARY.exec(input.summary) : null;
  const detail = isRecord(input.detail) ? input.detail : undefined;
  const name = lastSegment(input.path)
    ?? match?.[1]
    ?? nonEmpty(detail?.fileName)
    ?? (input.phase === "running" ? nonEmpty(input.progress) : undefined)
    ?? "attachment";
  const document: DocumentReadInfo = { name };
  if (match?.[2]) document.stats = match[2];
  const preview: ReadPreview = {
    kind: "read",
    filePath: input.path ? input.displayPath(input.path) : "",
    displayText: finished ? input.summary : `Read ${name}`,
    document,
  };
  if (!finished) return preview;
  if (completed) {
    const lines = pageLines(input.output);
    if (lines) preview.resultPreview = lines;
    const warning = incompleteWarning(detail);
    if (warning) document.warning = warning;
    return preview;
  }
  if (input.state !== "aborted") document.errorText = documentFailureText(input.failureCode, input.failureMessage);
  return preview;
}

/** The port's own cut: last segment of either separator style, control characters replaced, at most 255 characters. */
function lastSegment(path: string | undefined): string | undefined {
  const segment = (path ?? "").split(/[/\\]/).filter(part => part !== "").at(-1) ?? "";
  // eslint-disable-next-line no-control-regex
  const clean = Array.from(segment.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")).slice(0, MAX_NAME).join("");
  return clean.trim() ? clean : undefined;
}

/** Page text only: everything before the first page marker (the header lines) and the markers themselves are dropped. */
function pageLines(output: string): string[] | undefined {
  const all = output.split("\n");
  const first = all.findIndex(line => PAGE_MARKER.test(line.trim()));
  if (first < 0) return undefined;
  const lines = all.slice(first)
    .map(line => line.trim())
    .filter(line => line && !PAGE_MARKER.test(line))
    .slice(0, MAX_PREVIEW_LINES)
    .map(line => line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS - 3)}…` : line);
  return lines.length ? lines : undefined;
}

function incompleteWarning(detail: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const count = typeof detail?.incompletePageCount === "number" ? detail.incompletePageCount : 0;
  if (count <= 0) return undefined;
  const pages = Array.isArray(detail?.incompletePages) ? detail.incompletePages.filter((page): page is number => typeof page === "number") : [];
  if (count <= MAX_LISTED_WARNING_PAGES && pages.length === count) return `第 ${pages.join("、")} 页识别不完整，内容已截断。`;
  return `有 ${count} 页识别不完整，内容已截断。`;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
