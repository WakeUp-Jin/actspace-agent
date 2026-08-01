import type { ToolExecutorFn } from "../../types";
import { ImageInputError, readAuthorizedImage } from "./image-input";
import { ImageInspectionServiceError, inspectImageWithModel } from "./service";

const MAX_PATH_CHARS = 4_096;
const MAX_QUESTION_CHARS = 4_000;
const MAX_REPORT_CHARS = 20_000;
const TRUNCATION_NOTICE = "\n\n[Visual report truncated at 20,000 characters.]";

export const inspectImageExecutor: ToolExecutorFn = async (args, workspaceRoot, runtime) => {
  const startedAt = Date.now();
  const path = typeof args.path === "string" ? args.path.trim() : "";
  const question = typeof args.question === "string" ? args.question.trim() : "";
  if (!path) return failure("invalid_path", "图片路径不能为空。");
  if (path.length > MAX_PATH_CHARS) return failure("invalid_path", "图片路径过长。");
  if (!question) return failure("invalid_question", "图片分析问题不能为空。");
  if (question.length > MAX_QUESTION_CHARS) {
    return failure("invalid_question", `图片分析问题不能超过 ${MAX_QUESTION_CHARS} 个字符。`);
  }
  if (!runtime?.imageInspection) {
    return failure("not_configured", "图片分析模型或 Provider 凭据尚未配置。");
  }

  try {
    const image = await readAuthorizedImage(path, workspaceRoot, {
      allowedImagePaths: runtime.imageInspection.allowedImagePaths,
      artifactRoot: runtime.imageInspection.artifactRoot,
    });
    const result = await inspectImageWithModel(image, question, runtime.imageInspection, runtime.signal);
    const capped = capReport(result.text);
    const truncated = capped.truncated || result.stoppedAtLimit;
    const report = result.stoppedAtLimit
      ? `${capped.text}\n\n[Visual model stopped at its output limit.]`
      : capped.text;
    const data = formatSuccessContext({
      sourceName: image.sourceName,
      provider: runtime.imageInspection.provider,
      model: runtime.imageInspection.model,
      modelLabel: runtime.imageInspection.modelLabel,
      question,
      report,
      truncated,
    });
    return {
      success: true,
      data,
      preserveModelOutput: true,
      structured: {
        type: "image_inspection",
        sourceName: image.sourceName,
        provider: runtime.imageInspection.provider,
        modelId: runtime.imageInspection.model,
        characterCount: report.length,
        sizeBytes: image.sizeBytes,
        durationMs: Date.now() - startedAt,
        truncated,
      },
    };
  } catch (error) {
    if (error instanceof ImageInputError || error instanceof ImageInspectionServiceError) {
      return failure(error.code, error.message, path);
    }
    return failure("inspection_failed", "图片分析失败，请稍后再试。", path);
  }
};

function capReport(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_REPORT_CHARS) return { text, truncated: false };
  return {
    text: `${text.slice(0, MAX_REPORT_CHARS - TRUNCATION_NOTICE.length)}${TRUNCATION_NOTICE}`,
    truncated: true,
  };
}

function formatSuccessContext(input: {
  sourceName: string;
  provider: string;
  model: string;
  modelLabel: string;
  question: string;
  report: string;
  truncated: boolean;
}): string {
  return [
    '<image_inspection_result version="1">',
    "status: success",
    `source: ${escapeEnvelopeText(input.sourceName)}`,
    `provider: ${input.provider}`,
    `model: ${input.model}`,
    `model_label: ${escapeEnvelopeText(input.modelLabel)}`,
    `truncated: ${input.truncated}`,
    `question: ${escapeEnvelopeText(input.question)}`,
    "",
    "<visual_report>",
    escapeEnvelopeText(input.report),
    "</visual_report>",
    "</image_inspection_result>",
  ].join("\n");
}

function failure(code: string, message: string, path?: string) {
  const sourceName = path ? path.split(/[\\/]/).pop() || "image" : "image";
  const data = [
    '<image_inspection_result version="1">',
    "status: error",
    `source: ${escapeEnvelopeText(sourceName)}`,
    `error_code: ${code}`,
    `message: ${escapeEnvelopeText(message)}`,
    "</image_inspection_result>",
  ].join("\n");
  return {
    success: false as const,
    error: message,
    data,
    preserveModelOutput: true,
    structured: { type: "image_inspection", sourceName, errorCode: code },
  };
}

function escapeEnvelopeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
