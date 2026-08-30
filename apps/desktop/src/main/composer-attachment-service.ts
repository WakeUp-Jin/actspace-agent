import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type {
  ComposerAttachment,
  ImportComposerImageInput,
  ImportComposerImageResult,
  SessionRecord,
  UserMessagePayload,
} from "@actspace/shared";

export const COMPOSER_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

type SupportedImage = {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  extension: ".png" | ".jpg" | ".webp";
};

export type ComposerImagePreviewLoader = (filePath: string) => Promise<string | undefined>;

export async function hydrateSessionAttachmentPreviews(
  record: SessionRecord | null,
  loadPreview: ComposerImagePreviewLoader,
): Promise<SessionRecord | null> {
  if (!record) return null;

  const events = await Promise.all(record.events.map(async (event) => {
    if (event.type !== "user_message") return event;
    const payload = event.payload as UserMessagePayload;
    if (!payload.attachments?.some((attachment) => (
      attachment.kind === "image" && Boolean(attachment.path) && !attachment.previewUrl
    ))) {
      return event;
    }

    const attachments = await Promise.all(payload.attachments.map(async (attachment) => {
      if (attachment.kind !== "image" || !attachment.path || attachment.previewUrl) return attachment;
      const previewUrl = await loadPreview(attachment.path);
      return previewUrl ? { ...attachment, previewUrl } : attachment;
    }));

    return {
      ...event,
      payload: { ...payload, attachments },
    };
  }));

  return { ...record, events };
}

function detectSupportedImage(bytes: Uint8Array): SupportedImage | undefined {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png", extension: ".png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: ".jpg" };
  }
  if (
    bytes.length >= 12
    && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF"
    && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: ".webp" };
  }
  return undefined;
}

function displayName(inputName: string, image: SupportedImage): string {
  const safeName = basename(inputName.trim()) || `pasted-image${image.extension}`;
  const extension = extname(safeName).toLowerCase();
  if (extension === image.extension || (image.extension === ".jpg" && extension === ".jpeg")) {
    return safeName;
  }
  return `${safeName.replace(/\.[^.]+$/, "") || "pasted-image"}${image.extension}`;
}

export async function importComposerImage(
  input: ImportComposerImageInput,
  tmpRoot: string,
  loadPreview: ComposerImagePreviewLoader,
): Promise<ImportComposerImageResult> {
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
  if (bytes.byteLength === 0) {
    return { ok: false, error: { code: "empty", message: "剪贴板图片为空。" } };
  }
  if (bytes.byteLength > COMPOSER_IMAGE_MAX_BYTES) {
    return { ok: false, error: { code: "too_large", message: "图片超过 20 MiB，无法附加。" } };
  }

  const image = detectSupportedImage(bytes);
  if (!image) {
    return {
      ok: false,
      error: { code: "unsupported_format", message: "仅支持粘贴 PNG、JPEG 或 WebP 图片。" },
    };
  }

  const attachmentRoot = join(tmpRoot, "composer-attachments");
  const filePath = join(attachmentRoot, `pasted-${randomUUID()}${image.extension}`);
  try {
    await mkdir(attachmentRoot, { recursive: true });
    await writeFile(filePath, bytes);
    const previewUrl = await loadPreview(filePath);
    if (!previewUrl) {
      await unlink(filePath).catch(() => undefined);
      return { ok: false, error: { code: "decode_failed", message: "图片无法解码。" } };
    }
    const attachment: ComposerAttachment = {
      id: `att_${randomUUID()}`,
      kind: "image",
      name: displayName(input.name, image),
      path: filePath,
      mimeType: image.mimeType,
      previewUrl,
    };
    return { ok: true, attachment };
  } catch {
    await unlink(filePath).catch(() => undefined);
    return { ok: false, error: { code: "write_failed", message: "图片暂存失败。" } };
  }
}
