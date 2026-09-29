import { describe, expect, it } from "vitest";
import {
  COMPOSER_REFERENCE_LIMITS,
  fileReferenceBlocks,
  formatComposerReferenceIssue,
  normalizeWorkspaceRelativePath,
  readFileReferenceBlocks,
  readResponseExcerptBlocks,
  renderFileReferencesForModel,
  renderResponseExcerptForModel,
  responseExcerptBlocks,
  validateFileReferences,
  validateResponseAnnotations,
  type ResponseAnnotationReference,
} from "../composer-content";

function annotation(overrides: Partial<ResponseAnnotationReference> = {}): ResponseAnnotationReference {
  return {
    annotationId: "ann_1",
    assistantMessageId: "v2-12",
    selectedText: "选中的一段话",
    startOffset: 4,
    endOffset: 10,
    prefixContext: "前文",
    suffixContext: "后文",
    ...overrides,
  };
}

describe("normalizeWorkspaceRelativePath", () => {
  it.each([
    ["src/a.ts", "src/a.ts"],
    ["./src/a.ts", "src/a.ts"],
    ["src\\components\\a.ts", "src/components/a.ts"],
    ["src//a.ts", "src/a.ts"],
    ["docs/中文 文件.md", "docs/中文 文件.md"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeWorkspaceRelativePath(input)).toBe(expected);
  });

  it.each([
    "",
    "/etc/passwd",
    "C:\\Windows\\x",
    "\\\\server\\share",
    "../outside",
    "a/../../x",
    "a/./b",
    "file:///etc/passwd",
    "https://example.com/a",
    "src/a\0.ts",
    `${"a/".repeat(600)}x`,
  ])("rejects %j", (input) => {
    expect(normalizeWorkspaceRelativePath(input)).toBeNull();
  });
});

describe("validateFileReferences", () => {
  it("normalizes, dedupes and keeps order", () => {
    const result = validateFileReferences([
      { relativePath: "./src/b.ts", displayName: "b.ts" },
      { relativePath: "src/a.ts", displayName: "a.ts" },
      { relativePath: "src\\b.ts", displayName: "b.ts" },
    ]);
    expect(result).toEqual({ ok: true, value: [
      { relativePath: "src/b.ts", displayName: "b.ts" },
      { relativePath: "src/a.ts", displayName: "a.ts" },
    ] });
  });

  it("falls back to the basename when displayName is blank", () => {
    expect(validateFileReferences([{ relativePath: "src/a.ts", displayName: " " }])).toEqual({ ok: true, value: [{ relativePath: "src/a.ts", displayName: "a.ts" }] });
  });

  it("treats a missing field as no references", () => {
    expect(validateFileReferences(undefined)).toEqual({ ok: true, value: [] });
  });

  it("rejects malformed input and escaping paths with the failing index", () => {
    expect(validateFileReferences("src/a.ts")).toMatchObject({ ok: false, issue: { code: "invalid_reference", kind: "file" } });
    expect(validateFileReferences([{ relativePath: "src/a.ts" }])).toMatchObject({ ok: false, issue: { code: "invalid_reference", index: 0 } });
    expect(validateFileReferences([
      { relativePath: "src/a.ts", displayName: "a.ts" },
      { relativePath: "../secret", displayName: "secret" },
    ])).toMatchObject({ ok: false, issue: { code: "invalid_reference", kind: "file", index: 1, relativePath: "../secret" } });
  });

  it("limits the number of distinct references", () => {
    const references = Array.from({ length: COMPOSER_REFERENCE_LIMITS.maxFileReferences + 1 }, (_, index) => ({ relativePath: `src/${index}.ts`, displayName: `${index}.ts` }));
    expect(validateFileReferences(references)).toMatchObject({ ok: false, issue: { code: "too_many_references", kind: "file", limit: 20 } });
    expect(validateFileReferences(references.slice(0, 20))).toMatchObject({ ok: true });
  });
});

