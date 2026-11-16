import { open, realpath, type FileHandle } from "node:fs/promises";
import * as nodePath from "node:path";
import { isAbsolute, resolve } from "node:path";
import { isLexicallyInside } from "@actspace/shared";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { canonicalizeFileResource, type ToolBodyResult, type ToolExecutionContext } from "@actspace/tool-runtime";
import { displayName, failedResult, parsePagesArg, readPages } from "./assemble.js";
import { ABORTED_FAILURE, DocumentCache, type LoadControl } from "./cache.js";
import { documentFailure, parseOcrResponse, redact, type DocumentFailure, type DocumentLoadResult } from "./ocr-response.js";
import type { ToolPorts } from "./plugin.js";
import { DOCUMENT_TYPES, hasSupportedExtension, sniffDocument, sniffHead, type DocumentType } from "./sniff.js";

export const DOCUMENT_OCR_ENDPOINT = "https://api.deepseek.com/v1/tools/ocr";
const DEFAULT_TIMEOUT_MS = 190_000;
const DEFAULT_MAX_BYTES = 104_857_600;
const HEAD_BYTES = 1_024;

export type DocumentArtifactReader = (sessionId: string, artifactId: string) => Promise<{ readonly bytes: Uint8Array; readonly mediaType: string; readonly fileName?: string }>;
export type NodeDocumentPortsOptions = {
  /** Read on every call, so a key saved or cleared in Settings applies to the next call. */
  readonly apiKey: () => string | undefined;
  readonly available: () => boolean;
  /** Used when `context.workspaceRoot` is empty. */
  readonly workspaceRoot: string;
  readonly readArtifact?: DocumentArtifactReader;
  readonly fetchImpl?: typeof fetch;
  /** From the fetch call to the full response body; DeepSeek's own limit is 180 seconds. */
  readonly totalTimeoutMs?: number;
  readonly maxBytes?: number;
  /** Tests only. */
  readonly cache?: DocumentCache;
};

const UNSUPPORTED = "read_document only reads PDF, Word (.doc, .docx) and PowerPoint (.ppt, .pptx) files. Use read_file for text and code, a script for spreadsheets, inspect_image for images.";
const PASSWORD = "The document is password-protected and cannot be parsed. Ask the user to remove the password.";

/** One cache per port: every Session in this Harness shares it; `dispose()` clears it with the Harness. */
export function createNodeDocumentPorts(options: NodeDocumentPortsOptions): ToolPorts {
  const cache = options.cache ?? new DocumentCache();
  return {
    read_document: (args, context) => readDocument(options, cache, args, context),
    dispose: async () => cache.dispose(),
  };
}

/** Where the bytes come from, after step 3 of the call order. */
type Source =
  | { readonly kind: "path"; readonly input: string; readonly path: string; readonly size: number; readonly mtimeMs: number; readonly head: Uint8Array }
  | { readonly kind: "artifact"; readonly bytes: Uint8Array };

class Failure extends Error { constructor(readonly failure: DocumentFailure) { super(failure.message); } }

