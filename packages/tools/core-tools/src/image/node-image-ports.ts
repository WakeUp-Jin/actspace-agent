import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { LlmService } from "@actspace/llm-service";
import type { ToolBodyResult, ToolExecutionContext } from "@actspace/tools-runtime";
import type { CoreToolPorts } from "../plugin.js";

const MAX_PROMPT_CHARS = 32_000;
const MAX_QUESTION_CHARS = 4_000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_BATCH_BYTES = 100 * 1024 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_REPORT_CHARS = 20_000;
const IMAGE_REQUEST_TIMEOUT_MS = 120_000;
const SUPPORTED_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536"]);

export type ImageGenerationCredential = { readonly apiKey: string; readonly baseUrl: string; readonly model: string };
export type SessionArtifactReader = (sessionId: string, artifactId: string) => Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }>;
export type ImageInspector = (input: { readonly sessionId: string; readonly artifactId: string; readonly mediaType: string; readonly question: string; readonly signal: AbortSignal }) => Promise<string>;

export type NodeImageToolPortsOptions = {
  readonly generation?: ImageGenerationCredential;
  readonly readArtifact?: SessionArtifactReader;
  readonly inspect?: ImageInspector;
  readonly fetchImpl?: typeof fetch;
  readonly resolveHostname?: (hostname: string) => Promise<readonly string[]>;
};

export function createNodeImageToolPorts(options: NodeImageToolPortsOptions): Pick<CoreToolPorts, "generate_image" | "inspect_image"> {
  return Object.freeze({
    generate_image: (args, context) => generateImage(args, context, options),
    inspect_image: (args, context) => inspectImage(args, context, options),
  });
}

export function createLlmImageInspector(options: { readonly llm: LlmService; readonly routeId: string; readonly model: string; readonly credentialRef?: string }): ImageInspector {
  return async ({ sessionId, artifactId, mediaType, question, signal }) => {
    const prepared = options.llm.prepare({
      sessionId,
      routeId: options.routeId,
      model: options.model,
      ...(options.credentialRef === undefined ? {} : { credentialRef: options.credentialRef }),
      signal,
      messages: [
        { role: "system", content: "Inspect the supplied image. Answer only the user's specific visual question. Report uncertainty and never invent unreadable text." },
        { role: "user", content: [{ type: "text", text: question }, { type: "image", artifactId, mimeType: mediaType }] },
      ],
      tools: [],
      options: { maxTokens: 12_000, reasoning: true },
    });
    const stream = await prepared.dispatch();
    let text = "";
    for await (const event of stream) {
      if (event.type === "text-delta") text += event.text;
      if (event.type === "done" && !text.trim()) text = event.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
      if (event.type === "error") throw new Error(event.failure.message);
      if (event.type === "aborted") throw new Error(event.reason);
    }
    if (!text.trim()) throw new Error("Vision model returned no text.");
    return text.length > MAX_REPORT_CHARS ? `${text.slice(0, MAX_REPORT_CHARS)}\n\n[Visual report truncated.]` : text;
  };
}

