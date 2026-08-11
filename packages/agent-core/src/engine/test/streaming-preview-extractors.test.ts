import { describe, expect, it } from "vitest";
import { extractStreamingPreview } from "../streaming-preview-extractors";

describe("extractStreamingPreview", () => {
  it("does not infer Todo arrays from partial JSON", () => {
    expect(extractStreamingPreview("todo", '{"todos":[{"content":"Half')).toEqual({
      kind: "todo",
      todos: [],
      totalCount: 0,
      completedCount: 0,
      revision: 0,
      displayText: "0 of 0 To-dos Completed",
    });
  });

  it("write extractor parses path and streamingContent", () => {
    const partial = '{"path":"/tmp/夜雨.md","content":"# 夜雨\\n半夜醒来';
    const preview = extractStreamingPreview("write", partial);
    expect(preview).toEqual({
      kind: "write",
      filePath: "/tmp/夜雨.md",
      additions: 0,
      deletions: 0,
      diff: "",
      collapsedLines: 0,
      streamingContent: "# 夜雨\n半夜醒来",
    });
  });

  it("write extractor handles no content yet", () => {
    const preview = extractStreamingPreview("write", '{"path":"/tmp/a.md"');
    expect(preview).toMatchObject({
      kind: "write",
      filePath: "/tmp/a.md",
      streamingContent: undefined,
    });
  });

  it("write extractor handles empty partial args (dispatched stage)", () => {
    const preview = extractStreamingPreview("write", "");
    expect(preview).toMatchObject({
      kind: "write",
      filePath: "",
      streamingContent: undefined,
    });
  });

  it("edit_diff extractor only extracts path, never content", () => {
    const partial = '{"path":"/x.ts","old_string":"foo","new_string":"bar"}';
    const preview = extractStreamingPreview("edit_diff", partial);
    expect(preview).toEqual({
      kind: "edit_diff",
      filePath: "/x.ts",
      additions: 0,
      deletions: 0,
      diff: "",
      collapsedLines: 0,
    });
    expect(preview).not.toHaveProperty("streamingContent");
  });

  it("read extractor extracts path", () => {
    const preview = extractStreamingPreview("read", '{"path":"/r.ts"}');
    expect(preview).toMatchObject({ kind: "read", filePath: "/r.ts" });
  });

  it("grep extractor extracts pattern and scope from glob", () => {
    const preview = extractStreamingPreview(
      "grep",
      '{"pattern":"foo","glob":"*.ts"}',
    );
    expect(preview).toMatchObject({
      kind: "grep",
      pattern: "foo",
      scope: "*.ts",
    });
  });

  it("grep extractor falls back to path for scope when glob absent", () => {
    const preview = extractStreamingPreview(
      "grep",
      '{"pattern":"foo","path":"/src"}',
    );
    expect(preview).toMatchObject({
      kind: "grep",
      pattern: "foo",
      scope: "/src",
    });
  });

  it("web_search extractor prefers url over query", () => {
    const url = extractStreamingPreview("web_search", '{"url":"https://x"}');
    expect(url).toMatchObject({ kind: "web_search", mode: "url", url: "https://x" });

    const query = extractStreamingPreview("web_search", '{"query":"latest news"}');
    expect(query).toMatchObject({ kind: "web_search", mode: "query", query: "latest news" });
  });

  it("image_generation extractor reads partial prompt, size and integer n", () => {
    const preview = extractStreamingPreview(
      "image_generation",
      '{"prompt":"three koi posters","size":"1024x1536","n":3',
    );
    expect(preview).toMatchObject({
      kind: "image_generation",
      status: "running",
      promptPreview: "three koi posters",
      size: "1024x1536",
      requestedCount: 3,
    });
  });

  it("bash extractor extracts command", () => {
    const preview = extractStreamingPreview("bash", '{"command":"ls -la"}');
    expect(preview).toMatchObject({
      kind: "bash",
      status: "running",
      command: "ls -la",
    });
  });

  it("delete extractor extracts path", () => {
    const preview = extractStreamingPreview("delete", '{"path":"/tmp/old.md"}');
    expect(preview).toEqual({
      kind: "delete",
      filePath: "/tmp/old.md",
      displayText: "",
      status: "running",
    });
  });

  it("agent extractor extracts description for a running Agent preview", () => {
    const preview = extractStreamingPreview("agent", '{"description":"Explore renderer flow","prompt":"Inspect UI"}');
    expect(preview).toEqual({
      kind: "agent",
      description: "Explore renderer flow",
      status: "running",
      subagentType: "explore",
      displayText: "Explore renderer flow",
    });
  });

  it("browser category extractor exposes action and target", () => {
    const preview = extractStreamingPreview(
      "browser_locator",
      '{"action":"click","selector":"#submit"}',
    );
    expect(preview).toEqual({
      kind: "generic",
      title: "Browser Locator",
      content: "click · #submit",
    });
  });

  it("generic kind returns empty generic preview", () => {
    const preview = extractStreamingPreview("generic", '{"anything":"x"}');
    expect(preview).toEqual({ kind: "generic", title: "", content: "" });
  });
});
