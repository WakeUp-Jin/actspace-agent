import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, appendFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalizeFileResource, type ToolBodyResult, type ToolExecutionContext } from "@actspace/tool-runtime";
import { DocumentCache } from "../cache.js";
import { createNodeDocumentPorts, DOCUMENT_OCR_ENDPOINT, type DocumentArtifactReader, type NodeDocumentPortsOptions } from "../node-ports.js";
import { ascii, concat, ole2, zip } from "./bytes.js";

const KEY = "fixture-ds-key-1";
const PDF = concat(ascii("%PDF-1.7\n"), ascii("placeholder body\n"));
const DOCX = zip(["[Content_Types].xml", "word/document.xml"]);
const ocrBody = (texts: string[]) => JSON.stringify({ object: "ocr.result", page_count: texts.length, pages: texts.map((text, index) => ({ index, text, finish_reason: "stop" })) });
const respond = (status: number, text: string) => new Response(text, { status, headers: { "content-type": "application/json" } });
const textOf = (result: ToolBodyResult) => (result.modelOutput[0] as { text: string }).text;

let root: string;
let outside: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "doc-ws-")));
  outside = realpathSync(mkdtempSync(join(tmpdir(), "doc-out-")));
  writeFileSync(join(root, "report.pdf"), PDF);
});
afterEach(() => vi.useRealTimers());

function context(overrides: Partial<ToolExecutionContext> = {}) {
  const progress: string[] = [];
  const value = {
    pluginId: "actspace.document", name: "read_document", callId: "c1", sessionId: "s1", workspaceRoot: root,
    agentRunId: "r", turnId: "t", stepId: "st", signal: new AbortController().signal, capabilities: {} as never,
    reportProgress: (update: { message: string }) => { progress.push(update.message); },
    createArtifact: async () => { throw new Error("unused"); }, defer: () => {},
    ...overrides,
  } as ToolExecutionContext;
  return { value, progress };
}

function setup(options: Partial<NodeDocumentPortsOptions> & { responses?: (() => Response | Promise<Response>)[] } = {}) {
  let key: string | undefined = KEY;
  let enabled = true;
  const queue = [...(options.responses ?? [])];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => (queue.shift() ?? (() => respond(200, ocrBody(["page one", "page two"]))))());
  const ports = createNodeDocumentPorts({ apiKey: () => key, available: () => enabled, workspaceRoot: root, fetchImpl: fetchImpl as unknown as typeof fetch, ...options });
  const call = (args: Record<string, unknown>, ctx = context().value) => ports.read_document!(args as never, ctx);
  return { ports, fetchImpl, call, setKey: (next: string | undefined) => { key = next; }, setEnabled: (next: boolean) => { enabled = next; } };
}

