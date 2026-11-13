import { projectSubagentItems, projectSubagentTranscript } from "@actspace/client/sessions";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { appendMockMessage, createMockSession, journal, snapshot, type MockDb, type MockRawEvent, type MockSession } from "../mock-db";
import { seedSession, lastRunId } from "./seed";

/**
 * 子智能体：一个父会话里有同步探索（已结束）、运行中收到主会话消息的 Fork、跑完的 Codex、用 task_stop 停掉的通用子智能体、
 * 应用退出时中断（lost）的通用子智能体、仍在后台运行的通用子智能体。每个子智能体只跑一次，结束即关闭；后台的登记在后台任务登记表里，
 * 结束时发 `<task_notification>`。用来看对话卡片、发消息 / 停止行、完成与来信通知、右侧「子 Agent」列表与详情，
 * 以及父轨迹里的 `agent` 行和子会话自己的轨迹（Fork 只看分出之后的部分）。
 */

const SRC = "pi/packages/durable/src";
const AT = "2026-10-06T08:59:00.000Z";
// 激活的开始 / 结束时间按打开页面时往前推，列表和顶部栏的耗时才像真的（运行中的从现在往前算）。
const SEED = Date.now() - 30 * 60_000;
const at = (seconds: number) => new Date(SEED + seconds * 1000).toISOString();
const EXPLORE = "mock-subagent-durable";
const FORK = "mock-subagent-fork";
const WAL = "mock-subagent-wal";
const BENCH = "mock-subagent-bench";
const SCRIPT = "mock-subagent-script";
const CODEX = "codex-019a4f2e";
const transcript = (agentId: string) => `/Users/demo/Library/Application Support/ActSpace/sessions/${agentId}/transcript.md`;
const CODEX_LOG = "/Users/demo/.codex/sessions/2026/10/06/rollout-2026-10-06T08-59-00-019a4f2e.jsonl";

function appendTool(db: MockDb, session: MockSession, runId: string, name: string, args: Record<string, RuntimeV2JsonValue>, text: string, during?: (callId: string) => MockRawEvent[]): string {
  const message = appendMockMessage(db, session, "tool", "", runId);
  session.messages[session.messages.length - 1] = { ...message, tool: { name, args, result: { status: "completed", summary: text, modelOutput: [{ type: "text", text }] }, ...(during ? { during } : {}) } };
  return message.id;
}

/** 只有原始事件、没有正文的占位消息。 */
function appendEvents(db: MockDb, session: MockSession, runId: string, events: MockRawEvent[]): void {
  const message = appendMockMessage(db, session, "tool", "", runId);
  session.messages[session.messages.length - 1] = { ...message, events };
}

const read = (db: MockDb, session: MockSession, runId: string, path: string) =>
  appendTool(db, session, runId, "read_file", { path: `${SRC}/${path}` }, `Read ${SRC}/${path}`);