async function generateImage(args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext, options: NodeImageToolPortsOptions): Promise<ToolBodyResult> {
  const prompt = stringArg(args, "prompt").trim();
  const size = stringArg(args, "size") || "1024x1024";
  const count = integerArg(args, "n", 1);
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) return failed("INVALID_ARGUMENTS", `prompt must contain 1-${MAX_PROMPT_CHARS} characters.`, false);
  if (!SUPPORTED_SIZES.has(size) || count < 1 || count > 10) return failed("INVALID_ARGUMENTS", "size or n is outside the supported range.", false);
  const credential = options.generation;
  if (credential === undefined) return failed("IMAGE_GENERATION_NOT_CONFIGURED", "Image generation is not configured.", false);
  let endpoint: URL;
  try { endpoint = new URL("images/generations", `${credential.baseUrl.replace(/\/$/, "")}/`); }
  catch { return failed("IMAGE_GENERATION_NOT_CONFIGURED", "Image generation base URL is invalid.", false); }
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost") return failed("IMAGE_GENERATION_NOT_CONFIGURED", "Image generation endpoint must use HTTPS.", false);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(endpoint, { method: "POST", redirect: "error", signal: combinedSignal(context.signal, IMAGE_REQUEST_TIMEOUT_MS), headers: { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: credential.model, prompt, size, n: count }) });
    if (!response.ok) return failed(imageHttpCode(response.status), `Image generation provider returned HTTP ${response.status}.`, response.status === 429 || response.status >= 500);
    const raw = await readBounded(response, MAX_PROVIDER_RESPONSE_BYTES);
    let parsed: unknown;
    try {
      parsed = parseProviderResponse(raw, response.headers.get("content-type"));
    } catch (error) {
      return failed("IMAGE_GENERATION_INVALID_RESPONSE", safeMessage(error), false);
    }
    const payloads = parsePayloads(parsed).slice(0, count);
    if (!payloads.length) return failed("IMAGE_GENERATION_INVALID_RESPONSE", "Image generation provider returned no usable images.", false);
    const artifacts = []; let batchBytes = 0; const failures: string[] = [];
    for (const payload of payloads) {
      try {
        const bytes = payload.kind === "base64" ? decodeBase64(payload.value) : await downloadImage(payload.value, context.signal, fetchImpl, options.resolveHostname ?? resolveAddresses);
        if (bytes.byteLength > MAX_IMAGE_BYTES || batchBytes + bytes.byteLength > MAX_BATCH_BYTES) throw new Error("Generated image exceeds the configured size limit.");
        const mediaType = sniffImage(bytes); if (!mediaType) throw new Error("Generated image format is unsupported.");
        const artifact = await context.createArtifact({ bytes, mediaType }); artifacts.push(artifact); batchBytes += bytes.byteLength;
      } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
    }
    if (!artifacts.length) return failed("IMAGE_GENERATION_INVALID_RESPONSE", failures[0] ?? "Generated images could not be materialized.", false);
    const summary = `Generated ${artifacts.length}/${count} image${count === 1 ? "" : "s"}.`;
    return { status: "completed", summary, modelOutput: [{ type: "text", text: summary }, ...artifacts.map((artifact, index) => ({ type: "artifact" as const, artifact, label: `Generated image ${index + 1}` }))], artifacts, renderer: { id: "actspace.image-gallery", schemaVersion: 1, props: { artifactIds: artifacts.map((artifact) => artifact.artifactId) } } };
  } catch (error) {
    const aborted = context.signal.aborted; return failed(aborted ? "TOOL_ABORTED" : "IMAGE_GENERATION_FAILED", aborted ? "Image generation was aborted." : safeMessage(error), !aborted);
  }
}

async function inspectImage(args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext, options: NodeImageToolPortsOptions): Promise<ToolBodyResult> {
  const artifactId = stringArg(args, "artifact_id"); const question = stringArg(args, "question").trim();
  if (!artifactId || !question || question.length > MAX_QUESTION_CHARS) return failed("INVALID_ARGUMENTS", `artifact_id and a question up to ${MAX_QUESTION_CHARS} characters are required.`, false);
  if (options.readArtifact === undefined || options.inspect === undefined) return failed("IMAGE_INSPECTION_NOT_CONFIGURED", "Image inspection is not configured for this Host.", false);
  try {
    const artifact = await options.readArtifact(context.sessionId, artifactId);
    if (artifact.bytes.byteLength > MAX_IMAGE_BYTES) return failed("IMAGE_TOO_LARGE", `Image exceeds ${MAX_IMAGE_BYTES} bytes.`, false);
    const mediaType = sniffImage(artifact.bytes);
    if (mediaType === undefined || mediaType !== artifact.mediaType) return failed("IMAGE_FORMAT_INVALID", "Artifact metadata does not match a supported image format.", false);
    const report = await options.inspect({ sessionId: context.sessionId, artifactId, mediaType, question, signal: context.signal });
    const text = [`<image_inspection_result version="2">`, "status: success", `artifact_id: ${artifactId}`, `question: ${escapeText(question)}`, "", "<visual_report>", escapeText(report), "</visual_report>", "</image_inspection_result>"].join("\n");
    return { status: "completed", summary: `Inspected image artifact ${artifactId}.`, modelOutput: [{ type: "text", text }] };
  } catch (error) { return failed(context.signal.aborted ? "TOOL_ABORTED" : "IMAGE_INSPECTION_FAILED", context.signal.aborted ? "Image inspection was aborted." : safeMessage(error), context.signal.aborted); }
}

