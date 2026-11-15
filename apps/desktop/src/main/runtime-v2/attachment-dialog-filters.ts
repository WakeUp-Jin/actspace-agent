export type AttachmentDialogFilter = { readonly name: string; readonly extensions: string[] };

/**
 * File picker filters for the composer's 「图片与文件」: a remote target takes any file; a local Agent / Plan with document
 * parsing takes images and the five document types; otherwise the Chat attachment set.
 */
export function attachmentDialogFilters(input: { readonly remote?: boolean; readonly documents?: boolean }): AttachmentDialogFilter[] {
  if (input.remote === true) return [{ name: "Files", extensions: ["*"] }];
  if (input.documents === true) return [{ name: "Images and documents", extensions: ["png", "jpg", "jpeg", "webp", "gif", "pdf", "doc", "docx", "ppt", "pptx"] }];
  return [{ name: "Chat attachments", extensions: ["png", "jpg", "jpeg", "webp", "gif", "txt", "md", "markdown", "json", "csv"] }];
}