type Spawn = { agentId: string; kind: "local" | "fork" | "codex"; preset?: "general" | "explore"; description: string; transcriptPath: string; inheritedThroughSeq?: number };
function spawned(callId: string, spawn: Spawn): MockRawEvent {
  return { type: "subagent/spawned", data: { ...spawn, callId, createdAt: AT } };
}
function start(callId: string, agentId: string, activationId: string, startedAt: string, extra: { background?: boolean; model?: string } = {}): MockRawEvent {
  const { background = false, ...rest } = extra;
  return { type: "subagent/activation", data: { op: "start", agentId, activationId, callId, trigger: "spawn", background, startedAt, ...rest } };
}
function settle(agentId: string, activationId: string, endedAt: string, status: "completed" | "interrupted" | "lost", delivery: "returned" | "notified" | "stopped" | "lost", summary: string, result?: string): MockRawEvent {
  return { type: "subagent/activation", data: { op: "settle", agentId, activationId, status, delivery, summary, endedAt, ...(result ? { result } : {}) } };
}
/** 后台子智能体在登记表里的开始 / 结束（task id 就是 agent id）。 */
function taskStart(callId: string, agentId: string, description: string, startedAt: string, transcriptPath = transcript(agentId)): MockRawEvent {
  return { type: "background/task", data: { op: "start", taskId: agentId, kind: "agent", callId, description, transcriptPath, startedAt } };
}
function taskSettle(agentId: string, status: "completed" | "stopped" | "lost", delivery: "notified" | "stopped" | "lost", endedAt: string): MockRawEvent {
  return { type: "background/task", data: { op: "settle", taskId: agentId, status, delivery, endedAt } };
}
/** settle 的 summary 是给模型看的英文句子（与 `@actspace/subagent` 的 settleSummary 一致）。 */
const finished = (agentId: string) => `Subagent ${agentId} finished.`;
const stopped = (agentId: string) => `Subagent ${agentId} was stopped before it finished.`;
const STARTED_TAIL = "You will be notified when it finishes. Use send_message only to give it information it is missing; task_stop stops it.";
const EXTERNAL_TAIL = "You will be notified when it finishes. task_stop stops it.";
/** 下一轮开头领取一条收件箱通知：后台子智能体结束走 `task_notification`，来信走 `agent_message`。 */
function claim(messageId: string, source: "task_notification" | "agent_message", notice: { taskId: string; kind: "subagent" | "agent_message"; title: string; status: string }, content: string): MockRawEvent {
  return { type: "agent/inbox/spliced", data: { operation: "claim", messageId, target: "next-step", source, notice, opensTurn: true, content: content }, surface: { kind: "append" } };
}
/** 登记表的结束通知（与 `@actspace/background-tasks` 的 renderTaskNotification 一致）；`closing` 为空时没有结论段（lost）。 */
function notification(agentId: string, description: string, status: string, summary: string, closing?: string, transcriptPath = transcript(agentId)): string {
  return ["<task_notification>", `<task_id>${agentId}</task_id>`, "<kind>agent</kind>", `<description>${description}</description>`, `<status>${status}</status>`, `<summary>${summary}</summary>`, `<transcript>${transcriptPath}</transcript>`, ...(closing === undefined ? [] : ["<closing_message>", closing, "</closing_message>"]), "</task_notification>"].join("\n");
}

function child(db: MockDb, parent: MockSession, id: string, title: string): MockSession {
  const session = createMockSession(db, { id, title, updatedAt: parent.updatedAt });
  session.parentSessionId = parent.id;
  return session;
}

function seedExplore(db: MockDb, parent: MockSession): void {
  const session = child(db, parent, EXPLORE, "查看 durable 存储层");
  const run = db.nextId("seed-run");
  appendMockMessage(db, session, "user", `阅读 ${SRC} 下的 session 与 storage 模块，说明事务提交流程和 SQLite 表结构，结论用中文。`, run);
  appendMockMessage(db, session, "assistant", "I'll list the source directory first to see how session/ and storage/ are laid out.", run);
  appendTool(db, session, run, "list_directory", { path: SRC }, `Listed ${SRC}`);
  appendTool(db, session, run, "glob", { pattern: "**/*.ts", path: SRC }, "Found 81 files");
  appendMockMessage(db, session, "assistant", "Reading session.ts and transaction.ts to trace commit/prepare.", run);
  read(db, session, run, "session/session.ts");
  read(db, session, run, "session/transaction.ts");
  read(db, session, run, "session/observation.ts");
  appendMockMessage(db, session, "assistant", "Now the storage layer: migrations define the tables.", run);
  read(db, session, run, "storage/sqlite/migrations.ts");
  appendTool(db, session, run, "grep", { pattern: "^(export )?(class|function)", path: SRC }, "Found 48 matches");
  appendMockMessage(db, session, "assistant", EXPLORE_RESULT, run);
}

