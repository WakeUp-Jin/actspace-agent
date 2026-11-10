import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { requireSession } from "../mock-db";
import { lastRunId, seedSession } from "./seed";
import { appendEdit, appendPresent, appendReply, appendTool, created, edited, PRICING } from "./turn-deliverables";

const TASK = "把登录页的表单校验补完，跑一下测试。";
const COMMAND = "pnpm test";
const TEST_OUTPUT = [
  " ✓ src/lib/validate.test.ts (11 tests) 18ms",
  " ✓ src/pages/Login.test.tsx (7 tests) 96ms",
  "",
  " Test Files  2 passed (2)",
  "      Tests  18 passed (18)",
].join("\n");

/** 任务提交之前：侧栏里只有两条旧会话，用来截「新建会话、输入任务」的画面。 */
export function promoDraftScenario({ db }: MockClock): MockHandlers | void {
  seedSession(db, { title: "整理季度报告", minutesAgo: 180, turns: [["把季度数据整理成报告。", "报告已经写好，放在 docs/report.md。"]] });
  seedSession(db, { title: "排查导出脚本的空行", minutesAgo: 95, turns: [["导出的 CSV 里为什么有空行？", "导出前没有过滤空记录，已经补上。"]] });
}

/**
 * 演示用的一条完整任务：Agent 读代码、改了三个文件，停在 `pnpm test` 的审批上；点「运行」后收尾，
 * 出现轮尾的改动卡、交付卡和用量胶囊。`apps/promo-video` 的 `capture:ui` 按这个场景截图。
 */
export function promoDemoScenario(clock: MockClock): MockHandlers | void {
  const { db } = clock;
  promoDraftScenario(clock);
  const session = seedSession(db, { title: "补完登录页表单校验", minutesAgo: 1, turns: [[TASK, null]] });
  const run = lastRunId(session);

  appendTool(db, session, run, "read_file", { path: "src/pages/Login.tsx" }, { status: "completed", summary: "Read src/pages/Login.tsx", modelOutput: [{ type: "text", text: "Read src/pages/Login.tsx" }] });
  appendEdit(db, session, run, created("src/lib/validate.ts", [
    "export function validateEmail(value: string): string | null {",
    "  if (!value.trim()) return \"请输入邮箱\";",
    "  return /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(value) ? null : \"邮箱格式不正确\";",
    "}",
    "",
    "export function validatePassword(value: string): string | null {",
    "  if (value.length < 8) return \"密码至少 8 位\";",
    "  return /\\d/.test(value) ? null : \"密码需要包含数字\";",
    "}",
  ]));
  appendEdit(db, session, run, edited("src/pages/Login.tsx", 24, "async function handleSubmit() {", ["  await login(form);"], [
    "  const errors = { email: validateEmail(form.email), password: validatePassword(form.password) };",
    "  setErrors(errors);",
    "  if (errors.email || errors.password) return;",
    "  await login(form);",
  ]));
  appendEdit(db, session, run, created("src/lib/validate.test.ts", [
    "import { expect, it } from \"vitest\";",
    "import { validateEmail, validatePassword } from \"./validate\";",
    "",
    "it(\"rejects an empty email\", () => {",
    "  expect(validateEmail(\"\")).toBe(\"请输入邮箱\");",
    "});",
    "",
    "it(\"requires a digit in the password\", () => {",
    "  expect(validatePassword(\"abcdefgh\")).toBe(\"密码需要包含数字\");",
    "});",
  ]));

  const requestId = "promo-approval-1";
  const toolCallId = "promo-tool-call-1";
  db.pendingApprovals.set(session.id, [{
    requestId,
    toolName: "bash",
    summary: "运行项目测试",
    reason: "命令会在真实环境中执行。",
    riskLevel: "medium",
    command: COMMAND,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60_000,
    grantSuggestions: [{
      suggestionId: "promo-prefix-1", action: "process.execute", access: "execute", lifetime: "session",
      selector: { kind: "command_prefix", prefix: ["pnpm"], cwdRoot: "/mock/workspace" },
      audience: { pluginId: "actspace.shell-tools", permissionDomain: "bash", policyVersion: 1 },
      label: "允许当前会话在当前工作区内运行符合规则的 pnpm 命令，包括项目脚本；执行环境沿用现有设置",
    }],
    recovery: {
      agentRunId: run,
      toolCallId,
      preview: { kind: "bash", status: "pending", title: "运行项目测试", intent: "运行项目测试", command: COMMAND, sandboxed: false },
    },
  }]);

  return {
    approvals: {
      submit: async ({ requestId: submitted, decision }) => {
        const pending = db.pendingApprovals.get(session.id) ?? [];
        if (submitted !== requestId || pending.length === 0) return { ok: false, reason: "审批请求不存在或已处理。" };
        db.pendingApprovals.set(session.id, []);
        clock.emit("agentStream", { type: "tool_approval_resolved", sessionId: session.id, agentRunId: run, toolCallId, requestId, decision });
        const current = requireSession(db, session.id);
        if (decision === "deny") {
          appendReply(db, current, run, "没有运行测试。校验已经补完，改动列在下面。", { inputTokens: 9_420, outputTokens: 1_310, cacheReadTokens: 41_280, cacheWriteTokens: 0, reasoningTokens: 0 });
        } else {
          appendTool(db, current, run, "bash", { command: COMMAND }, { status: "completed", summary: "Bash completed in 2.4s (exit 0, sandboxed=false).", modelOutput: [{ type: "text", text: TEST_OUTPUT }] });
          appendPresent(db, current, run, [{ path: "src/lib/validate.ts", description: "邮箱和密码的校验函数" }]);
          appendReply(db, current, run, "邮箱和密码的校验补完了，18 个测试全部通过。", { inputTokens: 12_846, outputTokens: 2_274, cacheReadTokens: 58_368, cacheWriteTokens: 0, reasoningTokens: 640, cost: 0.0068, costCurrency: "USD", costProvenance: PRICING });
        }
        const last = current.messages[current.messages.length - 1];
        clock.emit("agentStream", { type: "agent_run_finished", sessionId: session.id, agentRunId: run, resultEventIds: [last.id] });
        return { ok: true };
      },
    },
  };
}
