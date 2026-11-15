import { extname } from "node:path";

/**
 * The media type stored with an imported Agent / Plan attachment. Only images change how the attachment reaches the
 * model; documents stay `kind: "file"` and read_document sniffs their bytes, not this type.
 */
export function attachmentMediaType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".pdf": return "application/pdf";
    case ".doc": return "application/msword";
    case ".docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".ppt": return "application/vnd.ms-powerpoint";
    case ".pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".json": return "application/json";
    case ".csv": return "text/csv";
    case ".md": return "text/markdown";
    default: return "text/plain";
  }
}
