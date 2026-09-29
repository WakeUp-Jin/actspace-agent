import { describe, expect, it } from "vitest";
import type { MessageBlock } from "../session";
import { formatSessionTranscript } from "../session-transcript";

describe("formatSessionTranscript", () => {
  it("exports only user and assistant content plus attachment names", () => {
    const messages: MessageBlock[] = [
      {
        kind: "user",
        id: "user-1",
        content: "Please inspect this image.",
        createdAt: "2026-07-26T00:00:00.000Z",
        attachments: [
          { id: "attachment-1", kind: "image", name: "reference.png", path: "/private/reference.png" },
        ],
      },
      {
        kind: "thinking",
        id: "thinking-1",
        title: "Thinking",
        content: "Internal reasoning should not be copied.",
        createdAt: "2026-07-26T00:00:01.000Z",
        collapsedByDefault: true,
      },
      {
        kind: "tool",
        id: "tool-1",
        title: "read_file",
        content: "Private tool output",
        createdAt: "2026-07-26T00:00:02.000Z",
      },
      {
        kind: "assistant",
        id: "assistant-1",
        content: "The image contains a session menu.",
        createdAt: "2026-07-26T00:00:03.000Z",
      },
    ];

    expect(formatSessionTranscript("Session actions", messages)).toBe(
      "# Session actions\n\n" +
      "## User\n\n" +
      "Please inspect this image.\n\n" +
      "Attachments:\n- reference.png\n\n" +
      "## Assistant\n\n" +
      "The image contains a session menu.\n",
    );
  });

  it("lists referenced file paths and only counts quoted replies", () => {
    const transcript = formatSessionTranscript("Refs", [{
      kind: "user",
      id: "user-1",
      content: "Compare these.",
      createdAt: "2026-07-26T00:00:00.000Z",
      fileReferences: [{ relativePath: "src/a.ts", displayName: "a.ts" }],
      responseAnnotations: [{ annotationId: "ann", assistantMessageId: "v2-1", selectedText: "secret excerpt", startOffset: 0, endOffset: 14, prefixContext: "", suffixContext: "" }],
    }]);
    expect(transcript).toBe("# Refs\n\n## User\n\nCompare these.\n\nReferenced files:\n- src/a.ts\nQuoted replies: 1\n");
    expect(transcript).not.toContain("secret excerpt");
  });

  it("keeps an empty session transcript readable", () => {
    expect(formatSessionTranscript("  ", [])).toBe("# Untitled session\n");
  });
});
