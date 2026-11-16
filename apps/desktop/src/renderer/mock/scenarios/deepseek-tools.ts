import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { appendMockMessage, type MockDb, type MockSession } from "../mock-db";
import { lastRunId, seedSession } from "./seed";

/**
 * DeepSeek 工具（agent-deep-search-and-document-parsing.md §9）：一条完成的 `Deep Search`（6 个搜索词、11 个来源、
 * 1 个打不开的网页）、一条余额不足失败的、一条中止的；回复里有两处行内链接。另一个会话是文档解析的行（§9.2）：
 * 带 PDF 附件的提问、读附件 2 页、124 页长文档的整份与两段页码范围、有识别不完整页的一行、两种失败。文档内容是占位文字。
 */

const QUESTION = "2026 年全球电动车销量和主要厂商份额";
const QUERIES = [
  "2026 global EV sales",
  "2026 电动车 全球 销量",
  "BYD 2026 sales share",
  "Tesla 2026 deliveries",
  "IEA Global EV Outlook 2026",
  "2026 欧洲 电动车 渗透率",
];
const SOURCES = [
  { title: "Global EV Outlook 2026", url: "https://www.iea.org/reports/global-ev-outlook-2026", site: "iea.org" },
  { title: "Tesla Q3 2026 Vehicle Production & Deliveries", url: "https://ir.tesla.com/press-release/tesla-q3-2026-deliveries", site: "ir.tesla.com" },
  { title: "比亚迪 2026 年 10 月产销快报", url: "https://www.bydglobal.com/cn/news/2026-11-01.html", site: "bydglobal.com" },
  { title: "Global EV sales up 24% in first three quarters", url: "https://www.reuters.com/business/autos/global-ev-sales-2026-10-14/", site: "reuters.com" },
  { title: "Europe's EV share climbs past 25%", url: "https://www.acea.auto/pc-registrations/2026-10/", site: "acea.auto" },
  { title: "China NEV retail sales, October 2026", url: "https://www.cpcaauto.com/news/2026-11-08", site: "cpcaauto.com" },
  { title: "EV Volumes: 2026 market share by OEM", url: "https://www.ev-volumes.com/news/2026-oem-share/", site: "ev-volumes.com" },
  { title: "US EV sales slow as credits end", url: "https://www.coxautoinc.com/market-insights/q3-2026-ev-sales/", site: "coxautoinc.com" },
  { title: "Hyundai-Kia global EV deliveries 2026", url: "https://www.hyundai.news/eu/articles/press-releases/2026-ev.html", site: "hyundai.news" },
  { title: "BloombergNEF Electric Vehicle Outlook 2026", url: "https://about.bnef.com/electric-vehicle-outlook/", site: "about.bnef.com" },
  { title: "Volkswagen Group deliveries Q3 2026", url: "https://www.volkswagen-group.com/en/press-releases/q3-2026-deliveries", site: "volkswagen-group.com" },
];

function appendTool(db: MockDb, session: MockSession, runId: string, result: Record<string, RuntimeJsonValue>, name = "deep_search", args: Record<string, RuntimeJsonValue> = { question: QUESTION }): void {
  const message = appendMockMessage(db, session, "tool", "", runId);
  session.messages[session.messages.length - 1] = { ...message, tool: { name, args, result } };
}

const failed = (code: string, message: string, status = "failed"): Record<string, RuntimeJsonValue> => ({
  status,
  summary: message,
  modelOutput: [{ type: "text", text: message }],
  failure: { code, message, retryable: false },
});

export function deepseekToolsScenario({ db }: MockClock): MockHandlers | void {
  seedDocumentSession(db);
  const session = seedSession(db, {
    title: "电动车销量调研",
    minutesAgo: 4,
    turns: [[`查一下${QUESTION}。`, null]],
  });
  const runId = lastRunId(session);
  appendTool(db, session, runId, {
    status: "completed",
    summary: "6 searches · 11 sources",
    modelOutput: [{ type: "text", text: "- 2026 年前三季度全球电动车销量约 1,420 万辆 [1][4]" }],
    detail: [{
      label: "deep-search",
      value: {
        queries: QUERIES,
        sources: SOURCES,
        failedPages: [{ url: "https://www.marklines.com/en/statistics/flash_sales/2026", code: "timeout" }],
      },
    }],
  });
  appendTool(db, session, runId, failed("DEEPSEEK_INSUFFICIENT_BALANCE", "The DeepSeek account balance is insufficient (HTTP 402)."));
  appendTool(db, session, runId, failed("TOOL_ABORTED", "Deep search was aborted.", "aborted"));
  appendMockMessage(
    db,
    session,
    "assistant",
    [
      "2026 年前三季度全球电动车销量约 **1,420 万辆**，同比增长 24%（[IEA](https://www.iea.org/reports/global-ev-outlook-2026)）。",
      "",
      "- 比亚迪仍居第一，份额约 22%；特斯拉第二，约 11%（[EV Volumes](https://www.ev-volumes.com/news/2026-oem-share/)）。",
      "- 欧洲渗透率超过 25%，美国因补贴退坡增速放缓。",
    ].join("\n"),
    runId,
  );
}

