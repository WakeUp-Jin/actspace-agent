/**
 * Turns a DeepSeek OCR response into cached pages or a failure (agent-deep-search-and-document-parsing.md §8.3, §8.4).
 * Pure: no network, no file system.
 */

export type ParsedDocument = { readonly pages: readonly string[]; readonly incomplete: readonly number[]; readonly split: boolean; readonly chars: number };
export type DocumentFailure = { readonly code: string; readonly message: string; readonly retryable: boolean };
export type DocumentLoadResult = { readonly ok: true; readonly document: ParsedDocument } | { readonly ok: false; readonly failure: DocumentFailure };

export const MAX_PAGE_CHARS = 50_000;
const MAX_UPSTREAM_MESSAGE = 500;
const BOX = /<｜box｜>[\s\S]*?<｜\/box｜> ?/g;
const REF = /<｜ref｜>[\s\S]*?<｜\/ref｜> ?/g;

export function documentFailure(code: string, message: string, retryable = false): DocumentFailure {
  return { code, message: redact(message), retryable };
}

/** Strips credentials the same way tool-web's safeError does. */
export function redact(text: string): string {
  return text
    .replace(/(Bearer|x-api-key|api[_-]?key)([\s:=]+)[^\s,;"']+/gi, "$1$2[REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]");
}

export function parseOcrResponse(status: number, bodyText: string): DocumentLoadResult {
  let body: unknown;
  try { body = JSON.parse(bodyText); } catch { body = undefined; }
  const upstream = errorMessage(body);
  const failure = classify(status, upstream, body);
  if (failure) return { ok: false, failure };
  return { ok: true, document: normalizePages((body as { pages: unknown[] }).pages) };
}

function classify(status: number, upstream: string | undefined, body: unknown): DocumentFailure | undefined {
  const lower = upstream?.toLowerCase() ?? "";
  const quoted = upstream === undefined ? "" : `: ${clip(upstream)}`;
  if (status === 401) return documentFailure("DEEPSEEK_AUTH_FAILED", `DeepSeek rejected the API key (HTTP 401)${quoted}. Ask the user to check the DeepSeek key in settings.`);
  if (status === 402) return documentFailure("DEEPSEEK_INSUFFICIENT_BALANCE", "The DeepSeek account has insufficient balance, so the document was not parsed. Tell the user, or read the file locally with a script.");
  if (status === 429) return documentFailure("DEEPSEEK_RATE_LIMITED", `DeepSeek rate limited the request (HTTP 429)${quoted}. Try again later.`, true);
  if (upstream !== undefined) {
    if (lower.includes("password-protected")) return documentFailure("DOCUMENT_PASSWORD_PROTECTED", "The document is password-protected and cannot be parsed. Ask the user to remove the password.");
    if (lower.includes("more than 1000 pages")) return documentFailure("DOCUMENT_TOO_MANY_PAGES", "The document has more than 1,000 pages, which DeepSeek does not accept. Read it locally with a script, or ask the user to split it.");
  }
  if (lower.includes("too large") || status === 413) return documentFailure("DOCUMENT_TOO_LARGE", "The document is larger than DeepSeek accepts (100 MB). Read it locally with a script.");
  if (upstream !== undefined) {
    if (lower.includes("did not finish")) return documentFailure("DOCUMENT_TIMEOUT", `DeepSeek did not finish parsing the document within 180 seconds${quoted}. Read it locally with a script instead.`);
    if (lower.startsWith("failed to recognize the file")) return documentFailure("DOCUMENT_PARSE_FAILED", `DeepSeek could not parse the file${quoted}. Read it locally with a script instead.`);
  }
  if (status === 408 || status === 504) return documentFailure("DOCUMENT_TIMEOUT", `Uploading the document to DeepSeek timed out (HTTP ${status}). Try again.`, true);
  const pages = pagesOf(body);
  if (status >= 200 && status < 300 && upstream === undefined && pages !== undefined) {
    if (pages.length === 0) return documentFailure("DOCUMENT_PARSE_FAILED", "DeepSeek returned no pages for this file. Read it locally with a script instead.");
    return undefined;
  }
  if (lower.includes("temporarily unavailable") || lower === "internal server error" || status >= 500) {
    return documentFailure("DOCUMENT_FAILED", `DeepSeek document parsing failed (HTTP ${status})${quoted}. Try again.`, true);
  }
  const reason = upstream !== undefined ? quoted : status >= 200 && status < 300 ? ": the response had no pages" : "";
  return documentFailure("DOCUMENT_FAILED", `DeepSeek document parsing failed (HTTP ${status})${reason}.`);
}

function errorMessage(body: unknown): string | undefined {
  if (!isRecord(body) || !isRecord(body.error)) return undefined;
  return typeof body.error.message === "string" ? body.error.message : undefined;
}

function pagesOf(body: unknown): unknown[] | undefined {
  return isRecord(body) && Array.isArray(body.pages) ? body.pages : undefined;
}

function normalizePages(raw: readonly unknown[]): ParsedDocument {
  const records = raw.map(item => isRecord(item) ? item : {});
  const indexes = records.map(item => item.index);
  const sortable = indexes.every(value => Number.isInteger(value)) && new Set(indexes).size === indexes.length;
  const ordered = sortable ? [...records].sort((a, b) => (a.index as number) - (b.index as number)) : records;
  const pages: string[] = [];
  const incomplete: number[] = [];
  let split = false;
  let chars = 0;
  for (const item of ordered) {
    const text = typeof item.text === "string" ? item.text.replace(BOX, "").replace(REF, "") : "";
    const parts = text.length > MAX_PAGE_CHARS ? splitPage(text) : [text];
    if (parts.length > 1) split = true;
    for (const part of parts) { pages.push(part); chars += part.length; }
    if (item.finish_reason === "length") incomplete.push(pages.length);
  }
  return { pages, incomplete, split, chars };
}

/** Greedy by lines; a single over-long line is cut at the limit without splitting a surrogate pair. */
export function splitPage(text: string, limit = MAX_PAGE_CHARS): string[] {
  const lines = text.split(/(?<=\n)/);
  const parts: string[] = [];
  let current = "";
  for (let line of lines) {
    if (current.length + line.length <= limit) { current += line; continue; }
    if (current) { parts.push(current); current = ""; }
    while (line.length > limit) {
      let cut = limit;
      const code = line.charCodeAt(cut - 1);
      if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
      parts.push(line.slice(0, cut));
      line = line.slice(cut);
    }
    current = line;
  }
  if (current || parts.length === 0) parts.push(current);
  return parts;
}

function clip(text: string): string {
  return text.length > MAX_UPSTREAM_MESSAGE ? `${text.slice(0, MAX_UPSTREAM_MESSAGE)}…` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