const EXPLORE_RESULT = "结论：Session 通过 Transaction 先 **prepare**（校验、排序）再 **commit**（单个 SQLite 事务写入 entries）；`forks` 表记录分叉点，`documents` 表保存文档快照。";
const FORK_NOTE = "prepare 只读，commit 在一个 SQLite 事务里写 entries 再推进 head。`observation.ts` 好像在 commit 之前就通知订阅者，接着确认。";
const FORK_RESULT = "提交顺序没问题，唯一的风险是 `observation.ts` 在 commit 之前就通知订阅者。`notifyObservers` 改到 commit 之后即可，改动只涉及 `session/transaction.ts` 一处。";
// mock 里父会话的 agent id（子智能体来信与收信的对象）。
const PARENT_ID = "mock-parent";
const CODEX_RESULT = "已把 `storage/sqlite` 迁到新的 `StorageAdapter` 接口：\n\n- `SqliteStore` 实现 `read` / `append` / `fork`\n- 旧的 `openDatabase` 保留为薄包装\n- `pnpm test` 通过（42 个用例）";

/** Fork 子会话：开头是复制来的父会话消息，之后是它自己的一次运行；运行中读到主会话补充的问题。 */
function seedFork(db: MockDb, parent: MockSession, inherited: number): void {
  const session = child(db, parent, FORK, "复核事务提交顺序");
  session.messages.push(...parent.messages.slice(0, inherited));
  session.forkInheritedMessages = inherited;
  const first = db.nextId("seed-run");
  appendMockMessage(db, session, "user", "复核 Transaction 的 prepare / commit 顺序，看订阅者会不会读到未提交的 entry。", first);
  read(db, session, first, "session/transaction.ts");
  read(db, session, first, "session/observation.ts");
  appendMockMessage(db, session, "assistant", FORK_NOTE, first);
  // 主会话的消息在下一步开头读到（轮内，不开新一轮）。
  appendEvents(db, session, first, [{ type: "agent/inbox/spliced", data: { operation: "claim", messageId: "fork-parent-message", target: "next-step", source: "agent_message", notice: { taskId: PARENT_ID, kind: "agent_message", title: "主会话", status: "message" }, opensTurn: false, content: `<agent_message from="${PARENT_ID}" relation="parent">\n如果把通知挪到 commit 之后，要改哪些地方？\n</agent_message>` }, surface: { kind: "append" } }]);
  appendTool(db, session, first, "grep", { pattern: "notifyObservers", path: SRC }, "Found 2 matches");
  appendTool(db, session, first, "send_message", { agent_id: PARENT_ID, message: "只需要改 session/transaction.ts 一处，我先确认没有别的调用方。" }, `Message delivered to ${PARENT_ID} (running; it will see it at its next step).`);
  appendMockMessage(db, session, "assistant", FORK_RESULT, first);
}

function seedWal(db: MockDb, parent: MockSession): void {
  const session = child(db, parent, WAL, "调研 WAL 模式");
  const run = db.nextId("seed-run");
  appendMockMessage(db, session, "user", "调研 SQLite WAL 模式对 durable 并发写入的影响。", run);
  appendMockMessage(db, session, "assistant", "先看 storage 层怎么打开数据库。", run);
  read(db, session, run, "storage/sqlite/open.ts");
}

function seedScript(db: MockDb, parent: MockSession): void {
  const session = child(db, parent, SCRIPT, "整理迁移脚本");
  const run = db.nextId("seed-run");
  appendMockMessage(db, session, "user", "把 storage/sqlite/migrations.ts 里的迁移拆成按版本号的独立文件。", run);
  appendMockMessage(db, session, "assistant", "先读现有迁移，按版本号列出来。", run);
  read(db, session, run, "storage/sqlite/migrations.ts");
}

function seedBench(db: MockDb, parent: MockSession): void {
  const session = child(db, parent, BENCH, "压测 SQLite 写入");
  const run = db.nextId("seed-run");
  appendMockMessage(db, session, "user", "写一个小脚本压测 entries 的追加写入，报告每秒写入条数。", run);
  appendMockMessage(db, session, "assistant", "先写压测脚本，再分别跑 1、4、8 个并发写入者。", run);
  appendTool(db, session, run, "write_file", { path: "bench/append.ts" }, "Wrote bench/append.ts");
}