async function readDocument(options: NodeDocumentPortsOptions, cache: DocumentCache, args: Readonly<Record<string, RuntimeJsonValue>>, context: ToolExecutionContext): Promise<ToolBodyResult> {
  if (!options.available() || !options.apiKey()?.trim()) return failedResult(documentFailure("DOCUMENT_UNAVAILABLE", "Document parsing is turned off or DeepSeek is not connected. Read the file locally with a script instead."));
  const pages = parsePagesArg(args.pages);
  if (pages === "invalid") return failedResult(documentFailure("INVALID_ARGUMENTS", 'pages must be one page like "7" or a range like "31-45", with the start not after the end.'));
  const workspaceRoot = resolve(context.workspaceRoot || options.workspaceRoot);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  let fileName: string | undefined;
  try {
    let key: string;
    let source: Source;
    if (typeof args.artifact_id === "string") {
      const artifactId = args.artifact_id;
      if (!options.readArtifact) throw new Failure(artifactNotFound());
      let artifact: Awaited<ReturnType<DocumentArtifactReader>>;
      try { artifact = await options.readArtifact(context.sessionId, artifactId); }
      catch { throw new Failure(artifactNotFound()); }
      fileName = displayName(artifact.fileName);
      key = `artifact:${artifactId}`;
      source = { kind: "artifact", bytes: artifact.bytes };
    } else {
      const input = typeof args.path === "string" ? args.path : "";
      fileName = displayName(input);
      const path = await resolveReadablePath(input, workspaceRoot, context);
      const opened = await openRegularFile(path, input);
      try {
        const head = new Uint8Array(Math.min(HEAD_BYTES, opened.size));
        if (head.length > 0) await opened.handle.read(head, 0, head.length, 0);
        key = `path:${path}\u0000${opened.size}\u0000${opened.mtimeMs}`;
        source = { kind: "path", input, path, size: opened.size, mtimeMs: opened.mtimeMs, head };
      } finally {
        await opened.handle.close();
      }
    }
    if (context.signal.aborted) return aborted(fileName);
    context.reportProgress({ message: fileName });

    const cached = cache.get(key);
    if (cached) return readPages({ document: cached, fileName, ...(pages ? { pages } : {}) });

    precheck(source, fileName, maxBytes);
    const uploadName = fileName;
    const result = await cache.load(key, context.signal, control => load(options, workspaceRoot, context, source, uploadName, control));
    if (!result.ok) {
      if (result.failure.code === ABORTED_FAILURE.code || context.signal.aborted) return aborted(fileName);
      return failedResult(result.failure, fileName);
    }
    if (context.signal.aborted) return aborted(fileName);
    return readPages({ document: result.document, fileName, ...(pages ? { pages } : {}) });
  } catch (error) {
    if (context.signal.aborted) return aborted(fileName);
    if (error instanceof Failure) return failedResult(error.failure, fileName);
    return failedResult(ioFailure(error), fileName);
  }
}

/** Step 6: checks that need no full read. A path only has its first 1,024 bytes here; an artifact is already in memory. */
function precheck(source: Source, fileName: string, maxBytes: number): void {
  const size = source.kind === "path" ? source.size : source.bytes.byteLength;
  if (size > maxBytes) throw new Failure(documentFailure("DOCUMENT_TOO_LARGE", `The document is ${size} bytes; DeepSeek accepts at most ${maxBytes} bytes. Read it locally with a script.`));
  if (hasSupportedExtension(fileName) === false) throw new Failure(documentFailure("DOCUMENT_UNSUPPORTED_FORMAT", UNSUPPORTED));
  if (source.kind === "path") {
    if (sniffHead(source.head) === undefined) throw new Failure(documentFailure("DOCUMENT_UNSUPPORTED_FORMAT", UNSUPPORTED));
    return;
  }
  const type = sniffDocument(source.bytes);
  if (type === "encrypted") throw new Failure(documentFailure("DOCUMENT_PASSWORD_PROTECTED", PASSWORD));
  if (type === undefined) throw new Failure(documentFailure("DOCUMENT_UNSUPPORTED_FORMAT", UNSUPPORTED));
}

/** Step 7, once this load has a slot: read the whole file, check the type, upload, parse. */
async function load(options: NodeDocumentPortsOptions, workspaceRoot: string, context: ToolExecutionContext, source: Source, fileName: string, control: LoadControl): Promise<DocumentLoadResult> {
  let bytes: Uint8Array;
  try {
    bytes = source.kind === "artifact" ? source.bytes : await readWholeFile(source, workspaceRoot, context);
  } catch (error) {
    return { ok: false, failure: error instanceof Failure ? error.failure : ioFailure(error) };
  }
  if (control.signal.aborted) return { ok: false, failure: ABORTED_FAILURE };
  const type = sniffDocument(bytes);
  if (type === "encrypted") return { ok: false, failure: documentFailure("DOCUMENT_PASSWORD_PROTECTED", PASSWORD) };
  if (type === undefined) return { ok: false, failure: documentFailure("DOCUMENT_UNSUPPORTED_FORMAT", UNSUPPORTED) };
  const apiKey = options.apiKey()?.trim();
  if (!options.available() || !apiKey) return { ok: false, failure: documentFailure("DOCUMENT_UNAVAILABLE", "Document parsing is turned off or DeepSeek is not connected. Read the file locally with a script instead.") };
  return upload(options, bytes, type, fileName, apiKey, control);
}

