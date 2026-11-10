import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { appendMockMessage, type MockDb, type MockSession } from "../mock-db";
import { lastRunId, seedSession } from "./seed";

/**
 * 脚本执行：模型用随包 Python 处理用户的 PDF。第 1 轮一条内联 heredoc（> 12 行，详情里折叠）和一条脚本文件命令
 * （文件名可点开）；第 2 轮停在一条内联脚本的审批上。用来检查 Bash 卡片的「Python 脚本（N 行）」摘要、代码块和审批摘要。
 */

const EXTRACT_SCRIPT = [
  "import pdfplumber",
  "from openpyxl import Workbook",
  "",
  "wb = Workbook()",
  "ws = wb.active",
  "ws.title = 'tables'",
  "with pdfplumber.open('reports/q3.pdf') as pdf:",
  "    for page_no, page in enumerate(pdf.pages, start=1):",
  "        for table in page.extract_tables():",
  "            ws.append([f'page {page_no}'])",
  "            for row in table:",
  "                ws.append([cell or '' for cell in row])",
  "            ws.append([])",
  "wb.save('reports/q3-tables.xlsx')",
  "print('saved', ws.max_row, 'rows')",
].join("\n");

const INLINE_COMMAND = `actspace-python - <<'PY'\n${EXTRACT_SCRIPT}\nPY`;
const SUMMARY_COMMAND = `actspace-python - <<'PY'\nfrom openpyxl import load_workbook\nws = load_workbook('reports/q3-tables.xlsx').active\nprint(ws.max_row, 'rows')\nPY`;

function appendTool(
  db: MockDb,
  session: MockSession,
  runId: string,
  args: Record<string, RuntimeV2JsonValue>,
  stdout: string,
  durationMs: number,
): void {
  const message = appendMockMessage(db, session, "tool", "", runId);
  session.messages[session.messages.length - 1] = {
    ...message,
    tool: {
      name: "bash",
      args,
      result: {
        status: "completed",
        summary: `Bash completed in ${durationMs}ms (exit 0, sandboxed=true).`,
        modelOutput: [{ type: "text", text: stdout }],
        detail: [{ label: "environment", value: { sandboxed: true } }],
      },
    },
  };
}

export function scriptExecutionScenario({ db }: MockClock): MockHandlers | void {
  const session = seedSession(db, {
    title: "导出 PDF 表格",
    minutesAgo: 3,
    turns: [["把 reports/q3.pdf 里的表格都导出成一个 xlsx。", null]],
  });
  const first = lastRunId(session);
  appendMockMessage(db, session, "assistant", "用随包的 Python 读 PDF 表格，直接写成 xlsx。", first);
  appendTool(db, session, first, { command: INLINE_COMMAND, intent: "提取 PDF 表格到 xlsx" }, "saved 86 rows", 1840);
  appendTool(
    db,
    session,
    first,
    { command: "actspace-python scripts/check_xlsx.py reports/q3-tables.xlsx", intent: "校验导出的工作簿" },
    "tables: 86 rows, 6 columns, 4 pages",
    412,
  );
  appendMockMessage(db, session, "assistant", "表格已导出到 `reports/q3-tables.xlsx`，共 4 页 86 行。", first);

  const second = db.nextId("seed-run");
  appendMockMessage(db, session, "user", "再数一下总行数。", second);
  db.pendingApprovals.set(session.id, [
    {
      requestId: "mock-approval-script-1",
      toolName: "bash",
      summary: "统计导出的行数",
      reason: "Allow Bash to run this command once?",
      riskLevel: "medium",
      command: SUMMARY_COMMAND,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60_000,
      recovery: {
        agentRunId: second,
        toolCallId: "mock-tool-call-script-1",
        preview: {
          kind: "bash",
          status: "pending",
          title: "统计导出的行数",
          intent: "统计导出的行数",
          command: SUMMARY_COMMAND,
          sandboxed: true,
        },
      },
    },
  ]);
}