describe("validateResponseAnnotations", () => {
  it("accepts a valid annotation and trims the comment", () => {
    expect(validateResponseAnnotations([annotation({ comment: "  请解释  " })])).toEqual({ ok: true, value: [annotation({ comment: "请解释" })] });
  });

  it("drops a blank comment", () => {
    const result = validateResponseAnnotations([annotation({ comment: "   " })]);
    expect(result.ok && result.value[0]).not.toHaveProperty("comment");
  });

  it("dedupes by source message and range", () => {
    const result = validateResponseAnnotations([annotation(), annotation({ annotationId: "ann_2" }), annotation({ annotationId: "ann_3", startOffset: 0 })]);
    expect(result.ok && result.value.map((item) => item.annotationId)).toEqual(["ann_1", "ann_3"]);
  });

  it.each([
    ["start equals end", { startOffset: 5, endOffset: 5 }],
    ["start after end", { startOffset: 6, endOffset: 5 }],
    ["negative start", { startOffset: -1 }],
    ["non-integer offset", { endOffset: 5.5 }],
    ["blank text", { selectedText: "  \n " }],
    ["missing message id", { assistantMessageId: "" }],
    ["oversized context", { prefixContext: "x".repeat(65) }],
  ])("rejects %s", (_label, overrides) => {
    expect(validateResponseAnnotations([annotation(overrides as Partial<ResponseAnnotationReference>)])).toMatchObject({ ok: false, issue: { code: "invalid_reference", kind: "annotation", index: 0 } });
  });

  it("measures text and comment limits in code points", () => {
    const emoji = "😀";
    expect(validateResponseAnnotations([annotation({ selectedText: emoji.repeat(8000) })])).toMatchObject({ ok: true });
    expect(validateResponseAnnotations([annotation({ selectedText: `${emoji.repeat(8000)}中` })])).toMatchObject({ ok: false, issue: { code: "annotation_text_too_long", limit: 8000 } });
    expect(validateResponseAnnotations([annotation({ comment: "评".repeat(2000) })])).toMatchObject({ ok: true });
    expect(validateResponseAnnotations([annotation({ comment: "评".repeat(2001) })])).toMatchObject({ ok: false, issue: { code: "annotation_comment_too_long", limit: 2000 } });
  });

  it("limits the number of distinct annotations", () => {
    const annotations = Array.from({ length: 21 }, (_, index) => annotation({ annotationId: `ann_${index}`, startOffset: index, endOffset: index + 1 }));
    expect(validateResponseAnnotations(annotations)).toMatchObject({ ok: false, issue: { code: "too_many_references", kind: "annotation", limit: 20 } });
  });
});

describe("content blocks", () => {
  it("round-trips both block kinds and ignores unrelated or malformed blocks", () => {
    const files = [{ relativePath: "src/a.ts", displayName: "a.ts" }];
    const annotations = [annotation({ comment: "为什么" }), annotation({ annotationId: "ann_2", startOffset: 20, endOffset: 25 })];
    const content = [
      { type: "text", text: "请看" },
      ...fileReferenceBlocks(files),
      ...responseExcerptBlocks(annotations),
      { type: "artifact", artifact: { artifactId: "a1", mediaType: "image/png" }, label: "shot.png" },
      { type: "file-reference", relativePath: 42 },
      { type: "response-excerpt", annotationId: "broken" },
      "stray",
    ];
    expect(readFileReferenceBlocks(content)).toEqual(files);
    expect(readResponseExcerptBlocks(content)).toEqual(annotations);
  });

  it("reads nothing from plain string content", () => {
    expect(readFileReferenceBlocks("hello @src/a.ts")).toEqual([]);
    expect(readResponseExcerptBlocks("hello")).toEqual([]);
  });
});

describe("model rendering", () => {
  it("renders file references once with a single note", () => {
    expect(renderFileReferencesForModel([{ relativePath: "src/a.ts" }, { relativePath: "docs/说明 \"x\".md" }])).toBe([
      '<workspace_file_reference path="src/a.ts" />',
      '<workspace_file_reference path="docs/说明 \\"x\\".md" />',
      "The user referenced the workspace file(s) above. They have not been read; use read tools if their content is needed.",
    ].join("\n"));
    expect(renderFileReferencesForModel([])).toBe("");
  });

  it("renders an excerpt with and without a comment and never exposes ids or offsets", () => {
    expect(renderResponseExcerptForModel(annotation())).toBe("<quoted_assistant_excerpt>\n选中的一段话\n</quoted_assistant_excerpt>");
    const withComment = renderResponseExcerptForModel(annotation({ comment: "请解释这里" }));
    expect(withComment).toBe("<quoted_assistant_excerpt>\n选中的一段话\n</quoted_assistant_excerpt>\n<user_comment>请解释这里</user_comment>");
    expect(withComment).not.toContain("v2-12");
    expect(withComment).not.toContain("ann_1");
  });
});

describe("formatComposerReferenceIssue", () => {
  it("names the file when known", () => {
    expect(formatComposerReferenceIssue({ code: "file_not_found", kind: "file", relativePath: "src/a.ts" })).toContain("“src/a.ts”");
    expect(formatComposerReferenceIssue({ code: "annotation_source_missing", kind: "annotation" })).toContain("回复");
  });
});