describe("read_document request", () => {
  it("posts multipart purpose and file with the bearer key", async () => {
    const { fetchImpl, call } = setup();
    const result = await call({ path: "report.pdf" });
    expect(result.status).toBe("completed");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(DOCUMENT_OCR_ENDPOINT);
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(new Headers(init!.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    const form = init!.body as FormData;
    expect([...form.keys()].sort()).toEqual(["file", "purpose"]);
    expect(form.get("purpose")).toBe("text_recognition");
    const file = form.get("file") as File;
    expect(file.name).toBe("report.pdf");
    expect(file.type).toBe("application/pdf");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PDF);
  });

  it("adds the sniffed extension when the display name has none", async () => {
    writeFileSync(join(root, "notes"), DOCX);
    const { fetchImpl, call } = setup();
    await call({ path: "notes" });
    const file = (fetchImpl.mock.calls[0]![1]!.body as FormData).get("file") as File;
    expect(file.name).toBe("notes.docx");
    expect(file.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });

  it("never leaks the key and reads it on every call", async () => {
    const { fetchImpl, call, setKey } = setup({ responses: [() => respond(401, `{"error":{"message":"Authentication Fails, bad key Bearer ${KEY}"}}`)] });
    const { value, progress } = context();
    const failed = await call({ path: "report.pdf" }, value);
    expect(JSON.stringify(failed) + progress.join("")).not.toContain(KEY);
    expect(failed.failure?.code).toBe("DEEPSEEK_AUTH_FAILED");
    setKey("fixture-ds-key-2");
    writeFileSync(join(root, "other.pdf"), PDF);
    await call({ path: "other.pdf" });
    expect(new Headers(fetchImpl.mock.calls[1]![1]!.headers).get("authorization")).toBe("Bearer fixture-ds-key-2");
    setKey(undefined);
    const unavailable = await call({ path: "missing.pdf" });
    expect(unavailable.failure?.code).toBe("DOCUMENT_UNAVAILABLE");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does nothing when unavailable", async () => {
    const readArtifact = vi.fn();
    const { fetchImpl, call, setEnabled } = setup({ readArtifact });
    setEnabled(false);
    expect((await call({ path: "report.pdf" })).failure?.code).toBe("DOCUMENT_UNAVAILABLE");
    expect((await call({ artifact_id: "a1" })).failure?.code).toBe("DOCUMENT_UNAVAILABLE");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readArtifact).not.toHaveBeenCalled();
  });

  it("rejects malformed pages before reading", async () => {
    const { fetchImpl, call } = setup();
    expect((await call({ path: "report.pdf", pages: "9-3" })).failure?.code).toBe("INVALID_ARGUMENTS");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("local checks never upload", () => {
  it.each([
    ["too large", "big.pdf", PDF, { maxBytes: 8 }, "DOCUMENT_TOO_LARGE"],
    ["wrong extension", "sheet.xlsx", PDF, {}, "DOCUMENT_UNSUPPORTED_FORMAT"],
    ["wrong content", "fake.pdf", ascii("just text"), {}, "DOCUMENT_UNSUPPORTED_FORMAT"],
    ["xlsx content", "book.docx", zip(["[Content_Types].xml", "xl/workbook.xml"]), {}, "DOCUMENT_UNSUPPORTED_FORMAT"],
    ["encrypted docx", "locked.docx", ole2([{ name: "EncryptionInfo" }, { name: "EncryptedPackage" }]), {}, "DOCUMENT_PASSWORD_PROTECTED"],
  ] as const)("%s", async (_label, name, bytes, extra, failureCode) => {
    writeFileSync(join(root, name), bytes);
    const { fetchImpl, call } = setup(extra);
    const result = await call({ path: name });
    expect(result).toMatchObject({ status: "failed", summary: name, failure: { code: failureCode } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("paths", () => {
  it("reads relative and absolute workspace paths", async () => {
    const { call } = setup();
    expect((await call({ path: "report.pdf" })).status).toBe("completed");
    expect((await call({ path: join(root, "report.pdf") })).status).toBe("completed");
  });

  it("fails when the admitted resource no longer matches", async () => {
    writeFileSync(join(root, "a.pdf"), PDF);
    const admitted = await canonicalizeFileResource(join(root, "a.pdf"), "read", root);
    const { fetchImpl, call } = setup();
    const result = await call({ path: "report.pdf" }, context({ admittedResources: [admitted] }).value);
    expect(result.failure?.code).toBe("IO_ERROR");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads an admitted path outside the workspace", async () => {
    writeFileSync(join(outside, "x.pdf"), PDF);
    const admitted = await canonicalizeFileResource(join(outside, "x.pdf"), "read", root);
    const { call } = setup();
    expect((await call({ path: join(outside, "x.pdf") }, context({ admittedResources: [admitted] }).value)).status).toBe("completed");
  });

  it("refuses a path outside the workspace without admission", async () => {
    writeFileSync(join(outside, "x.pdf"), PDF);
    const { call } = setup();
    expect((await call({ path: join(outside, "x.pdf") })).failure?.code).toBe("IO_ERROR");
  });

  it("maps a missing path and a directory", async () => {
    mkdirSync(join(root, "folder.pdf"));
    const { call } = setup();
    expect((await call({ path: "missing.pdf" })).failure?.code).toBe("FILE_NOT_FOUND");
    expect((await call({ path: "folder.pdf" })).failure?.code).toBe("NOT_A_FILE");
  });

  it("fails without uploading when the file changes while queued", async () => {
    writeFileSync(join(root, "a.pdf"), PDF);
    writeFileSync(join(root, "b.pdf"), PDF);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { fetchImpl, call } = setup({ cache: new DocumentCache({ maxLoads: 1 }), responses: [async () => { await gate; return respond(200, ocrBody(["a"])); }] });
    const first = call({ path: "a.pdf" });
    await new Promise(resolve => setTimeout(resolve, 10));
    const second = call({ path: "b.pdf" });
    await new Promise(resolve => setTimeout(resolve, 10));
    appendFileSync(join(root, "b.pdf"), "more");
    release();
    await first;
    expect((await second).failure?.code).toBe("IO_ERROR");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("attachments", () => {
  const reader = (fileName?: string): DocumentArtifactReader & ReturnType<typeof vi.fn> => vi.fn(async (sessionId: string, artifactId: string) => {
    if (sessionId !== "s1" || artifactId !== "a1") throw new Error("not found");
    return { bytes: PDF, mediaType: "text/plain", ...(fileName ? { fileName } : {}) };
  }) as never;

  it("reads through the session's reader and names it from metadata", async () => {
    const readArtifact = reader("季度报告.pdf");
    const { call } = setup({ readArtifact });
    const result = await call({ artifact_id: "a1" });
    expect(readArtifact).toHaveBeenCalledWith("s1", "a1");
    expect(result.summary).toBe("季度报告.pdf · 2 pages");
    expect((await setup({ readArtifact: reader() }).call({ artifact_id: "a1" })).summary).toBe("attachment · 2 pages");
  });

  it("fails when the reader throws or is missing", async () => {
    expect((await setup({ readArtifact: reader() }).call({ artifact_id: "nope" })).failure?.code).toBe("DOCUMENT_ARTIFACT_NOT_FOUND");
    expect((await setup().call({ artifact_id: "a1" })).failure?.code).toBe("DOCUMENT_ARTIFACT_NOT_FOUND");
  });

  it("calls the reader on every call so a cached attachment stays private to its session", async () => {
    const readArtifact = reader("a.pdf");
    const { fetchImpl, call } = setup({ readArtifact });
    await call({ artifact_id: "a1" });
    await call({ artifact_id: "a1" });
    expect(readArtifact).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const other = await call({ artifact_id: "a1" }, context({ sessionId: "s2" }).value);
    expect(other.failure?.code).toBe("DOCUMENT_ARTIFACT_NOT_FOUND");
    expect(textOf(other)).not.toContain("page one");
  });
});

describe("cache", () => {
  it("uploads a file once, again after it changes, and shares across sessions", async () => {
    const { fetchImpl, call } = setup();
    await call({ path: "report.pdf" });
    await call({ path: "report.pdf", pages: "2" }, context({ sessionId: "s2" }).value);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    appendFileSync(join(root, "report.pdf"), "changed");
    const future = new Date(Date.now() + 5_000);
    utimesSync(join(root, "report.pdf"), future, future);
    await call({ path: "report.pdf" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("result", () => {
  it("reports progress once with the name and returns the contract text", async () => {
    const { call } = setup();
    const { value, progress } = context();
    const result = await call({ path: "report.pdf" }, value);
    expect(progress).toEqual(["report.pdf"]);
    expect(result.summary).toBe("report.pdf · 2 pages");
    expect(textOf(result)).toBe("Document: report.pdf (2 pages)\n\n--- Page 1 ---\npage one\n\n--- Page 2 ---\npage two");
    expect(result.detail).toEqual([{ label: "document", value: { fileName: "report.pdf", pageCount: 2, range: { from: 1, to: 2 }, incompletePages: [], incompletePageCount: 0 } }]);
  });

  it("returns the requested page range and out-of-range failures", async () => {
    const { call } = setup();
    expect((await call({ path: "report.pdf", pages: "2" })).summary).toBe("report.pdf · pages 2");
    expect((await call({ path: "report.pdf", pages: "5-6" })).failure).toMatchObject({ code: "DOCUMENT_PAGES_OUT_OF_RANGE", message: "The document has 2 pages." });
  });
});

describe("failures", () => {
  it.each([
    [401, '{"error":{"message":"Authentication Fails"}}', "DEEPSEEK_AUTH_FAILED"],
    [402, '{"error":{"message":"Insufficient Balance"}}', "DEEPSEEK_INSUFFICIENT_BALANCE"],
    [429, "{}", "DEEPSEEK_RATE_LIMITED"],
    [200, '{"error":{"message":"The file is password-protected and cannot be processed."}}', "DOCUMENT_PASSWORD_PROTECTED"],
    [400, '{"error":{"message":"Failed to recognize the file: the document has more than 1000 pages"}}', "DOCUMENT_TOO_MANY_PAGES"],
    [413, "", "DOCUMENT_TOO_LARGE"],
    [200, '{"error":{"message":"Recognition did not finish in time"}}', "DOCUMENT_TIMEOUT"],
    [200, '{"error":{"message":"Failed to recognize the file: the file format is not supported"}}', "DOCUMENT_PARSE_FAILED"],
    [504, "", "DOCUMENT_TIMEOUT"],
    [200, '{"pages":[]}', "DOCUMENT_PARSE_FAILED"],
    [502, "bad gateway", "DOCUMENT_FAILED"],
  ])("HTTP %i %s → %s", async (status, body, failureCode) => {
    const { call } = setup({ responses: [() => respond(status, body)] });
    expect(await call({ path: "report.pdf" })).toMatchObject({ status: "failed", summary: "report.pdf", failure: { code: failureCode }, detail: [{ label: "document", value: { fileName: "report.pdf" } }] });
  });

  it("does not cache failures", async () => {
    const { fetchImpl, call } = setup({ responses: [() => respond(500, "x")] });
    await call({ path: "report.pdf" });
    expect((await call({ path: "report.pdf" })).status).toBe("completed");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps a network error and the total timeout", async () => {
    const network = setup({ responses: [() => { throw new TypeError("fetch failed"); }] });
    expect((await network.call({ path: "report.pdf" })).failure).toMatchObject({ code: "DOCUMENT_FAILED", retryable: true });
    const slow = setup({ totalTimeoutMs: 20 });
    slow.fetchImpl.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason))));
    expect((await slow.call({ path: "report.pdf" })).failure).toMatchObject({ code: "DOCUMENT_TIMEOUT", retryable: false });
  });
});

describe("abort and dispose", () => {
  it("does not upload when aborted before reading", async () => {
    const { fetchImpl, call } = setup();
    const controller = new AbortController();
    controller.abort();
    expect((await call({ path: "report.pdf" }, context({ signal: controller.signal }).value)).failure?.code).toBe("TOOL_ABORTED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lets an upload finish into the cache after the caller aborts", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { fetchImpl, call } = setup({ responses: [async () => { await gate; return respond(200, ocrBody(["late"])); }] });
    const controller = new AbortController();
    const pending = call({ path: "report.pdf" }, context({ signal: controller.signal }).value);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    controller.abort();
    expect((await pending).failure?.code).toBe("TOOL_ABORTED");
    expect((fetchImpl.mock.calls[0]![1]!.signal as AbortSignal).aborted).toBe(false);
    release();
    await new Promise(resolve => setTimeout(resolve, 10));
    const again = await call({ path: "report.pdf" });
    expect(textOf(again)).toContain("late");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("dispose aborts the upload and refuses later calls", async () => {
    const { ports, fetchImpl, call } = setup();
    fetchImpl.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason))));
    const pending = call({ path: "report.pdf" });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await ports.dispose!();
    expect((fetchImpl.mock.calls[0]![1]!.signal as AbortSignal).aborted).toBe(true);
    expect((await pending).failure?.code).toBe("TOOL_ABORTED");
    expect((await call({ path: "report.pdf" })).failure?.code).toBe("TOOL_ABORTED");
  });
});
