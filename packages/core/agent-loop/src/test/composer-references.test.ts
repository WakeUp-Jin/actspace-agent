import { expect, it } from "vitest";
import type { LlmMessage } from "@actspace/llm-service";
import { runToolStreamFixture } from "../testing.js";

const excerpt = {
  type: "response-excerpt", annotationId: "ann_1", assistantMessageId: "v2-5",
  selectedText: "先读配置，再启动服务。", startOffset: 0, endOffset: 11, prefixContext: "", suffixContext: "", comment: "顺序能反过来吗？",
};

it("renders file references once and excerpts as readable text, and counts them in the request context", async () => {
  const requests: (readonly LlmMessage[])[] = [];
  const run = await runToolStreamFixture({
    terminalOnly: true,
    content: [
      { type: "text", text: "看一下" },
      { type: "file-reference", relativePath: "src/a.ts", displayName: "a.ts" },
      { type: "file-reference", relativePath: "docs/b.md", displayName: "b.md" },
      excerpt,
    ],
    onMessages: (messages) => requests.push(messages),
  });
  const user = requests[0]!.find((message) => message.role === "user")!;
  const texts = (user.content as readonly { type: string; text?: string }[]).filter((block) => block.type === "text").map((block) => block.text);
  expect(texts.slice(0, 3)).toEqual([
    "看一下",
    [
      '<workspace_file_reference path="src/a.ts" />',
      '<workspace_file_reference path="docs/b.md" />',
      "The user referenced the workspace file(s) above. They have not been read; use read tools if their content is needed.",
    ].join("\n"),
    "<quoted_assistant_excerpt>\n先读配置，再启动服务。\n</quoted_assistant_excerpt>\n<user_comment>顺序能反过来吗？</user_comment>",
  ]);
  const serialized = JSON.stringify(user.content);
  expect(serialized).not.toContain("v2-5");
  expect(serialized).not.toContain("ann_1");
  expect(serialized).not.toContain("\"file-reference\"");

  const contextEvent = run.journal.find((event) => event.type === "request/context");
  expect(JSON.stringify(contextEvent)).toContain("先读配置，再启动服务。");
  expect(JSON.stringify(contextEvent)).toContain("workspace_file_reference");
  expect(run.result.reason).toBe("completed");
});
