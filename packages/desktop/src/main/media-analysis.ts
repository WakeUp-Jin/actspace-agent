import { readFile } from "node:fs/promises";
import type { AttachmentAnalysis, ComposerAttachment, RuntimeStreamEvent } from "@actspace/shared";
import { analyzeMediaWithKimi } from "@actspace/agent-core";

type MediaAnalysisOptions = {
  sessionId: string;
  turnId: string;
  userInput: string;
  attachments?: ComposerAttachment[];
  onStreamEvent?: (event: RuntimeStreamEvent) => void;
};

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

function extname(value: string): string {
  const match = value.match(/\.[^.\\/]+$/);
  return match?.[0]?.toLowerCase() ?? "";
}

function inferMimeType(attachment: ComposerAttachment): string {
  return attachment.mimeType || IMAGE_MIME_BY_EXT[extname(attachment.name)] || "image/png";
}

async function toDataUrl(attachment: ComposerAttachment): Promise<string> {
  if (!attachment.path) {
    throw new Error("Image attachment is missing a local path.");
  }

  const bytes = await readFile(attachment.path);
  return `data:${inferMimeType(attachment)};base64,${bytes.toString("base64")}`;
}

function createMediaPreview(attachment: ComposerAttachment) {
  return {
    kind: "media_analysis" as const,
    mediaName: attachment.name,
    mediaKind: "image" as const,
    displayText: `Analyze image ${attachment.name}`,
  };
}

function streamStarted(
  onStreamEvent: MediaAnalysisOptions["onStreamEvent"],
  toolCallId: string,
  attachment: ComposerAttachment,
) {
  onStreamEvent?.({
    type: "tool_started",
    toolCallId,
    toolName: "analyze_media",
    argsPreview: JSON.stringify({ source: attachment.path ?? attachment.name, mimeType: attachment.mimeType }),
    preview: createMediaPreview(attachment),
  });
}

function streamFinished(
  onStreamEvent: MediaAnalysisOptions["onStreamEvent"],
  options: Pick<MediaAnalysisOptions, "sessionId" | "turnId">,
  toolCallId: string,
  isError: boolean,
) {
  onStreamEvent?.({
    type: "tool_finished",
    toolCallId,
    toolName: "analyze_media",
    resultEventId: `runtime-media-analysis-${toolCallId}`,
    isError,
  });
}

export async function analyzeImageAttachmentsForTurn(options: MediaAnalysisOptions): Promise<AttachmentAnalysis[]> {
  const images = (options.attachments ?? []).filter((attachment) => attachment.kind === "image");
  const analyses: AttachmentAnalysis[] = [];

  for (const attachment of images) {
    const toolCallId = `runtime_analyze_media_${attachment.id}`;
    streamStarted(options.onStreamEvent, toolCallId, attachment);

    try {
      const source = await toDataUrl(attachment);
      const result = await analyzeMediaWithKimi({
        source,
        mimeType: inferMimeType(attachment),
        prompt: [
          "Analyze this image for a downstream text-only reasoning model.",
          "Focus on visible content, text, UI state, objects, layout, and anything relevant to the user's request.",
          options.userInput ? `User request: ${options.userInput}` : undefined,
        ].filter(Boolean).join("\n"),
      });

      analyses.push({
        attachmentId: attachment.id,
        toolName: "analyze_media",
        status: "completed",
        summary: result.summary,
        analyzedAt: result.analyzedAt,
      });
      streamFinished(options.onStreamEvent, options, toolCallId, false);
    } catch (error) {
      analyses.push({
        attachmentId: attachment.id,
        toolName: "analyze_media",
        status: "failed",
        errorMessage: error instanceof Error
          ? `图片分析失败，模型只能看到附件路径和文件名。原因：${error.message}`
          : "图片分析失败，模型只能看到附件路径和文件名。",
        analyzedAt: new Date().toISOString(),
      });
      streamFinished(options.onStreamEvent, options, toolCallId, true);
    }
  }

  return analyses;
}
