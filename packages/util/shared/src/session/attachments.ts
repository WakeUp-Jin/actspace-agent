// 用户消息携带的附件：文件、图片或链接。

export type ComposerAttachment = {
  id: string;
  kind: "file" | "image" | "link";
  name: string;
  path?: string;
  /** An authenticated artifact owned by this remote session, not a local path. */
  remoteArtifact?: { sessionId: string; artifactId: string };
  /** An attachment this local Session already stores (an edited prompt resends it without a path). */
  artifactId?: string;
  mimeType?: string;
  previewUrl?: string;
};
