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
      // 不带 cwd：模型没传 args.cwd 时就在工作区根目录执行，审批卡底栏只显示执行环境。
      preview: { kind: "bash", status: "pending", title: "删除构建产物", intent: "清理构建产物", command, sandboxed: false },
    },
  }]);
}

/** Explicit demo boundary for the backend-owned prefix suggestion. */
export function approvalPrefixScenario(clock: MockClock): MockHandlers | void {
  approvalPendingScenario(clock);
  for (const [sessionId, requests] of clock.db.pendingApprovals) {
    clock.db.pendingApprovals.set(sessionId, requests.map(request => ({
      ...request, command: "pnpm test", summary: "运行项目测试",
      grantSuggestions: [{ suggestionId: "mock-prefix-1", action: "process.execute", access: "execute", lifetime: "session",
        selector: { kind: "command_prefix", prefix: ["pnpm"], cwdRoot: "/mock/workspace" },
        audience: { pluginId: "actspace.shell-tools", permissionDomain: "bash", policyVersion: 1 },
        label: "允许当前会话在当前工作区内运行符合规则的 pnpm 命令，包括项目脚本；执行环境沿用现有设置" }],
      recovery: request.recovery ? { ...request.recovery, preview: { kind: "bash", status: "pending", title: "运行项目测试", intent: "运行项目测试", command: "pnpm test", sandboxed: false } } : undefined,
    })));
  }
}
