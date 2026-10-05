import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { lastRunId, seedSession } from "./seed";

/** 待审批：会话停在一条 bash 命令的审批上，刷新后由 `approvals.listPending` 恢复。 */
export function approvalPendingScenario({ db }: MockClock): MockHandlers | void {
  const session = seedSession(db, { title: "清理构建产物", minutesAgo: 2, turns: [["把 apps/desktop 的构建产物清掉，然后重新构建。", null]] });
  const command = "rm -rf apps/desktop/dist apps/desktop/dist-electron";
  db.pendingApprovals.set(session.id, [{
    requestId: "mock-approval-1",
    toolName: "bash",
    summary: "删除构建产物目录",
    reason: "命令会删除工作区内的文件。",
    riskLevel: "high",
    command,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60_000,
    recovery: {
      agentRunId: lastRunId(session),
      toolCallId: "mock-tool-call-1",
      preview: { kind: "bash", status: "pending", title: "删除构建产物", command, cwd: db.bootstrap.workspaceRoot },
    },
  }]);
}
