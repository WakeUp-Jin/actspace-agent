import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { appendMockMessage, type MockDb, type MockSession } from "../mock-db";
import { lastRunId, seedSession } from "./seed";

/**
 * DeepSeek 工具（agent-deep-search-and-document-parsing.md §9）：一条完成的 `Deep Search`（6 个搜索词、11 个来源、
 * 1 个打不开的网页）、一条余额不足失败的、一条中止的；回复里有两处行内链接。PB 在这里加文档的行。
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

function appendTool(db: MockDb, session: MockSession, runId: string, result: Record<string, RuntimeJsonValue>): void {
  const message = appendMockMessage(db, session, "tool", "", runId);
  session.messages[session.messages.length - 1] = { ...message, tool: { name: "deep_search", args: { question: QUESTION }, result } };
}

const failed = (code: string, message: string, status = "failed"): Record<string, RuntimeJsonValue> => ({
  status,
  summary: message,
  modelOutput: [{ type: "text", text: message }],
  failure: { code, message, retryable: false },
});

export function deepseekToolsScenario({ db }: MockClock): MockHandlers | void {
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
