// 会话 Artifact IPC：读取会话引用的图片 Artifact、为受控 Artifact 弹原生右键菜单。

/** 读取当前会话引用的 v2 图片 Artifact。字段名为兼容固定 renderer 保留，artifactPath 实际承载 Artifact ID。 */
export type SessionArtifactReadInput = {
  sessionId: string;
  artifactPath: string;
};

export type SessionArtifactReadResult = {
  name: string;
  relativePath: string;
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
  size: number;
  dataUrl?: string;
  error?:
    | "invalid_session"
    | "escapes_root"
    | "not_found"
    | "not_a_file"
    | "too_large"
    | "unsupported_format"
    | "read_failed";
};

/** 在桌面端为受控 Artifact 打开原生右键菜单。路径必须由 main 重新解析。 */
export type ArtifactContextMenuInput =
  | {
      kind: "session_image";
      sessionId: string;
      artifactPath: string;
    }
  | {
      kind: "workspace_file";
      workspaceRoot?: string;
      relativePath: string;
    };

export type ArtifactContextMenuResult = {
  shown: boolean;
  error?: "invalid_target" | "not_found" | "not_a_file";
};
