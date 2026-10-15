import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { appendMockMessage, type MockDb, type MockSession } from "../mock-db";
import { seedSession } from "./seed";

/**
 * 轮尾卡片：第 1 轮改 2 个文件、交付 1 个；第 2 轮最终改 6 个文件（另有新建后删除的临时脚本）、交付 5 个；第 3 轮只改报告 1 个文件。
 * 用来检查改动卡的折叠、悬停 diff、右侧「第 N 轮改动」和交付卡的网格、折叠、打开方式。
 */

type FileEdit = { readonly tool: "write_file" | "edit_file"; readonly path: string; readonly diff: string };

const FILES: Record<string, string> = {
  "docs/report.md": "# 季度报告\n\n- 收入同比增长 18%\n- 新增客户 42 家\n",
  "docs/summary.csv": "month,revenue\n7,120\n8,135\n9,142\n",
};

function created(path: string, lines: readonly string[]): FileEdit {
  return { tool: "write_file", path, diff: [`--- a/${path}`, `+++ b/${path}`, `@@ -1,1 +1,${lines.length} @@`, "-", ...lines.map((line) => `+${line}`)].join("\n") };
}

function edited(path: string, start: number, context: string, removed: readonly string[], added: readonly string[]): FileEdit {
  const oldLines = removed.length + 1;
  const newLines = added.length + 1;
  return { tool: "edit_file", path, diff: [`--- a/${path}`, `+++ b/${path}`, `@@ -${start},${oldLines} +${start},${newLines} @@`, ` ${context}`, ...removed.map((line) => `-${line}`), ...added.map((line) => `+${line}`)].join("\n") };
}

function appendTool(db: MockDb, session: MockSession, runId: string, name: string, args: Record<string, RuntimeV2JsonValue>, result: Record<string, RuntimeV2JsonValue>): void {
  const message = appendMockMessage(db, session, "tool", "", runId);
  session.messages[session.messages.length - 1] = { ...message, role: "tool", tool: { name, args, result } };
}

function appendEdit(db: MockDb, session: MockSession, runId: string, edit: FileEdit): void {
  const additions = edit.diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const deletions = edit.tool === "write_file" ? 0 : edit.diff.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  appendTool(db, session, runId, edit.tool, { path: edit.path }, {
    status: "completed",
    summary: `${edit.tool === "write_file" ? "Wrote" : "Edited"} ${edit.path}`,
    modelOutput: [{ type: "text", text: edit.diff }],
    detail: [{ label: "result", value: { path: edit.path, additions, deletions } }],
  });
}

function appendPresent(db: MockDb, session: MockSession, runId: string, files: readonly { path: string; description?: string }[]): void {
  appendTool(db, session, runId, "present", { files: files as RuntimeV2JsonValue }, {
    status: "completed",
    summary: `Presented ${files.length} ${files.length === 1 ? "file" : "files"}`,
    detail: [{ label: "present", value: { files: files as RuntimeV2JsonValue } }],
  });
}

const PRICING = { version: 1, basis: "estimated", reason: null, pricingSnapshot: { providerId: "deepseek", connectionId: "deepseek:default", modelKey: "deepseek:deepseek-flash", apiModel: "deepseek-flash", currency: "USD" } };

/** 最终回复带上本轮用量，回复尾部才会出现「用量 … tok」胶囊。 */
function appendReply(db: MockDb, session: MockSession, runId: string, content: string, usage: Record<string, RuntimeV2JsonValue>): void {
  const message = appendMockMessage(db, session, "assistant", content, runId);
  session.messages[session.messages.length - 1] = { ...message, usage };
}

function lastRun(session: MockSession): string {
  return session.messages[session.messages.length - 1].agentRunId;
}

