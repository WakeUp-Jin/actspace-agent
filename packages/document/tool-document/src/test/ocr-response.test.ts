import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOcrResponse, splitPage, type DocumentLoadResult, type ParsedDocument } from "../ocr-response.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8");
const body = (pages: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ object: "ocr.result", page_count: pages.length, pages, ...extra });
const errorBody = (message: string) => JSON.stringify({ error: { message, type: "invalid_request_error" } });
const ok = (result: DocumentLoadResult): ParsedDocument => {
  if (!result.ok) throw new Error(`expected ok, got ${result.failure.code}`);
  return result.document;
};
const code = (result: DocumentLoadResult) => result.ok ? "ok" : result.failure.code;

describe("parseOcrResponse pages", () => {
  it("replays recorded responses", () => {
    expect(ok(parseOcrResponse(200, fixture("short-docx"))).pages).toHaveLength(1);
    const pptx = ok(parseOcrResponse(200, fixture("with-image-pptx")));
    expect(pptx.pages).toHaveLength(2);
    expect(pptx.pages[0]).toContain("## Slide with picture");
    const scan = ok(parseOcrResponse(200, fixture("scan-text")));
    expect(scan).toMatchObject({ incomplete: [], split: false });
    expect(scan.chars).toBe(scan.pages.reduce((sum, page) => sum + page.length, 0));
  });

  it("accepts leading newlines", () => {
    expect(ok(parseOcrResponse(200, `\n\n\n${body([{ index: 0, text: "a", finish_reason: "stop" }])}`)).pages).toEqual(["a"]);
  });

  it("sorts by index, but keeps array order when indexes are duplicated or missing", () => {
    expect(ok(parseOcrResponse(200, body([{ index: 2, text: "c" }, { index: 0, text: "a" }, { index: 1, text: "b" }]))).pages).toEqual(["a", "b", "c"]);
    expect(ok(parseOcrResponse(200, body([{ index: 1, text: "x" }, { index: 1, text: "y" }, { index: 0, text: "z" }]))).pages).toEqual(["x", "y", "z"]);
    expect(ok(parseOcrResponse(200, body([{ index: 1, text: "x" }, { text: "y" }, { index: 0, text: "z" }]))).pages).toEqual(["x", "y", "z"]);
  });

  it("treats non-string text as empty and counts pages, not page_count", () => {
    const parsed = ok(parseOcrResponse(200, body([{ index: 0, text: null }, { index: 1, text: 42 }, { index: 2, text: "ok" }], { page_count: 9 })));
    expect(parsed.pages).toEqual(["", "", "ok"]);
  });

  it("strips box and ref markers, across lines and repeated, leaving other angle brackets", () => {
    const text = "<｜ref｜>text<｜/ref｜><｜box｜>[[1,2,\n3,4]]<｜/box｜> First\n<｜ref｜>title<｜/ref｜><｜box｜>[[5,6,7,8]]<｜/box｜> Second <b>bold</b> a < b";
    expect(ok(parseOcrResponse(200, body([{ index: 0, text }]))).pages[0]).toBe("First\nSecond <b>bold</b> a < b");
  });

  it("marks length pages as incomplete with 1-based page numbers", () => {
    const parsed = ok(parseOcrResponse(200, body([{ index: 0, text: "a", finish_reason: "stop" }, { index: 1, text: "b", finish_reason: "length" }, { index: 2, text: "c", finish_reason: "other" }])));
    expect(parsed.incomplete).toEqual([2]);
  });
});

describe("splitting long pages", () => {
  const line = (n: number) => `${"x".repeat(n - 1)}\n`;

  it("splits a 120,000-character page into 3 and keeps the incomplete mark on the last part", () => {
    const text = line(40_000).repeat(3);
    const parsed = ok(parseOcrResponse(200, body([{ index: 0, text, finish_reason: "length" }, { index: 1, text: "tail" }])));
    expect(parsed.pages.slice(0, 3).map(page => page.length)).toEqual([40_000, 40_000, 40_000]);
    expect(parsed.pages.slice(0, 3).join("")).toBe(text);
    expect(parsed).toMatchObject({ incomplete: [3], split: true });
    expect(parsed.pages[3]).toBe("tail");
  });

  it("does not split exactly 50,000 characters", () => {
    const parsed = ok(parseOcrResponse(200, body([{ index: 0, text: "y".repeat(50_000) }])));
    expect(parsed).toMatchObject({ split: false });
    expect(parsed.pages).toHaveLength(1);
  });

  it("hard-cuts a single 70,000-character line", () => {
    const text = "z".repeat(70_000);
    const parts = splitPage(text);
    expect(parts.map(part => part.length)).toEqual([50_000, 20_000]);
    expect(parts.join("")).toBe(text);
  });

  it("moves the cut back one when it would split a surrogate pair", () => {
    const text = `${"a".repeat(49_999)}😀${"b".repeat(10)}`;
    const parts = splitPage(text);
    expect(parts[0]).toHaveLength(49_999);
    expect(parts[1]!.startsWith("😀")).toBe(true);
    expect(parts.join("")).toBe(text);
  });
});