const MOCK_TOKENS: Record<string, number> = { [EXPLORE]: 18_420, [FORK]: 41_300, [WAL]: 6_820, [SCRIPT]: 12_630, [BENCH]: 3_410 };
// 真实 Host 的动态来自子智能体的实时事件（主进程内存）；mock 按打开页面后的秒数轮换几句。
const MOCK_ACTIVITY = ["正在读取 · bench/append.ts", "正在执行 · node bench/append.ts --writers 4", "正在分析 · 刚执行 node bench/append.ts", "正在整理回复"];
const MOCK_OPENED = Date.now();
// 压测子智能体在打开页面后第 8 秒来信一次（列表第二行先显示「来信：」，6 秒后恢复动态）。
const BENCH_MESSAGE_AT = new Date(MOCK_OPENED + 8_000).toISOString();

export function subagentTrajectoryScenario({ db }: MockClock): MockHandlers {
  const parent = seedSession(db, { title: "查看pi-durable设计", minutesAgo: 1, turns: [["帮我看一下 pi-durable 的设计，重点是会话事务和存储层。", null]] });
  const first = lastRunId(parent);
  appendMockMessage(db, parent, "assistant", "先看包结构，再把 session / storage 的细读交给一个探索子智能体。", first);
  appendTool(db, parent, first, "bash", { command: `ls ${SRC}` }, "Bash completed in 18ms (exit 0, sandboxed=true).");
  seedExplore(db, parent);
  appendTool(db, parent, first, "agent", { description: "查看 durable 存储层", prompt: `阅读 ${SRC} 下的 session 与 storage 模块……`, agent_preset: "explore" },
    `Subagent ${EXPLORE} (查看 durable 存储层) finished.\ntranscript: ${transcript(EXPLORE)}\n\n${EXPLORE_RESULT}`,
    (callId) => [spawned(callId, { agentId: EXPLORE, kind: "local", preset: "explore", description: "查看 durable 存储层", transcriptPath: transcript(EXPLORE) }), start(callId, EXPLORE, "act-1", at(0), { model: "claude-sonnet-5-5" }), settle(EXPLORE, "act-1", at(38), "completed", "returned", finished(EXPLORE), EXPLORE_RESULT)]);

  // Fork 从这里分出：复制到此为止的父会话消息。
  const inherited = parent.messages.length;
  const forkBoundary = journal(parent).length - 1;
  seedFork(db, parent, inherited);
  appendTool(db, parent, first, "agent_fork", { description: "复核事务提交顺序", prompt: "复核 Transaction 的 prepare / commit 顺序……", background: true },
    `Started forked subagent ${FORK} (复核事务提交顺序) in the background.\ntranscript: ${transcript(FORK)}\n${STARTED_TAIL}`,
    (callId) => [spawned(callId, { agentId: FORK, kind: "fork", description: "复核事务提交顺序", transcriptPath: transcript(FORK), inheritedThroughSeq: forkBoundary }), start(callId, FORK, "act-1", at(60), { background: true, model: "deepseek/deepseek-v4-pro" }), taskStart(callId, FORK, "复核事务提交顺序", at(60))]);
  appendTool(db, parent, first, "agent_codex", { description: "迁移 storage 到新接口", prompt: "把 storage/sqlite 迁到 StorageAdapter 接口并跑测试。", background: true },
    `Started Codex subagent ${CODEX} (迁移 storage 到新接口) in the background.\ntranscript: ${CODEX_LOG}\n${EXTERNAL_TAIL}`,
    (callId) => [spawned(callId, { agentId: CODEX, kind: "codex", description: "迁移 storage 到新接口", transcriptPath: CODEX_LOG }), start(callId, CODEX, "act-1", at(62), { background: true, model: "gpt-5.5-codex" }), taskStart(callId, CODEX, "迁移 storage 到新接口", at(62), CODEX_LOG)]);
  seedWal(db, parent);
  appendTool(db, parent, first, "agent", { description: "调研 WAL 模式", prompt: "调研 SQLite WAL 模式……", agent_preset: "general", background: true },
    `Started subagent ${WAL} (调研 WAL 模式) in the background.\ntranscript: ${transcript(WAL)}\n${STARTED_TAIL}`,
    (callId) => [spawned(callId, { agentId: WAL, kind: "local", preset: "general", description: "调研 WAL 模式", transcriptPath: transcript(WAL) }), start(callId, WAL, "act-1", at(64), { background: true, model: "claude-sonnet-5-5" }), taskStart(callId, WAL, "调研 WAL 模式", at(64))]);
  seedScript(db, parent);
  appendTool(db, parent, first, "agent", { description: "整理迁移脚本", prompt: "把 storage/sqlite/migrations.ts 里的迁移拆成按版本号的独立文件。", agent_preset: "general", background: true },
    `Started subagent ${SCRIPT} (整理迁移脚本) in the background.\ntranscript: ${transcript(SCRIPT)}\n${STARTED_TAIL}`,
    (callId) => [spawned(callId, { agentId: SCRIPT, kind: "local", preset: "general", description: "整理迁移脚本", transcriptPath: transcript(SCRIPT) }), start(callId, SCRIPT, "act-1", at(66), { background: true, model: "claude-sonnet-5-5" }), taskStart(callId, SCRIPT, "整理迁移脚本", at(66))]);
  // Fork 还在跑：主会话补一个问题给它（只补充信息，不催它交结果）。
  appendTool(db, parent, first, "send_message", { agent_id: FORK, message: "如果把通知挪到 commit 之后，要改哪些地方？" },
    `Message delivered to ${FORK} (running; it will see it at its next step).`);
  appendMockMessage(db, parent, "assistant", "探索结果已经回来了。Fork、Codex、WAL 调研和迁移脚本整理在后台进行，完成后我会收到通知。", first);

  // 应用在这之后退出过：重开时还在跑的「整理迁移脚本」由登记表记为 lost，并通知主会话。
  const lostSummary = `Subagent ${SCRIPT} (整理迁移脚本) was interrupted because the app exited. Its transcript shows how far it got; start a new subagent if the work still needs doing.`;
  const restarted = db.nextId("seed-run");
  appendEvents(db, parent, restarted, [
    taskSettle(SCRIPT, "lost", "lost", at(600)),
    settle(SCRIPT, "act-1", at(600), "lost", "lost", lostSummary),
    claim("notice-script-lost", "task_notification", { taskId: SCRIPT, kind: "subagent", title: "整理迁移脚本", status: "lost" }, notification(SCRIPT, "整理迁移脚本", "lost", lostSummary)),
  ]);
  appendMockMessage(db, parent, "assistant", "迁移脚本整理因为应用退出中断了，先放着，等其他结果回来再决定要不要重新派一个。", restarted);

  // 第 2 轮：Fork 运行中来信唤醒主会话；WAL 调研已经不需要，用 task_stop 停掉，改为直接压测写入。
  const second = db.nextId("seed-run");
  appendEvents(db, parent, second, [
    claim("notice-fork-message", "agent_message", { taskId: FORK, kind: "agent_message", title: "复核事务提交顺序", status: "message" }, `<agent_message from="${FORK}" relation="child">\n只需要改 session/transaction.ts 一处，我先确认没有别的调用方。\n</agent_message>`),
  ]);
  appendTool(db, parent, second, "task_stop", { taskId: WAL, reason: "改为直接压测写入" }, `task_id: ${WAL}\nkind: agent\nstatus: stopped\ndescription: 调研 WAL 模式\nstarted_at: ${at(64)}\ntranscript: ${transcript(WAL)}\nended_at: ${at(170)}`,
    () => [settle(WAL, "act-1", at(170), "interrupted", "stopped", stopped(WAL)), taskSettle(WAL, "stopped", "stopped", at(170))]);
  seedBench(db, parent);
  appendTool(db, parent, second, "agent", { description: "压测 SQLite 写入", prompt: "写一个小脚本压测 entries 的追加写入……", agent_preset: "general", background: true },
    `Started subagent ${BENCH} (压测 SQLite 写入) in the background.\ntranscript: ${transcript(BENCH)}\n${STARTED_TAIL}`,
    (callId) => { const startedAt = new Date(Date.now() - 72_000).toISOString(); return [spawned(callId, { agentId: BENCH, kind: "local", preset: "general", description: "压测 SQLite 写入", transcriptPath: transcript(BENCH) }), start(callId, BENCH, "act-1", startedAt, { background: true, model: "claude-sonnet-5-5" }), taskStart(callId, BENCH, "压测 SQLite 写入", startedAt)]; });
  appendMockMessage(db, parent, "assistant", "Fork 确认只需改一处，等它的结论；WAL 调研先停掉，改为直接压测写入。", second);

  // 第 3 轮：Fork 和 Codex 先后跑完，各发一条结束通知。
  const third = db.nextId("seed-run");
  appendEvents(db, parent, third, [
    settle(FORK, "act-1", at(961), "completed", "notified", finished(FORK), FORK_RESULT),
    taskSettle(FORK, "completed", "notified", at(961)),
    claim("notice-fork", "task_notification", { taskId: FORK, kind: "subagent", title: "复核事务提交顺序", status: "completed" }, notification(FORK, "复核事务提交顺序", "completed", finished(FORK), FORK_RESULT)),
    settle(CODEX, "act-1", at(287), "completed", "notified", finished(CODEX), CODEX_RESULT),
    taskSettle(CODEX, "completed", "notified", at(287)),
    claim("notice-codex", "task_notification", { taskId: CODEX, kind: "subagent", title: "迁移 storage 到新接口", status: "completed" }, notification(CODEX, "迁移 storage 到新接口", "completed", finished(CODEX), CODEX_RESULT, CODEX_LOG)),
  ]);
  appendMockMessage(db, parent, "assistant", "pi-durable 把会话写成追加式事件日志：事务分 prepare / commit 两段，SQLite 里 entries 与 forks 两张主表。通知时机只需改 `session/transaction.ts` 一处；Codex 已完成 storage 接口迁移，压测还在跑。", third);

  return {
    sessions: {
      // 真实 Host 从子会话快照读 token；mock 子会话没有用量，按 id 给固定值（外部子智能体没有）。
      getSubagents: async ({ sessionId }) => {
        if (sessionId !== parent.id) return [];
        const now = Date.now();
        const activity = MOCK_ACTIVITY[Math.floor((now - MOCK_OPENED) / 3000) % MOCK_ACTIVITY.length];
        return projectSubagentItems(journal(parent)).map((item) => ({
          ...item,
          ...(MOCK_TOKENS[item.agentId] ? { totalTokens: MOCK_TOKENS[item.agentId] } : {}),
          ...(item.status === "running" && item.agentId === BENCH ? { activity } : {}),
          ...(item.agentId === BENCH && now >= Date.parse(BENCH_MESSAGE_AT) ? { lastMessage: { text: "单写入者约 4.2 万条/秒，4 个并发时降到 1.1 万，正在跑 8 个。", at: BENCH_MESSAGE_AT } } : {}),
        }));
      },
      getSubAgentTranscript: async ({ transcriptRef }) => {
        const session = db.sessions.get(transcriptRef.runId);
        if (!session) return [];
        const events = journal(session);
        return projectSubagentTranscript(snapshot(session, events.length - 1), events);
      },
      interruptSubagent: async ({ sessionId, agentId }) => {
        const running = sessionId === parent.id && projectSubagentItems(journal(parent)).find((item) => item.agentId === agentId)?.status === "running";
        if (!running) return { ok: false, message: "这个子智能体没有在运行。" };
        const endedAt = new Date().toISOString();
        appendEvents(db, parent, lastRunId(parent), [settle(agentId, "act-1", endedAt, "interrupted", "stopped", stopped(agentId)), taskSettle(agentId, "stopped", "stopped", endedAt)]);
        return { ok: true, message: `Stopped subagent ${agentId}.` };
      },
      revealSubagentRecord: async () => ({ ok: true }),
    },
  };
}
