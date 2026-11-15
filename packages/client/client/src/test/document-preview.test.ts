import { describe, expect, it } from "vitest";
import { createMessageBlocks } from "@actspace/shared";
import type { RuntimeToolView } from "@actspace/shared/runtime-v2";
import { toolPreview } from "../sessions/tool-card.js";
import { toolEntryToBlock } from "../live/stream-blocks.js";
import { documentFailureText } from "../sessions/tool-failure-text.js";

type Data = Parameters<typeof toolPreview>[2];
type Phase = Parameters<typeof toolPreview>[7];
const ROOT = "/work/repo";
const preview = (data: Data, phase: Phase = "finished", args: Record<string, unknown> = { path: "docs/季度报告.pdf" }, tool?: RuntimeToolView) =>
  toolPreview("read_document", tool, data, { args } as Parameters<typeof toolPreview>[3], undefined, "s", "r", phase, ROOT);
const output = (text: string) => [{ type: "text", text }];
const docDetail = (value: Record<string, unknown>) => [{ label: "document", value }];
const done = (summary: string, extra: Data = {}): Data => ({ status: "completed", summary, ...extra });

describe("read_document name", () => {
  it("takes the last segment of the path first, in either separator style", () => {
    expect(preview(done("other.pdf · 2 pages")).document?.name).toBe("季度报告.pdf");
    expect(preview(done("x · 1 page"), "finished", { path: "C:\\Users\\me\\deck.pptx" }).document?.name).toBe("deck.pptx");
  });

  it("then the summary, then the detail file name, then the running progress, then attachment", () => {
    expect(preview(done("报告 · 第一版.pdf · 2 pages", { detail: docDetail({ fileName: "detail.pdf" }) }), "finished", { artifact_id: "art-1" }).document)
      .toMatchObject({ name: "报告 · 第一版.pdf", stats: "2 pages" });
    expect(preview({ status: "failed", summary: "sealed.pdf", detail: docDetail({ fileName: "sealed.pdf" }), failure: { code: "DOCUMENT_PASSWORD_PROTECTED", message: "x" } }, "finished", { artifact_id: "art-1" }).document?.name).toBe("sealed.pdf");
    expect(preview({ summary: "upload.docx" }, "running", { artifact_id: "art-1" }).document?.name).toBe("upload.docx");
    expect(preview({ summary: "upload.docx" }, "prepared", { artifact_id: "art-1" }).document?.name).toBe("attachment");
    expect(preview({ status: "aborted", summary: "Reading the document was aborted." }, "finished", { artifact_id: "art-1" }).document?.name).toBe("attachment");
  });
});

describe("read_document while running", () => {
  it("reads Read <last segment> with a path", () => {
    expect(preview({}, "streaming")).toMatchObject({ displayText: "Read 季度报告.pdf", filePath: "docs/季度报告.pdf" });
    expect(preview({ summary: "季度报告.pdf" }, "running").displayText).toBe("Read 季度报告.pdf");
  });

  it("reads Read attachment until the progress message names the attachment", () => {
    expect(preview({}, "running", { artifact_id: "art-1" }).displayText).toBe("Read attachment");
    expect(preview({ summary: "季度报告.pdf" }, "running", { artifact_id: "art-1" }).displayText).toBe("Read 季度报告.pdf");
  });
});

describe("read_document when completed", () => {
  it.each([
    ["r.pdf · 2 pages", "2 pages"],
    ["r.pdf · 1 page", "1 page"],
    ["r.pdf · pages 31-45", "pages 31-45"],
    ["r.pdf · pages 7", "pages 7"],
  ])("splits %s into stats", (summary, stats) => {
    const row = preview(done(summary), "finished", { artifact_id: "a" });
    expect(row).toMatchObject({ displayText: summary, document: { name: "r.pdf", stats } });
  });

  it("has no stats when the summary does not match", () => {
    expect(preview(done("Tool completed")).document).toEqual({ name: "季度报告.pdf" });
  });

  it("previews page text only, up to 8 lines of 240 characters", () => {
    const text = [
      "Document: 季度报告.pdf (12 pages)",
      'Showing pages 1-2 of 12. To continue, call read_document again with pages "3-12".',
      "Pages recognized incompletely: 2.",
      "Long pages were split; page numbers here are positions in this output, not the document's own page numbers.",
      "",
      "--- Page 1 ---",
      "# 第三季度报告",
      "x".repeat(300),
      "",
      "--- Page 2 ---",
      ...Array.from({ length: 10 }, (_, index) => `line ${index + 1}`),
    ].join("\n");
    const lines = preview(done("季度报告.pdf · 12 pages", { modelOutput: output(text) })).resultPreview!;
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe("# 第三季度报告");
    expect(lines[1]).toBe(`${"x".repeat(237)}…`);
    expect(lines[2]).toBe("line 1");
    expect(lines.join("\n")).not.toMatch(/Document:|Showing pages|Pages recognized incompletely|Long pages were split|--- Page/);
  });

  it.each([
    [[3], 1, "第 3 页识别不完整，内容已截断。"],
    [[3, 13, 27], 3, "第 3、13、27 页识别不完整，内容已截断。"],
    [[1, 2, 3, 4, 5, 6], 6, "有 6 页识别不完整，内容已截断。"],
  ])("warns about incomplete pages %j", (incompletePages, incompletePageCount, warning) => {
    expect(preview(done("r.pdf · 30 pages", { detail: docDetail({ fileName: "r.pdf", incompletePages, incompletePageCount }) })).document?.warning).toBe(warning);
  });

  it("has no warning without detail or with no incomplete pages", () => {
    expect(preview(done("r.pdf · 30 pages")).document?.warning).toBeUndefined();
    expect(preview(done("r.pdf · 30 pages", { detail: docDetail({ incompletePages: [], incompletePageCount: 0 }) })).document?.warning).toBeUndefined();
  });
});

