import { describe, expect, it } from "vitest";
import { attachmentDialogFilters } from "../runtime-v2/attachment-dialog-filters";

describe("attachmentDialogFilters", () => {
  it("takes any file for a remote target, even when documents are asked for", () => {
    expect(attachmentDialogFilters({ remote: true })).toEqual([{ name: "Files", extensions: ["*"] }]);
    expect(attachmentDialogFilters({ remote: true, documents: true })).toEqual([{ name: "Files", extensions: ["*"] }]);
  });

  it("takes images and the five document types for documents", () => {
    expect(attachmentDialogFilters({ documents: true })[0]?.extensions).toEqual(["png", "jpg", "jpeg", "webp", "gif", "pdf", "doc", "docx", "ppt", "pptx"]);
  });

  it("keeps the Chat set otherwise", () => {
    expect(attachmentDialogFilters({})[0]?.extensions).toEqual(["png", "jpg", "jpeg", "webp", "gif", "txt", "md", "markdown", "json", "csv"]);
  });
});
