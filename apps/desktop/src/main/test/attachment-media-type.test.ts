import { describe, expect, it } from "vitest";
import { attachmentMediaType } from "../runtime-v2/attachment-media-type";

describe("attachmentMediaType", () => {
  it.each([
    ["a.png", "image/png"], ["a.jpg", "image/jpeg"], ["a.jpeg", "image/jpeg"], ["a.webp", "image/webp"], ["a.gif", "image/gif"],
    ["a.pdf", "application/pdf"], ["a.json", "application/json"], ["a.csv", "text/csv"], ["a.md", "text/markdown"],
    ["a.doc", "application/msword"],
    ["a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["a.ppt", "application/vnd.ms-powerpoint"],
    ["a.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ["REPORT.DOCX", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["Deck.PPTX", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ["a.xlsx", "text/plain"], ["notes", "text/plain"], ["a.txt", "text/plain"],
  ])("%s → %s", (path, mediaType) => {
    expect(attachmentMediaType(path)).toBe(mediaType);
  });
});