describe("read_document failures", () => {
  it.each([
    ["DOCUMENT_UNAVAILABLE", "文档解析已关闭或 DeepSeek 未连接。"],
    ["TOOL_SCOPE_DENIED", "文档解析已关闭或 DeepSeek 未连接。"],
    ["DOCUMENT_UNSUPPORTED_FORMAT", "只支持 PDF、Word 和 PPT 文件。"],
    ["DOCUMENT_TOO_LARGE", "文件超过 100 MB，DeepSeek 不接受。"],
    ["DOCUMENT_PASSWORD_PROTECTED", "文件设有打开密码，无法解析。去掉密码后再试。"],
    ["DOCUMENT_TOO_MANY_PAGES", "文档超过 1,000 页，DeepSeek 不接受。"],
    ["DOCUMENT_PARSE_FAILED", "DeepSeek 无法解析这个文件。"],
    ["DOCUMENT_TIMEOUT", "DeepSeek 在 180 秒内没有完成解析。"],
    ["DEEPSEEK_AUTH_FAILED", "DeepSeek API Key 无效或已被删除。"],
    ["DEEPSEEK_INSUFFICIENT_BALANCE", "DeepSeek 账户余额不足，文档没有解析。"],
    ["DEEPSEEK_RATE_LIMITED", "DeepSeek 请求过于频繁，稍后再试。"],
    ["SOMETHING_NEW", "Original message."],
  ])("shows %s as text", (code, text) => {
    const row = preview({ status: "failed", summary: "季度报告.pdf", failure: { code, message: "Original message." } });
    expect(row.document?.errorText).toBe(text);
    expect(row.resultPreview).toBeUndefined();
    expect(row.document?.stats).toBeUndefined();
  });

  it("shows denied as the scope text and a pre-execution failure as its message", () => {
    expect(preview({ status: "denied", failure: { code: "TOOL_SCOPE_DENIED", message: "Tool is not in scope" } }).document?.errorText).toBe("文档解析已关闭或 DeepSeek 未连接。");
    expect(preview({ status: "failed", summary: 'pages must be one page like "7"', failure: { code: "INVALID_ARGUMENTS", message: 'pages must be one page like "7"' } }).document?.errorText).toBe('pages must be one page like "7"');
    expect(documentFailureText(undefined, undefined)).toBe("");
  });

  it("has no error text when aborted", () => {
    expect(preview({ status: "aborted", summary: "季度报告.pdf", failure: { code: "TOOL_ABORTED", message: "Reading the document was aborted." } }).document).toEqual({ name: "季度报告.pdf" });
  });
});

describe("read_document paths and history", () => {
  it("shows a workspace path relative and an outside path absolute", () => {
    expect(preview({}, "running", { path: `${ROOT}/docs/a.pdf` }).filePath).toBe("docs/a.pdf");
    expect(preview({}, "running", { path: "/Users/me/Documents/b.pdf" }).filePath).toBe("/Users/me/Documents/b.pdf");
  });

  it("recovers name and stats for a deferred row from the summary, not the redacted args summary", () => {
    const tool = { state: "completed", summary: "季度报告.pdf · 124 pages", argsSummary: { text: "path=[PATH]", fields: [{ name: "path", value: "[PATH]", redacted: true }] }, detail: [], artifacts: [], modelOutput: null, failure: null } as unknown as RuntimeToolView;
    const row = preview({}, "finished", {}, tool);
    expect(row).toEqual({ kind: "read", filePath: "", displayText: "季度报告.pdf · 124 pages", document: { name: "季度报告.pdf", stats: "124 pages" } });
  });

  it("keeps document through the live and persisted projections", () => {
    const finished = preview(done("季度报告.pdf · 2 pages", { modelOutput: output("Document: x\n\n--- Page 1 ---\nhello") }));
    const live = toolEntryToBlock("call", { toolName: "read_document", preview: finished, finished: true }, "now", "run");
    const [persisted] = createMessageBlocks([{
      id: "result", type: "tool_result", schemaVersion: 2, sessionId: "session", agentRunId: "run", timestamp: "now",
      payload: { toolName: "read_document", ok: true, summary: "季度报告.pdf · 2 pages", uiPreview: finished },
    }]);
    expect(live).toMatchObject({ kind: "read", document: { name: "季度报告.pdf", stats: "2 pages" }, resultPreview: ["hello"], status: "completed" });
    expect(persisted).toMatchObject({ kind: "read", document: { name: "季度报告.pdf", stats: "2 pages" }, resultPreview: ["hello"] });

    const running = toolEntryToBlock("call", { toolName: "read_document", preview: preview({}, "running", { artifact_id: "a" }), finished: false }, "now", "run");
    expect(running).toMatchObject({ kind: "read", displayText: "Read attachment", status: "running" });
  });

  it("leaves read_file rows without document", () => {
    const row = toolPreview("read_file", undefined, done("Read a.ts"), { args: { path: "a.ts" } }, undefined, "s", "r");
    expect(row).not.toHaveProperty("document");
    const live = toolEntryToBlock("call", { toolName: "read_file", preview: row, finished: false }, "now", "run");
    expect(live).not.toHaveProperty("document");
    expect(live).toMatchObject({ displayText: "Read a.ts" });
  });
});
