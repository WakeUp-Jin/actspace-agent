import { describe, expect, it } from "vitest";
import { displayName, failedResult, parsePagesArg, readPages } from "../assemble.js";
import type { ParsedDocument } from "../ocr-response.js";

const doc = (pages: string[], extra: Partial<ParsedDocument> = {}): ParsedDocument => ({ pages, incomplete: [], split: false, chars: pages.join("").length, ...extra });
const textOf = (result: ReturnType<typeof readPages>) => (result.modelOutput[0] as { text: string }).text;
const pagesOf = (count: number, size = 10) => Array.from({ length: count }, (_, index) => `p${index + 1}`.padEnd(size, "."));
const detailOf = (result: ReturnType<typeof readPages>) => result.detail?.find(entry => entry.label === "document")?.value as Record<string, unknown>;

describe("parsePagesArg", () => {
  it("parses single pages and ranges", () => {
    expect(parsePagesArg("7")).toEqual({ from: 7, to: 7 });
    expect(parsePagesArg("31-45")).toEqual({ from: 31, to: 45 });
    expect(parsePagesArg(undefined)).toBeUndefined();
  });

  it("rejects reversed, zero, non-numeric and non-string values", () => {
    for (const value of ["45-31", "0", "a-b", 7, "", "1-", "1-2-3"]) expect(parsePagesArg(value)).toBe("invalid");
  });
});

describe("displayName", () => {
  it("takes the last segment of either separator style", () => {
    expect(displayName("/Users/x/Docs/报告.pdf")).toBe("报告.pdf");
    expect(displayName("C:\\Users\\x\\deck.pptx")).toBe("deck.pptx");
    expect(displayName("docs/folder/")).toBe("folder");
  });

  it("replaces control characters, clips to 255 and falls back to attachment", () => {
    expect(displayName("a\u0000b\nc.pdf")).toBe("a b c.pdf");
    expect(displayName(`${"n".repeat(300)}.pdf`)).toHaveLength(255);
    expect(displayName("")).toBe("attachment");
    expect(displayName(undefined)).toBe("attachment");
    expect(displayName("/")).toBe("attachment");
  });
});

describe("readPages", () => {
  it("returns the whole document without a second line when it fits", () => {
    const result = readPages({ document: doc(["one", "two"]), fileName: "r.pdf" });
    expect(textOf(result)).toBe("Document: r.pdf (2 pages)\n\n--- Page 1 ---\none\n\n--- Page 2 ---\ntwo");
    expect(result).toMatchObject({ status: "completed", summary: "r.pdf · 2 pages" });
    expect(detailOf(result)).toEqual({ fileName: "r.pdf", pageCount: 2, range: { from: 1, to: 2 }, incompletePages: [], incompletePageCount: 0 });
  });

  it("writes 1 page for a single-page document", () => {
    const result = readPages({ document: doc(["only"]), fileName: "a.docx" });
    expect(textOf(result).split("\n")[0]).toBe("Document: a.docx (1 page)");
    expect(result.summary).toBe("a.docx · 1 page");
  });

  it("stops at 50,000 characters of page text and says how to continue", () => {
    const result = readPages({ document: doc(pagesOf(10, 20_000)), fileName: "big.pdf" });
    const text = textOf(result);
    expect(text.split("\n")[1]).toBe('Showing pages 1-2 of 10. To continue, call read_document again with pages "3-10".');
    expect(result.summary).toBe("big.pdf · 10 pages");
    expect(detailOf(result).range).toEqual({ from: 1, to: 2 });
    const bodies = text.split(/--- Page \d+ ---\n/).slice(1).join("");
    expect(bodies.replace(/\n\n$/g, "").length).toBeLessThanOrEqual(50_002);
  });

  it("returns at least one page even when one page is 50,000 characters", () => {
    const result = readPages({ document: doc(["x".repeat(50_000), "y"]), fileName: "a.pdf" });
    expect(textOf(result)).toContain('Showing page 1 of 2. To continue, call read_document again with pages "2-2".');
  });

  it("summarizes the returned range when pages is given", () => {
    const document = doc(pagesOf(124));
    expect(readPages({ document, fileName: "d.pdf", pages: { from: 31, to: 45 } }).summary).toBe("d.pdf · pages 31-45");
    const single = readPages({ document, fileName: "d.pdf", pages: { from: 7, to: 7 } });
    expect(single.summary).toBe("d.pdf · pages 7");
    expect(textOf(single).split("\n")[1]).toBe('Showing page 7 of 124. To continue, call read_document again with pages "8-124".');
  });

  it("clamps the end to N and drops the continue half at the end", () => {
    const result = readPages({ document: doc(pagesOf(5)), fileName: "d.pdf", pages: { from: 4, to: 99 } });
    expect(textOf(result).split("\n")[1]).toBe("Showing pages 4-5 of 5.");
    expect(result.summary).toBe("d.pdf · pages 4-5");
  });

  it("fails when the start is past the last page", () => {
    const result = readPages({ document: doc(pagesOf(5)), fileName: "d.pdf", pages: { from: 6, to: 8 } });
    expect(result).toMatchObject({ status: "failed", summary: "d.pdf", failure: { code: "DOCUMENT_PAGES_OUT_OF_RANGE", message: "The document has 5 pages.", retryable: false } });
  });

  it("lists incomplete pages for the whole document or only the requested range", () => {
    const document = doc(pagesOf(30), { incomplete: [3, 13, 27] });
    expect(textOf(readPages({ document, fileName: "d.pdf" }))).toContain("Pages recognized incompletely: 3, 13, 27.");
    const ranged = readPages({ document, fileName: "d.pdf", pages: { from: 10, to: 20 } });
    expect(textOf(ranged)).toContain("Pages recognized incompletely: 13.");
    expect(detailOf(ranged)).toMatchObject({ incompletePages: [13], incompletePageCount: 1 });
  });

  it("caps the listed incomplete pages at 50 and the detail at 20", () => {
    const incomplete = Array.from({ length: 60 }, (_, index) => index + 1);
    const result = readPages({ document: doc(pagesOf(60), { incomplete }), fileName: "d.pdf" });
    expect(textOf(result)).toContain(`Pages recognized incompletely: ${incomplete.slice(0, 50).join(", ")} and 10 more.`);
    expect(detailOf(result)).toMatchObject({ incompletePages: incomplete.slice(0, 20), incompletePageCount: 60 });
  });

  it("notes split pages and fills empty pages", () => {
    const text = textOf(readPages({ document: doc(["a", "", "  \n"], { split: true }), fileName: "d.pdf" }));
    expect(text).toContain("Long pages were split; page numbers here are positions in this output, not the document's own page numbers.");
    expect(text).toContain("--- Page 2 ---\n(no text on this page)");
    expect(text).toContain("--- Page 3 ---\n(no text on this page)");
  });
});

describe("failedResult", () => {
  const failure = { code: "DOCUMENT_TIMEOUT", message: "DeepSeek did not finish.", retryable: false };

  it("uses the file name as summary and detail when known", () => {
    expect(failedResult(failure, "a.pdf")).toEqual({ status: "failed", modelOutput: [{ type: "text", text: "DeepSeek did not finish." }], summary: "a.pdf", failure, detail: [{ label: "document", value: { fileName: "a.pdf" } }] });
  });

  it("uses the message as summary without detail otherwise", () => {
    const result = failedResult(failure);
    expect(result.summary).toBe("DeepSeek did not finish.");
    expect(result.detail).toBeUndefined();
  });
});
