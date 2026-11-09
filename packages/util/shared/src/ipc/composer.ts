// Composer 周边的选择与导入 IPC：选文件 / 图片、拖入图片、列 Skill、选工作区目录。

import type { ComposerAttachment } from "../session";

export type SelectFilesResult = {
  canceled: boolean;
  attachments: ComposerAttachment[];
};

export type SelectImagesResult = SelectFilesResult;

export type ImportComposerImageInput = {
  name: string;
  mimeType?: string;
  bytes: Uint8Array;
};

export type ImportComposerImageResult =
  | { ok: true; attachment: ComposerAttachment }
  | {
      ok: false;
      error: {
        code: "empty" | "too_large" | "unsupported_format" | "decode_failed" | "write_failed";
        message: string;
      };
    };

export type SkillListInput = {
  workspaceRoot?: string;
};

export type SelectWorkspaceDirectoryInput = {
  /** Only workspace adoption registers the chosen folder; auxiliary directory picks do not. */
  registerWorkspace?: boolean;
};

export type SelectWorkspaceDirectoryResult = {
  canceled: boolean;
  workspaceRoot?: string;
};