describe("parseOcrResponse failures", () => {
  it.each([
    [401, '{"error":{"message":"Authentication Fails, Your api key is invalid"}}', "DEEPSEEK_AUTH_FAILED", false],
    [402, '{"error":{"message":"Insufficient Balance"}}', "DEEPSEEK_INSUFFICIENT_BALANCE", false],
    [429, '{"error":{"message":"Rate limit reached"}}', "DEEPSEEK_RATE_LIMITED", true],
    [413, "", "DOCUMENT_TOO_LARGE", false],
    [408, "", "DOCUMENT_TIMEOUT", true],
    [504, "<html>gateway</html>", "DOCUMENT_TIMEOUT", true],
    [500, "oops", "DOCUMENT_FAILED", true],
    [503, '{"error":{"message":"Service is temporarily unavailable"}}', "DOCUMENT_FAILED", true],
    [418, "teapot", "DOCUMENT_FAILED", false],
  ])("HTTP %i maps to the failure table", (status, text, failureCode, retryable) => {
    const result = parseOcrResponse(status, text);
    expect(result).toMatchObject({ ok: false, failure: { code: failureCode, retryable } });
  });

  it.each([
    ["The file is password-protected and cannot be processed.", "DOCUMENT_PASSWORD_PROTECTED", false],
    ["Failed to recognize the file: the document has more than 1000 pages", "DOCUMENT_TOO_MANY_PAGES", false],
    ["The file is too large", "DOCUMENT_TOO_LARGE", false],
    ["Recognition did not finish within 180 seconds", "DOCUMENT_TIMEOUT", false],
    ["Failed to recognize the file: the file format is not supported", "DOCUMENT_PARSE_FAILED", false],
    ["Service is TEMPORARILY UNAVAILABLE", "DOCUMENT_FAILED", true],
    ["Internal Server Error", "DOCUMENT_FAILED", true],
    ["Something new", "DOCUMENT_FAILED", false],
  ])("error message %j maps the same way at 200 and 400", (message, failureCode, retryable) => {
    for (const status of [200, 400]) {
      expect(parseOcrResponse(status, errorBody(message))).toMatchObject({ ok: false, failure: { code: failureCode, retryable } });
    }
  });

  it("replays the recorded error fixtures", () => {
    expect(code(parseOcrResponse(200, fixture("password-pdf")))).toBe("DOCUMENT_PASSWORD_PROTECTED");
    expect(code(parseOcrResponse(200, fixture("xlsx-renamed")))).toBe("DOCUMENT_PARSE_FAILED");
  });

  it("fails on empty pages, missing pages and non-JSON at 2xx", () => {
    expect(parseOcrResponse(200, body([]))).toMatchObject({ ok: false, failure: { code: "DOCUMENT_PARSE_FAILED", retryable: false } });
    expect(parseOcrResponse(200, '{"object":"ocr.result"}')).toMatchObject({ ok: false, failure: { code: "DOCUMENT_FAILED", retryable: false } });
    expect(parseOcrResponse(200, "not json")).toMatchObject({ ok: false, failure: { code: "DOCUMENT_FAILED", retryable: false } });
  });

  it("clips long upstream messages to 500 characters and redacts credentials", () => {
    const long = `Failed to recognize the file: ${"q".repeat(900)}`;
    const failure = parseOcrResponse(400, errorBody(long));
    expect(failure.ok).toBe(false);
    if (failure.ok) return;
    expect(failure.failure.message).toContain(`${"q".repeat(470)}…`);
    expect(failure.failure.message).not.toContain("q".repeat(500));
    const secret = parseOcrResponse(400, errorBody("Something wrong with Bearer fixture-ds-secret and sk-abcdefghijk"));
    if (secret.ok) throw new Error("expected failure");
    expect(secret.failure.message).not.toContain("fixture-ds-secret");
    expect(secret.failure.message).not.toContain("sk-abcdefghijk");
    expect(secret.failure.message).toContain("[REDACTED]");
  });
});