const REPORT = "季度经营报告.pdf";
const LONG_DOC = "docs/产品设计手册.pdf";

/** The text `read_document` hands the model: header lines, then `--- Page n ---` and the page. Placeholder content. */
function documentText(name: string, total: number, from: number, to: number, pages: readonly string[]): string {
  const head = [`Document: ${name} (${total} pages)`];
  if (from !== 1 || to !== total) head.push(`Showing pages ${from}-${to} of ${total}.${to < total ? ` To continue, call read_document again with pages "${to + 1}-${total}".` : ""}`);
  return `${head.join("\n")}\n\n${pages.map((page, index) => `--- Page ${from + index} ---\n${page}`).join("\n\n")}`;
}

function documentResult(summary: string, fileName: string, total: number, from: number, to: number, pages: readonly string[], incompletePages: readonly number[] = []): Record<string, RuntimeJsonValue> {
  return {
    status: "completed",
    summary,
    modelOutput: [{ type: "text", text: documentText(fileName, total, from, to, pages) }],
    detail: [{ label: "document", value: { fileName, pageCount: total, range: { from, to }, incompletePages: [...incompletePages], incompletePageCount: incompletePages.length } }],
  };
}

function documentFailure(fileName: string, code: string, message: string): Record<string, RuntimeJsonValue> {
  return { status: "failed", summary: fileName, modelOutput: [{ type: "text", text: message }], failure: { code, message, retryable: false }, detail: [{ label: "document", value: { fileName } }] };
}

function seedDocumentSession(db: MockDb): void {
  const session = seedSession(db, { title: "读季度报告和设计手册", minutesAgo: 2, turns: [] });
  const runId = db.nextId("seed-run");
  const prompt = "帮我读一下这份季度报告，再看看设计手册第 31 页往后讲了什么。";
  const ask = appendMockMessage(db, session, "user", prompt, runId);
  session.messages[session.messages.length - 1] = {
    ...ask,
    contentBlocks: [{ type: "text", text: prompt }, { type: "artifact", label: REPORT, artifact: { artifactId: "art-report", mediaType: "application/pdf" } }],
  };
  appendTool(db, session, runId, documentResult(`${REPORT} · 2 pages`, REPORT, 2, 1, 2, [
    "# 第三季度经营报告\n\n本季度收入较上季度增长，主要来自新客户。\n\n| 指标 | 本季度 | 上季度 |\n| --- | --- | --- |\n| 收入 | 120 | 100 |",
    "## 下季度计划\n\n- 扩充销售团队\n- 上线新版本",
  ]), "read_document", { artifact_id: "art-report" });
  const manual = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `## 第 ${from + index} 节\n\n这一页是占位文字，说明手册第 ${from + index} 页的内容。`);
  appendTool(db, session, runId, documentResult("产品设计手册.pdf · 124 pages", "产品设计手册.pdf", 124, 1, 30, manual(1, 30)), "read_document", { path: LONG_DOC });
  appendTool(db, session, runId, documentResult("产品设计手册.pdf · pages 31-45", "产品设计手册.pdf", 124, 31, 45, manual(31, 45)), "read_document", { path: LONG_DOC, pages: "31-45" });
  appendTool(db, session, runId, documentResult("产品设计手册.pdf · pages 46-60", "产品设计手册.pdf", 124, 46, 60, manual(46, 60)), "read_document", { path: LONG_DOC, pages: "46-60" });
  appendTool(db, session, runId, documentResult("扫描合同.pdf · 20 pages", "扫描合同.pdf", 20, 1, 20, manual(1, 20), [13]), "read_document", { path: "docs/扫描合同.pdf" });
  appendTool(db, session, runId, documentFailure("加密附件.pdf", "DOCUMENT_PASSWORD_PROTECTED", "The document is password-protected and cannot be parsed. Ask the user to remove the password."), "read_document", { path: "docs/加密附件.pdf" });
  appendTool(db, session, runId, documentFailure("全年归档.pdf", "DOCUMENT_TOO_MANY_PAGES", "The document has more than 1,000 pages; DeepSeek accepts at most 1,000."), "read_document", { path: "docs/全年归档.pdf" });
  appendMockMessage(db, session, "assistant", "季度报告显示本季度收入较上季度增长；设计手册第 31–60 页讲的是各节的占位说明。加密附件需要先去掉密码，全年归档超过 1,000 页，需要拆开再读。", runId);
}
