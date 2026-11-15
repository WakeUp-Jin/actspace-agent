import { describe, expect, it } from "vitest";
import { DOCUMENT_TYPES, hasSupportedExtension, sniffDocument, sniffHead } from "../sniff.js";
import { ascii, concat, ole2, zip } from "./bytes.js";

const CT = "[Content_Types].xml";
const pdfAt = (offset: number) => concat(new Uint8Array(offset).fill(0x20), ascii("%PDF-1.7\n"));

describe("sniffHead", () => {
  it("finds %PDF- anywhere in the first 1,024 bytes", () => {
    expect(sniffHead(pdfAt(0))).toBe("pdf");
    expect(sniffHead(pdfAt(1000).subarray(0, 1024))).toBe("pdf");
    expect(sniffHead(pdfAt(1100).subarray(0, 1024))).toBeUndefined();
  });

  it("recognizes ZIP and OLE2 signatures and nothing else", () => {
    expect(sniffHead(zip([CT]))).toBe("zip");
    expect(sniffHead(ole2([]))).toBe("ole2");
    expect(sniffHead(ascii("hello world"))).toBeUndefined();
    expect(sniffHead(new Uint8Array())).toBeUndefined();
    expect(sniffHead(Uint8Array.from([0x50, 0x4b, 0x03]))).toBeUndefined();
  });
});

describe("sniffDocument", () => {
  it("treats any PDF head as pdf", () => {
    expect(sniffDocument(pdfAt(16))).toBe("pdf");
  });

  it("tells DOCX, PPTX, XLSX and plain ZIP apart by entry names", () => {
    expect(sniffDocument(zip([CT, "word/document.xml"]))).toBe("docx");
    expect(sniffDocument(zip([CT, "word/main.xml"]))).toBe("docx");
    expect(sniffDocument(zip([CT, "ppt/presentation.xml"]))).toBe("pptx");
    expect(sniffDocument(zip([CT, "xl/workbook.xml"]))).toBeUndefined();
    expect(sniffDocument(zip(["readme.txt"]))).toBeUndefined();
    expect(sniffDocument(zip(["word/document.xml"]))).toBeUndefined();
    expect(sniffDocument(zip([CT, "ppt/x.xml", "word/x.xml"]))).toBe("docx");
    expect(sniffDocument(zip(["[content_types].XML", "WORD/document.xml"]))).toBe("docx");
  });

  it("reads the end record behind an archive comment", () => {
    expect(sniffDocument(zip([CT, "ppt/a.xml"], { comment: "made by a tool" }))).toBe("pptx");
  });

  it("rejects a ZIP whose end record is missing, out of range or ZIP64", () => {
    expect(sniffDocument(zip([CT, "word/a.xml"], { noEnd: true }))).toBeUndefined();
    expect(sniffDocument(zip([CT, "word/a.xml"], { endOffset: 1_000_000 }))).toBeUndefined();
    expect(sniffDocument(zip([CT, "word/a.xml"], { endOffset: 0xffffffff }))).toBeUndefined();
    expect(sniffDocument(zip([CT, "word/a.xml"], { endCount: 0xffff }))).toBeUndefined();
  });

  it("tells DOC, PPT, XLS and encrypted OOXML apart by stream names", () => {
    expect(sniffDocument(ole2([{ name: "WordDocument" }, { name: "1Table" }]))).toBe("doc");
    expect(sniffDocument(ole2([{ name: "PowerPoint Document" }]))).toBe("ppt");
    expect(sniffDocument(ole2([{ name: "Workbook" }]))).toBeUndefined();
    expect(sniffDocument(ole2([{ name: "EncryptionInfo" }, { name: "EncryptedPackage" }]))).toBe("encrypted");
    expect(sniffDocument(ole2([{ name: "EncryptedPackage" }, { name: "WordDocument" }]))).toBe("doc");
  });

  it("only counts directory entries whose name length and type match", () => {
    expect(sniffDocument(ole2([{ name: "WordDocument", type: 1 }]))).toBeUndefined();
    expect(sniffDocument(ole2([{ name: "WordDocument", nameBytes: 10 }]))).toBeUndefined();
  });

  it("rejects text, empty and tiny files", () => {
    expect(sniffDocument(ascii("just some text"))).toBeUndefined();
    expect(sniffDocument(new Uint8Array())).toBeUndefined();
    expect(sniffDocument(Uint8Array.from([1, 2, 3]))).toBeUndefined();
  });
});

describe("hasSupportedExtension", () => {
  it("accepts the five document extensions in any case", () => {
    for (const name of ["a.pdf", "a.doc", "a.docx", "a.ppt", "a.pptx", "REPORT.PDF"]) expect(hasSupportedExtension(name)).toBe(true);
  });

  it("rejects other extensions and returns undefined without one", () => {
    expect(hasSupportedExtension("a.xlsx")).toBe(false);
    expect(hasSupportedExtension("a.pdf.exe")).toBe(false);
    expect(hasSupportedExtension("attachment")).toBeUndefined();
    expect(hasSupportedExtension(".hidden")).toBeUndefined();
  });

  it("maps each type to an extension and media type", () => {
    expect(DOCUMENT_TYPES.docx).toEqual({ extension: ".docx", mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    expect(Object.keys(DOCUMENT_TYPES).sort()).toEqual(["doc", "docx", "pdf", "ppt", "pptx"]);
  });
});