export function turnDeliverablesScenario({ db }: MockClock): MockHandlers | void {
  const session = seedSession(db, { title: "整理季度报告", minutesAgo: 1, turns: [["把季度数据整理成报告，顺手修一下导出脚本的空行问题。", null]] });
  let run = lastRun(session);
  appendEdit(db, session, run, edited("scripts/export.ts", 12, "const rows = await loadRows();", ["const text = rows.join(\"\\n\");"], ["const text = rows.filter(Boolean).join(\"\\n\");"]));
  appendEdit(db, session, run, created("docs/report.md", FILES["docs/report.md"].trimEnd().split("\n")));
  appendPresent(db, session, run, [{ path: "docs/report.md", description: "季度报告（终稿）" }]);
  appendReply(db, session, run, "报告已经写好，导出脚本会跳过空行了。", { inputTokens: 20_462, outputTokens: 3_061, cacheReadTokens: 64_512, cacheWriteTokens: 0, reasoningTokens: 1_204, cost: 0.0102, costCurrency: "USD", costProvenance: PRICING });

  run = db.nextId("seed-run");
  appendMockMessage(db, session, "user", "再补一份 CSV 汇总和图表配置，把相关模块一起更新。", run);
  for (const edit of [
    edited("src/report/build.ts", 3, "import { loadRows } from \"./rows\";", [], ["import { toCsv } from \"./csv\";"]),
    created("src/report/csv.ts", ["export function toCsv(rows: string[][]): string {", "  return rows.map((row) => row.join(\",\")).join(\"\\n\");", "}"]),
    edited("src/report/chart.ts", 20, "export const chart = {", ["  type: \"line\","], ["  type: \"bar\",", "  stacked: true,"]),
    edited("src/report/index.ts", 1, "export * from \"./build\";", [], ["export * from \"./csv\";"]),
    created("scripts/tmp-check.mjs", ["console.log(\"check\");"]),
    created("docs/summary.csv", FILES["docs/summary.csv"].trimEnd().split("\n")),
    edited("README.md", 8, "## 报告", ["运行 `pnpm export`。"], ["运行 `pnpm export` 生成报告和 CSV 汇总。"]),
  ]) appendEdit(db, session, run, edit);
  appendTool(db, session, run, "delete_file", { path: "scripts/tmp-check.mjs" }, { status: "completed", summary: "Deleted scripts/tmp-check.mjs", detail: [{ label: "result", value: { path: "scripts/tmp-check.mjs" } }] });
  appendPresent(db, session, run, [
    { path: "docs/summary.csv", description: "月度收入汇总" },
    { path: "docs/report.md", description: "季度报告（更新）" },
    { path: "docs/chart.json", description: "图表配置" },
    { path: "docs/slides.pptx", description: "汇报幻灯片" },
    { path: "docs/appendix.pdf" },
  ]);
  appendReply(db, session, run, "CSV 汇总和图表配置都补上了，交付文件列在下面。", { inputTokens: 8_120, outputTokens: 2_410, cacheReadTokens: 152_300, cacheWriteTokens: 0, reasoningTokens: 0 });

  run = db.nextId("seed-run");
  appendMockMessage(db, session, "user", "只把季度报告的标题标为终稿。", run);
  appendEdit(db, session, run, { tool: "edit_file", path: "docs/report.md", diff: "--- a/docs/report.md\n+++ b/docs/report.md\n@@ -1,1 +1,1 @@\n-# 季度报告\n+# 季度报告（终稿）" });
  appendPresent(db, session, run, [{ path: "docs/report.md", description: "单文件改动验收：报告终稿" }]);
  appendReply(db, session, run, "只更新了报告标题，本轮改动 1 个文件。", { inputTokens: 1_279, outputTokens: 92, cacheReadTokens: 9_344, cacheWriteTokens: 0, reasoningTokens: 0, cost: 0.000550164, costCurrency: "USD", costProvenance: PRICING });

  return {
    workspaces: {
      readFile: async ({ relativePath }) => {
        const content = relativePath === "docs/report.md" ? FILES[relativePath].replace("# 季度报告", "# 季度报告（终稿）") : FILES[relativePath];
        return content === undefined
          ? { relativePath, renderKind: "text", size: 0, mtimeMs: 0, error: "not_found" }
          : { relativePath, renderKind: relativePath.endsWith(".md") ? "markdown" : "text", content, size: content.length, mtimeMs: 0 };
      },
    },
  };
}
