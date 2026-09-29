import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { LlmService } from "@actspace/llm-service";
import type { ToolBodyResult, ToolExecutionContext } from "@actspace/tools-runtime";
import type { ToolPorts } from "./plugin.js";
const MAX_QUESTION_CHARS = 4_000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_REPORT_CHARS = 20_000;
export type SessionArtifactReader = (sessionId: string, artifactId: string) => Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }>;
export type ImageInspector = (input: { readonly sessionId: string; readonly artifactId: string; readonly mediaType: string; readonly question: string; readonly signal: AbortSignal }) => Promise<string>;
export type NodeToolPortsOptions = { readonly readArtifact?: SessionArtifactReader; readonly inspect?: ImageInspector };
export function createNodeToolPorts(options: NodeToolPortsOptions): ToolPorts { return Object.freeze({ inspect_image: (args, context) => inspectImage(args, context, options) }); }
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

async function inspectImage(args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext, options: NodeToolPortsOptions): Promise<ToolBodyResult> {
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

function sniffImage(bytes: Uint8Array): string | undefined { const value = Buffer.from(bytes); if (value.length >= 8 && value.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"; if (value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) return "image/jpeg"; if (value.length >= 12 && value.toString("ascii", 0, 4) === "RIFF" && value.toString("ascii", 8, 12) === "WEBP") return "image/webp"; return undefined; }
function stringArg(args: Readonly<Record<string, RuntimeV2JsonValue>>, key: string): string { return typeof args[key] === "string" ? args[key] : ""; }
function safeMessage(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/((?:Bearer|api[_-]?key)\s+)[^\s,]+/gi, "$1[REDACTED]"); }
function escapeText(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function failed(code: string, message: string, retryable: boolean): ToolBodyResult { return { status: "failed", summary: message, modelOutput: [{ type: "text", text: message }], failure: { code, message, retryable } }; }
