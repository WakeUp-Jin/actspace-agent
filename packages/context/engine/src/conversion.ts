import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { readFileReferenceBlocks, readResponseExcerptBlocks, renderFileReferencesForModel, renderResponseExcerptForModel } from "@actspace/shared";
import type { LlmMessage, LlmContentBlock } from "@actspace/llm-service";
import type { ArtifactResolver } from "./types.js";

export async function convertMessages(values: readonly RuntimeV2JsonValue[], sessionId: string, resolveArtifact?: ArtifactResolver, observe?: (message: LlmMessage, sourceIndex: number | null) => void): Promise<readonly LlmMessage[]> {
    const paths = new Map<string, string>();
    for (const value of values) {
      if (!isRecord(value) || !Array.isArray(value.content)) continue;
      for (const block of value.content) {
        if (!isRecord(block) || block.type !== "artifact" || !isRecord(block.artifact)) continue;
        const { artifactId, mediaType } = block.artifact;
        if (typeof artifactId !== "string" || typeof mediaType !== "string" || mediaType.startsWith("image/") || paths.has(artifactId)) continue;
        if (resolveArtifact) {
          try {
            const file = await resolveArtifact(sessionId, artifactId);
            if (file.mediaType !== mediaType) throw new Error("Artifact media type mismatch.");
            paths.set(artifactId, `Full output file: ${JSON.stringify(file.path)}. Use read_file with path and offset/limit, or grep with path and pattern. Do not rerun the command just to recover its output.`);
          } catch { paths.set(artifactId, "Full output file is unavailable; retained output is partial."); }
        }
      }
    }
    const messages = values.map((value) => toMessage(value, paths));
    const repaired: LlmMessage[] = [];
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index]!;
      repaired.push(message);
      observe?.(message, index);
      if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
      const results = new Set<string>();
      let next = index + 1;
      while (messages[next]?.role === "tool") {
        const result = messages[next++]!;
        repaired.push(result);
        observe?.(result, next - 1);
        if (result.callId) results.add(result.callId);
      }
      index = next - 1;
      for (const block of message.content) {
        if (block.type === "tool-call" && !results.has(block.callId)) {
          const missing: LlmMessage = { role: "tool", callId: block.callId, content: "No result was recorded for this tool call. Its outcome is unknown; do not assume it executed or succeeded." };
          repaired.push(missing); observe?.(missing, null);
        }
      }
    }
    return repaired;
  }

export function surfaceMessage(node: import("@actspace/session-journal").SessionSurfaceNodeV1): RuntimeV2JsonValue {
  if (node.kind === "user") return { role: "user", content: node.content };
  if (node.kind === "assistant") return { role: "assistant", content: node.content };
  return { role: "tool", callId: node.callId, content: node.content, isError: node.isError };
}
function toMessage(value: RuntimeV2JsonValue, paths: ReadonlyMap<string, string>): LlmMessage {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Readonly<Record<string, RuntimeV2JsonValue>>;
    if (record.role === "user" || record.role === "assistant" || record.role === "tool") return { role: record.role, content: toLlmContent(record.content, paths), ...(record.role === "tool" && typeof record.callId === "string" ? { callId: record.callId } : {}) };
  }
  return { role: "user", content: typeof value === "string" ? value : JSON.stringify(value) ?? "null" };
}
function toLlmContent(value: RuntimeV2JsonValue | undefined, paths: ReadonlyMap<string, string>): string | readonly LlmContentBlock[] {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return JSON.stringify(value ?? null) ?? "null";
  // 同一条消息里的文件引用合并成一段，出现在第一个 file-reference 块的位置。
  const fileReferences = readFileReferenceBlocks(value);
  let fileReferencesRendered = false;
  return value.flatMap((item): LlmContentBlock[] => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return [{ type: "text", text: JSON.stringify(item) ?? "null" }];
    const block = item as Readonly<Record<string, RuntimeV2JsonValue>>;
    if (block.type === "text" && typeof block.text === "string") return [{ type: "text", text: block.text }];
    if (block.type === "reasoning" && typeof block.text === "string") return [{ type: "reasoning", text: block.text, ...(typeof block.signature === "string" ? { signature: block.signature } : {}), ...(isRecord(block.replay) ? { replay: block.replay as never } : {}) }];
    if (block.type === "tool-call" && typeof block.callId === "string" && typeof block.name === "string") return [{ type: "tool-call", callId: block.callId, name: block.name, arguments: typeof block.arguments === "string" ? block.arguments : JSON.stringify(block.arguments ?? {}) }];
    if (block.type === "json") return [{ type: "text", text: JSON.stringify(block.value ?? null) }];
    if (block.type === "runtime-context" && isRecord(block.context)) return [{ type: "text", text: `<runtime_context>${JSON.stringify(block.context)}</runtime_context>` }];
    if (block.type === "file-reference") {
      if (fileReferencesRendered || fileReferences.length === 0) return [];
      fileReferencesRendered = true;
      return [{ type: "text", text: renderFileReferencesForModel(fileReferences) }];
    }
    if (block.type === "response-excerpt") {
      const [excerpt] = readResponseExcerptBlocks([block]);
      return excerpt ? [{ type: "text", text: renderResponseExcerptForModel(excerpt) }] : [];
    }
    if (block.type === "artifact" && isRecord(block.artifact)) {
      const { artifactId, mediaType } = block.artifact;
      if (typeof artifactId === "string" && typeof mediaType === "string") {
        if (mediaType.startsWith("image/")) return [{ type: "image", artifactId, mimeType: mediaType, ...(typeof block.label === "string" ? { alt: block.label } : {}) }];
        if (typeof block.text === "string") {
          const label = typeof block.label === "string" ? block.label : "File";
          return [{ type: "text", text: `<attached_file name=${JSON.stringify(label)} media_type=${JSON.stringify(mediaType)}>\n${block.text}\n</attached_file>` }];
        }
        return [{ type: "text", text: `${typeof block.label === "string" ? block.label : "File"} (${mediaType}, artifactId=${artifactId}). ${paths.get(artifactId) ?? "File reference only; this Host cannot resolve its read path."}` }];
      }
    }
    return [{ type: "text", text: JSON.stringify(block) }];
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return value !== null && typeof value === "object" && !Array.isArray(value); }