type ImagePayload = { readonly kind: "base64" | "url"; readonly value: string };
function parsePayloads(value: unknown): readonly ImagePayload[] {
  const record = object(value);
  if (!Array.isArray(record?.data)) return [];
  const payloads: ImagePayload[] = [];
  for (const entry of record.data) {
    const item = object(entry);
    if (typeof item?.b64_json === "string") payloads.push({ kind: "base64", value: item.b64_json });
    else if (typeof item?.url === "string") payloads.push({ kind: "url", value: item.url });
  }
  return payloads;
}
function decodeBase64(value: string): Buffer { const compact = value.replace(/\s+/g, ""); if (!compact || compact.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) throw new Error("Image Base64 payload is invalid or too large."); return Buffer.from(compact, "base64"); }
async function downloadImage(raw: string, signal: AbortSignal, fetchImpl: typeof fetch, resolveHostname: (hostname: string) => Promise<readonly string[]>): Promise<Buffer> { const url = new URL(raw); if (url.protocol !== "https:" || url.username || url.password) throw new Error("Generated image URL is unsafe."); await assertPublic(url.hostname, resolveHostname); const response = await fetchImpl(url, { redirect: "error", signal }); if (!response.ok) throw new Error(`Generated image download returned HTTP ${response.status}.`); return readBounded(response, MAX_IMAGE_BYTES); }
async function assertPublic(hostname: string, resolver: (hostname: string) => Promise<readonly string[]>): Promise<void> { const addresses = isIP(hostname) ? [hostname] : await resolver(hostname); if (!addresses.length || addresses.some(privateAddress)) throw new Error("Generated image URL resolves to a private network."); }
async function resolveAddresses(hostname: string): Promise<readonly string[]> { return (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address); }
function privateAddress(address: string): boolean { const value = address.toLowerCase(); if (value === "::" || value === "::1" || value === "0.0.0.0" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value)) return true; if (value.startsWith("::ffff:")) return privateAddress(value.slice(7)); const parts = value.split(".").map(Number); if (parts.length !== 4 || parts.some(Number.isNaN)) return false; const [a, b] = parts as [number, number, number, number]; return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127); }
async function readBounded(response: Response, maxBytes: number): Promise<Buffer> { if (!response.body) return Buffer.alloc(0); const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0; while (true) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > maxBytes) { await reader.cancel(); throw new Error(`Response exceeds ${maxBytes} bytes.`); } chunks.push(next.value); } return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total); }
function parseProviderResponse(raw: Uint8Array, contentType: string | null): unknown {
  const text = Buffer.from(raw).toString("utf8").trim();
  if (!text) throw new Error("Image generation provider returned an empty response.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (/html/i.test(contentType ?? "") || /^<!doctype\s+html|^<html[\s>]/i.test(text)) {
      throw new Error("Image generation provider returned HTML instead of JSON.");
    }
    throw new Error("Image generation provider returned invalid JSON.");
  }
}
function sniffImage(bytes: Uint8Array): string | undefined { const value = Buffer.from(bytes); if (value.length >= 8 && value.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"; if (value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) return "image/jpeg"; if (value.length >= 12 && value.toString("ascii", 0, 4) === "RIFF" && value.toString("ascii", 8, 12) === "WEBP") return "image/webp"; return undefined; }
function imageHttpCode(status: number): string { return status === 401 || status === 403 ? "IMAGE_GENERATION_AUTH" : status === 429 ? "IMAGE_GENERATION_RATE_LIMIT" : status >= 500 ? "IMAGE_GENERATION_PROVIDER" : "IMAGE_GENERATION_INVALID_REQUEST"; }
function object(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function stringArg(args: Readonly<Record<string, RuntimeV2JsonValue>>, key: string): string { return typeof args[key] === "string" ? args[key] : ""; }
function integerArg(args: Readonly<Record<string, RuntimeV2JsonValue>>, key: string, fallback: number): number { return typeof args[key] === "number" && Number.isInteger(args[key]) ? args[key] : fallback; }
function combinedSignal(signal: AbortSignal, timeoutMs: number): AbortSignal { return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]); }
function safeMessage(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/((?:Bearer|api[_-]?key)\s+)[^\s,]+/gi, "$1[REDACTED]"); }
function escapeText(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function failed(code: string, message: string, retryable: boolean): ToolBodyResult { return { status: "failed", summary: message, modelOutput: [{ type: "text", text: message }], failure: { code, message, retryable } }; }
