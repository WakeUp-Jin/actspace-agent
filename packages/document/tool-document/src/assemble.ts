import type { ToolBodyResult } from "@actspace/tool-runtime";
import { MAX_PAGE_CHARS, type DocumentFailure, type ParsedDocument } from "./ocr-response.js";

export type PageRange = { readonly from: number; readonly to: number };

const PAGES_ARG = /^([1-9][0-9]{0,3})(?:-([1-9][0-9]{0,3}))?$/;
const MAX_NAME = 255;
const MAX_LISTED_INCOMPLETE = 50;
const MAX_DETAIL_INCOMPLETE = 20;

/** Undefined when `pages` was not given; "invalid" when malformed or the start is after the end. */
export function parsePagesArg(value: unknown): PageRange | "invalid" | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return "invalid";
  const match = PAGES_ARG.exec(value);
  if (!match) return "invalid";
  const from = Number(match[1]);
  const to = match[2] === undefined ? from : Number(match[2]);
  return from > to ? "invalid" : { from, to };
}

/** Last path segment (either separator), control characters as spaces, at most 255 characters, else `attachment`. */
export function displayName(value: string | undefined): string {
  const trimmed = (value ?? "").replace(/[/\\]+$/, "");
  const segment = trimmed.split(/[/\\]/).at(-1) ?? "";
  // eslint-disable-next-line no-control-regex
  const clean = Array.from(segment.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")).slice(0, MAX_NAME).join("");
  return clean.trim() ? clean : "attachment";
}

export function readPages(input: { readonly document: ParsedDocument; readonly fileName: string; readonly pages?: PageRange }): ToolBodyResult {
  const { document, fileName, pages } = input;
  const total = document.pages.length;
  const from = pages?.from ?? 1;
  if (from > total) {
    return failedResult({ code: "DOCUMENT_PAGES_OUT_OF_RANGE", message: `The document has ${total} ${total === 1 ? "page" : "pages"}.`, retryable: false }, fileName);
  }
  const last = Math.min(pages?.to ?? total, total);
  let to = from;
  let used = document.pages[from - 1]!.length;
  while (to < last && used + document.pages[to]!.length <= MAX_PAGE_CHARS) { used += document.pages[to]!.length; to += 1; }

  const inRange = pages ? document.incomplete.filter(page => page >= from && page <= last) : document.incomplete;
  const lines = [`Document: ${fileName} (${pageCount(total)})`];
  if (from !== 1 || to !== total) {
    const showing = from === to ? `Showing page ${from} of ${total}.` : `Showing pages ${from}-${to} of ${total}.`;
    lines.push(to < total ? `${showing} To continue, call read_document again with pages "${to + 1}-${total}".` : showing);
  }
  if (inRange.length > 0) {
    const listed = inRange.slice(0, MAX_LISTED_INCOMPLETE).join(", ");
    const more = inRange.length > MAX_LISTED_INCOMPLETE ? ` and ${inRange.length - MAX_LISTED_INCOMPLETE} more` : "";
    lines.push(`Pages recognized incompletely: ${listed}${more}.`);
  }
  if (document.split) lines.push("Long pages were split; page numbers here are positions in this output, not the document's own page numbers.");
  const body: string[] = [];
  for (let page = from; page <= to; page += 1) {
    const text = document.pages[page - 1]!;
    body.push(`--- Page ${page} ---\n${text.trim() ? text : "(no text on this page)"}`);
  }
  const text = `${lines.join("\n")}\n\n${body.join("\n\n")}`;
  const summary = pages ? `${fileName} · ${from === to ? `pages ${from}` : `pages ${from}-${to}`}` : `${fileName} · ${pageCount(total)}`;
  return {
    status: "completed",
    modelOutput: [{ type: "text", text }],
    summary,
    detail: [{ label: "document", value: { fileName, pageCount: total, range: { from, to }, incompletePages: inRange.slice(0, MAX_DETAIL_INCOMPLETE), incompletePageCount: inRange.length } }],
  };
}

/** A port failure. The summary is the file name once it is known, otherwise the message. */
export function failedResult(failure: DocumentFailure, fileName?: string): ToolBodyResult {
  return {
    status: "failed",
    modelOutput: [{ type: "text", text: failure.message }],
    summary: fileName ?? failure.message,
    failure,
    ...(fileName === undefined ? {} : { detail: [{ label: "document", value: { fileName } }] }),
  };
}

function pageCount(total: number): string {
  return total === 1 ? "1 page" : `${total} pages`;
}