async function upload(options: NodeDocumentPortsOptions, bytes: Uint8Array, type: DocumentType, fileName: string, apiKey: string, control: LoadControl): Promise<DocumentLoadResult> {
  const { extension, mediaType } = DOCUMENT_TYPES[type];
  const form = new FormData();
  form.append("purpose", "text_recognition");
  form.append("file", new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mediaType }), hasSupportedExtension(fileName) === true ? fileName : `${fileName}${extension}`);
  const timeoutMs = options.totalTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([control.signal, timeout]);
  control.startUpload();
  try {
    const response = await (options.fetchImpl ?? fetch)(DOCUMENT_OCR_ENDPOINT, { method: "POST", redirect: "error", signal, headers: { authorization: `Bearer ${apiKey}` }, body: form });
    const text = await response.text();
    return parseOcrResponse(response.status, text);
  } catch (error) {
    if (control.signal.aborted) return { ok: false, failure: ABORTED_FAILURE };
    if (timeout.aborted) return { ok: false, failure: documentFailure("DOCUMENT_TIMEOUT", `DeepSeek did not return the parsed document within ${Math.round(timeoutMs / 1000)} seconds. Read it locally with a script instead.`) };
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, failure: documentFailure("DOCUMENT_FAILED", `Could not reach DeepSeek: ${redact(message).slice(0, 500)}. Try again.`, true) };
  }
}

/** Re-check the path and reopen; the file must be the one the cache key was made from. */
async function readWholeFile(source: Extract<Source, { kind: "path" }>, workspaceRoot: string, context: ToolExecutionContext): Promise<Uint8Array> {
  const path = await resolveReadablePath(source.input, workspaceRoot, context);
  if (path !== source.path) throw new Failure(documentFailure("IO_ERROR", "The file path changed while the document was waiting to be read. Try again."));
  const opened = await openRegularFile(path, source.input);
  try {
    if (opened.size !== source.size || opened.mtimeMs !== source.mtimeMs) throw new Failure(documentFailure("IO_ERROR", "The file changed while the document was waiting to be read. Try again."));
    return new Uint8Array(await opened.handle.readFile());
  } finally {
    await opened.handle.close();
  }
}

async function openRegularFile(path: string, input: string): Promise<{ readonly handle: FileHandle; readonly size: number; readonly mtimeMs: number }> {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Failure(documentFailure("NOT_A_FILE", `Path is not a regular file: ${input}`));
    return { handle, size: info.size, mtimeMs: info.mtimeMs };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/** Same rules as read_file: an admitted resource must still match; otherwise the real path must stay in the workspace. */
async function resolveReadablePath(input: string, workspaceRoot: string, context: ToolExecutionContext): Promise<string> {
  if (!input) throw new Failure(documentFailure("INVALID_ARGUMENTS", "path is required."));
  if (context.admittedResources?.length) {
    const expected = context.admittedResources.find(resource => resource.kind === "file" && resource.access === "read");
    if (expected?.kind !== "file") throw new Error("No admitted file resource matches this operation.");
    const actual = await canonicalizeFileResource(input, "read", workspaceRoot);
    if (actual.canonicalPath !== expected.canonicalPath || actual.targetKind !== expected.targetKind) throw new Error("File scope changed after permission admission.");
    return actual.canonicalPath;
  }
  const candidate = isAbsolute(input) ? resolve(input) : resolve(workspaceRoot, input);
  if (!isWithin(workspaceRoot, candidate)) throw new Error(`Path escapes workspace boundary: ${input}`);
  const [realRoot, realCandidate] = await Promise.all([realpath(workspaceRoot), realpath(candidate)]);
  if (!isWithin(realRoot, realCandidate)) throw new Error(`Path escapes workspace boundary: ${input}`);
  return realCandidate;
}

function isWithin(root: string, candidate: string): boolean {
  return isLexicallyInside(nodePath, root, candidate, { includeRoot: true });
}

function ioFailure(error: unknown): DocumentFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ENOENT")) return documentFailure("FILE_NOT_FOUND", "File not found. Check the path and try again.");
  if (message.includes("EISDIR")) return documentFailure("NOT_A_FILE", "Path is a directory, not a file.");
  return documentFailure("IO_ERROR", `Failed to read the document: ${message}`);
}

function artifactNotFound(): DocumentFailure {
  return documentFailure("DOCUMENT_ARTIFACT_NOT_FOUND", "No attachment with this id in this session. Ask the user to attach the file again or give its path.");
}

function aborted(fileName: string | undefined): ToolBodyResult {
  return failedResult({ ...ABORTED_FAILURE }, fileName);
}
