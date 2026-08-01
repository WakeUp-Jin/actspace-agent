import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPOSER_IMAGE_MAX_BYTES,
  hydrateSessionAttachmentPreviews,
  importComposerImage,
} from "../composer-attachment-service";
import type { SessionRecord } from "@actspace/shared";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "actspace-composer-image-"));
  tempRoots.push(root);
  return root;
}

describe("composer attachment service", () => {
  it("rehydrates persisted image previews without mutating the stored record", async () => {
    const record: SessionRecord = {
      meta: {
        schemaVersion: 2,
        id: "session-image-preview",
        title: "Image preview",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        agentRunCount: 1,
      },
      events: [{
        id: "evt-user-image",
        sessionId: "session-image-preview",
        agentRunId: "agent-run-image",
        type: "user_message",
        timestamp: "2026-08-01T00:00:00.000Z",
        schemaVersion: 2,
        payload: {
          content: "Inspect this image",
          attachments: [{
            id: "att-image",
            kind: "image",
            name: "screen.png",
            path: "/Users/test/screen.png",
            mimeType: "image/png",
          }],
        },
      }],
    };
    const loadPreview = vi.fn(async () => "data:image/png;base64,rehydrated");

    const hydrated = await hydrateSessionAttachmentPreviews(record, loadPreview);

    expect(loadPreview).toHaveBeenCalledWith("/Users/test/screen.png");
    expect(hydrated?.events[0]?.payload).toEqual(expect.objectContaining({
      attachments: [expect.objectContaining({ previewUrl: "data:image/png;base64,rehydrated" })],
    }));
    expect(record.events[0]?.payload).not.toHaveProperty("attachments.0.previewUrl");
  });

  it("leaves unreadable persisted image attachments as safe empty previews", async () => {
    const record: SessionRecord = {
      meta: {
        schemaVersion: 2,
        id: "session-missing-preview",
        title: "Missing preview",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        agentRunCount: 1,
      },
      events: [{
        id: "evt-user-image-missing",
        sessionId: "session-missing-preview",
        agentRunId: "agent-run-image-missing",
        type: "user_message",
        timestamp: "2026-08-01T00:00:00.000Z",
        schemaVersion: 2,
        payload: {
          content: "Inspect missing image",
          attachments: [{
            id: "att-image-missing",
            kind: "image",
            name: "missing.png",
            path: "/Users/test/missing.png",
          }],
        },
      }],
    };

    const hydrated = await hydrateSessionAttachmentPreviews(record, vi.fn(async () => undefined));

    expect(hydrated?.events[0]?.payload).toEqual(record.events[0]?.payload);
  });

  it("materializes a pasted PNG and returns a safe preview", async () => {
    const root = await createTempRoot();
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const loadPreview = vi.fn(async () => "data:image/png;base64,preview");

    const result = await importComposerImage({ name: "Screenshot", mimeType: "image/png", bytes }, root, loadPreview);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment).toMatchObject({
      kind: "image",
      name: "Screenshot.png",
      mimeType: "image/png",
      previewUrl: "data:image/png;base64,preview",
    });
    expect(result.attachment.path).toContain(join(root, "composer-attachments"));
    expect(await readFile(result.attachment.path!)).toEqual(Buffer.from(bytes));
    expect(loadPreview).toHaveBeenCalledWith(result.attachment.path);
  });

  it("rejects unsupported clipboard bytes before writing", async () => {
    const root = await createTempRoot();
    const loadPreview = vi.fn(async () => "data:image/png;base64,preview");

    const result = await importComposerImage(
      { name: "not-an-image.gif", mimeType: "image/gif", bytes: new Uint8Array([1, 2, 3]) },
      root,
      loadPreview,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "unsupported_format", message: "仅支持粘贴 PNG、JPEG 或 WebP 图片。" },
    });
    expect(loadPreview).not.toHaveBeenCalled();
  });

  it("rejects clipboard images above the inspection limit", async () => {
    const root = await createTempRoot();
    const result = await importComposerImage(
      {
        name: "large.png",
        mimeType: "image/png",
        bytes: new Uint8Array(COMPOSER_IMAGE_MAX_BYTES + 1),
      },
      root,
      vi.fn(),
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "too_large", message: "图片超过 20 MiB，无法附加。" },
    });
  });
});
